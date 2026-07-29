import express from 'express';
import { verifyStandardHmac, verifyTokenisationHmac } from './hmac.js';
import { recordWebhookEvent } from '../store/webhookEvents.js';
import { logWebhook, logger } from '../logging/logger.js';
import { getOrderByReference, markAuthorised, markRefused, markError } from '../store/orders.js';

// Candidate header names for the tokenisation webhook signature.
// Docs are inconsistent on the exact name; confirmed value goes in BUILD_LOG.md
// once a real test webhook has been observed, and this list is trimmed then.
const TOKENISATION_SIGNATURE_HEADER_CANDIDATES = [
  'hmacsignature',
  'x-adyen-webhook-hmac-sha256',
];

function findTokenisationSignatureHeader(headers) {
  for (const name of TOKENISATION_SIGNATURE_HEADER_CANDIDATES) {
    if (headers[name]) return { name, value: headers[name] };
  }
  return null;
}

export function createWebhookRouter({ env }) {
  const router = express.Router();

  // Raw body required: HMAC is computed over the exact bytes Adyen sent.
  router.post(
    '/adyen',
    express.raw({ type: '*/*' }),
    (req, res) => {
      const rawBody = req.body.toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(rawBody);
      } catch (err) {
        logger.warn('webhook.invalid_json', { error: err.message });
        return res.status(400).end();
      }

      const tokenisationHeader = findTokenisationSignatureHeader(req.headers);
      const isTokenisationEvent = typeof parsed.type === 'string' && parsed.type.startsWith('recurring.');

      if (isTokenisationEvent) {
        return handleTokenisationEvent({ req, res, rawBody, parsed, tokenisationHeader, env });
      }

      return handleStandardNotification({ res, parsed, env });
    },
  );

  return router;
}

function handleStandardNotification({ res, parsed, env }) {
  const items = parsed.notificationItems || [];
  if (items.length === 0) {
    logger.warn('webhook.no_items', {});
    return res.status(400).end();
  }

  for (const wrapper of items) {
    const item = wrapper.NotificationRequestItem || wrapper;
    const valid = verifyStandardHmac(item, env.adyenHmacKeyStandard);

    if (!valid) {
      logWebhook({
        eventCode: item.eventCode,
        identifier: item.pspReference,
        hmacResult: 'invalid',
        outcome: 'rejected',
      });
      return res.status(401).end();
    }
  }

  for (const wrapper of items) {
    const item = wrapper.NotificationRequestItem || wrapper;
    const dedupeKey = `${item.eventCode}:${item.pspReference}:${item.originalReference || ''}`;
    const { inserted } = recordWebhookEvent({
      dedupeKey,
      eventCode: item.eventCode,
      rawPayload: JSON.stringify(wrapper),
    });

    logWebhook({
      eventCode: item.eventCode,
      identifier: item.pspReference,
      hmacResult: 'valid',
      outcome: inserted ? 'stored' : 'duplicate_ignored',
    });

    // Business-state processing runs only on first delivery, never on a redelivery,
    // per prd.md's "deduplicate before processing" rule.
    if (inserted && item.eventCode === 'AUTHORISATION') {
      processAuthorisationEvent(item);
    }
  }

  return res.status(202).end();
}

function processAuthorisationEvent(item) {
  const orderReference = item.merchantReference;
  const order = orderReference ? getOrderByReference(orderReference) : null;

  if (!order) {
    // Never throw on an unrecognised order reference — log and move on.
    logger.warn('order.webhook_unknown_reference', {
      orderReference,
      pspReference: item.pspReference,
    });
    return;
  }

  const notifiedAmount = item.amount || {};
  const amountMatches = notifiedAmount.value === order.amount;
  const currencyMatches = notifiedAmount.currency === order.currency;

  if (!amountMatches || !currencyMatches) {
    logger.error('order.webhook_amount_mismatch', {
      orderReference,
      pspReference: item.pspReference,
      expected: { amount: order.amount, currency: order.currency },
      received: { amount: notifiedAmount.value, currency: notifiedAmount.currency },
    });
    // Do not confirm on a mismatch — move the order to a visibly failed state
    // rather than silently leaving the prior optimistic state in place.
    markError(orderReference);
    return;
  }

  if (item.success === 'true') {
    // Deliberately unconditional: Drop-in allows the shopper to retry with a
    // different card after a decline within the same session, so a `refused`
    // order must still be able to reach `authorised` on a later webhook.
    markAuthorised(orderReference, {
      pspReference: item.pspReference,
      authorisedAmount: notifiedAmount.value,
    });
  } else {
    // Guarded: a late or out-of-order decline must never downgrade an order
    // that a later, already-processed webhook has confirmed as authorised.
    markRefused(orderReference, { pspReference: item.pspReference });
  }
}

function handleTokenisationEvent({ res, rawBody, parsed, tokenisationHeader, env }) {
  const valid = verifyTokenisationHmac(
    rawBody,
    tokenisationHeader && tokenisationHeader.value,
    env.adyenHmacKeyTokenisation,
  );

  if (!valid) {
    logWebhook({
      eventCode: parsed.type,
      identifier: parsed.eventId,
      hmacResult: 'invalid',
      outcome: 'rejected',
    });
    return res.status(401).end();
  }

  const dedupeKey = parsed.eventId || `notype:${rawBody.length}`;
  const { inserted } = recordWebhookEvent({
    dedupeKey,
    eventCode: parsed.type,
    rawPayload: rawBody,
  });

  logWebhook({
    eventCode: parsed.type,
    identifier: parsed.eventId,
    hmacResult: 'valid',
    outcome: inserted ? 'stored' : 'duplicate_ignored',
  });

  return res.status(202).end();
}
