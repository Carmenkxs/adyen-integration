import express from 'express';
import { generateOrderReference } from '../domain/orderReference.js';
import { createOrder, getOrderByReference, markSessionOpen } from '../store/orders.js';
import { createShopper, getShopperById } from '../store/shoppers.js';
import { createSession } from '../adyen/client.js';
import { logger } from '../logging/logger.js';

export function createOrdersRouter({ env }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { amount, currency } = req.body || {};

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive integer in minor units' });
    }
    if (!currency || typeof currency !== 'string') {
      return res.status(400).json({ error: 'currency is required' });
    }

    // shopperReference is an opaque internal id, deliberately not derived from
    // email/name — prd.md requires it stay free of personally identifiable information.
    const shopper = createShopper({ shopperReference: generateOrderReference() });
    const orderReference = generateOrderReference();

    createOrder({ orderReference, shopperId: shopper.id, amount, currency });

    logger.info('order.created', { orderReference, amount, currency });
    res.status(201).json({ orderReference });
  });

  // Read-only status check, used by checkout.html to poll for the webhook-confirmed
  // outcome after Drop-in's own (provisional) result. Safe to expose by reference alone:
  // order references are unguessable (crypto.randomUUID), same threat model as the
  // session-fetch endpoint, and this returns status only, no payment details.
  router.get('/:ref', (req, res) => {
    const order = getOrderByReference(req.params.ref);
    if (!order) {
      return res.status(404).json({ error: 'order not found' });
    }
    res.json({ orderReference: order.order_reference, status: order.status });
  });

  router.post('/:ref/session', async (req, res) => {
    const orderReference = req.params.ref;
    const order = getOrderByReference(orderReference);

    if (!order) {
      return res.status(404).json({ error: 'order not found' });
    }

    if (order.status !== 'created' && order.status !== 'session_open') {
      return res.status(409).json({ error: `order is already ${order.status}, cannot open a new session` });
    }

    // Amount and currency always come from the order record itself, never from the
    // request body — the order's amount is fixed at creation and this endpoint has no
    // legitimate reason to accept a client-supplied override. This is what actually
    // guarantees the same order reference can never produce sessions with different
    // amounts, rather than relying on a client to pass matching values.
    const shopperRow = order.shopper_id ? getShopperById(order.shopper_id) : null;

    try {
      const session = await createSession(env, {
        orderReference,
        amount: order.amount,
        currency: order.currency,
        returnUrl: `${env.publicBaseUrl}/orders/${orderReference}/return`,
        shopperReference: shopperRow ? shopperRow.shopper_reference : undefined,
      });

      markSessionOpen(orderReference);

      res.json({
        id: session.id,
        sessionData: session.sessionData,
        clientKey: env.adyenClientKey,
      });
    } catch (err) {
      logger.error('order.session_failed', { orderReference, error: err.message });
      res.status(502).json({ error: 'failed to create Adyen session' });
    }
  });

  router.get('/:ref/return', (req, res) => {
    const orderReference = req.params.ref;
    const order = getOrderByReference(orderReference);

    if (!order) {
      return res.status(404).send('Order not found.');
    }

    res.set('Content-Type', 'text/html').send(renderReturnPage({ env }));
  });

  return router;
}

// Reads sessionId + redirectResult from the URL and calls submitDetails.
// The result shown here is provisional only — order state is set exclusively
// by the webhook handler, never by this page.
function renderReturnPage({ env }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Completing payment</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/vendor/adyen-web/adyen.css">
</head>
<body>
  <main class="page-shell">
    <div class="eyebrow">Shop A — checkout</div>
    <div id="status"><div class="status-message" data-tone="neutral"><p>Finalising your payment...</p></div></div>
  </main>
  <script type="module">
    import { AdyenCheckout } from '/vendor/adyen-web/index.js';
    import { getResultMessage } from '/result-messages.js';

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    const redirectResult = params.get('redirectResult');
    const statusEl = document.getElementById('status');

    function showResult(resultCode) {
      const { tone, heading, body } = getResultMessage(resultCode);
      statusEl.innerHTML = \`<div class="status-message" data-tone="\${tone}"><h2>\${heading}</h2><p>\${body}</p></div>\`;
    }

    if (!sessionId || !redirectResult) {
      statusEl.innerHTML = '<div class="status-message" data-tone="danger"><p>Missing redirect parameters. This page must be reached via an Adyen redirect.</p></div>';
    } else {
      try {
        const checkout = await AdyenCheckout({
          environment: 'test',
          clientKey: ${JSON.stringify(env.adyenClientKey)},
          countryCode: 'AU',
          session: { id: sessionId },
          onPaymentCompleted: (data) => {
            showResult(data.resultCode);
          },
          onPaymentFailed: (data) => {
            showResult(data && data.resultCode);
          },
          onError: (error) => {
            showResult('Error');
            console.error(error);
          },
        });

        checkout.submitDetails({ details: { redirectResult } });
      } catch (err) {
        showResult('Error');
        console.error(err);
      }
    }
  </script>
</body>
</html>`;
}
