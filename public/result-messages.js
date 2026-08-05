// Shared copy for Drop-in result codes, used by both checkout.html and the
// return page. Kept honest about what's actually confirmed: the webhook is
// the only thing that finalises an order, so nothing here claims certainty
// beyond what Adyen's client-side result code actually tells us.
//
// Each entry also carries a `tone` (success/danger/warning/neutral) consumed
// by styles.css's .status-message[data-tone] variants, so copy and visual
// treatment are defined in one place and can't drift apart.

const MESSAGES = {
  Authorised: {
    tone: 'success',
    heading: 'Card approved',
    body: "Your card was approved. We're confirming this with Adyen now — your order will be marked as paid once that finishes, usually within a few seconds.",
  },
  Refused: {
    tone: 'danger',
    heading: 'Card declined',
    body: 'Your bank declined this card. Nothing was charged. Try a different card, or check with your bank if this keeps happening.',
  },
  Cancelled: {
    tone: 'neutral',
    heading: 'Payment cancelled',
    body: 'The payment was cancelled before it completed. Nothing was charged.',
  },
  Pending: {
    tone: 'warning',
    heading: 'Payment pending',
    body: "This payment is still being processed by your bank. No action is needed — we'll update your order once it's confirmed.",
  },
  Received: {
    tone: 'warning',
    heading: 'Payment received',
    body: "We've received this payment method and are waiting on confirmation. We'll update your order once that arrives.",
  },
  Error: {
    tone: 'danger',
    heading: 'Something went wrong',
    body: 'We could not process this payment due to a technical error. Nothing was charged. Please try again.',
  },
};

const FALLBACK = (resultCode) => ({
  tone: 'neutral',
  heading: 'Payment status unclear',
  body: `We received a response (${resultCode || 'no code'}) we don't have specific guidance for yet. Your order's final status will still be confirmed separately — check back shortly.`,
});

export function getResultMessage(resultCode) {
  return MESSAGES[resultCode] || FALLBACK(resultCode);
}

// Final, webhook-confirmed copy — distinct from the provisional Drop-in messages
// above. Only shown once polling /orders/:ref actually observes a terminal-for-display
// status, i.e. this is allowed to state things with certainty that the provisional
// messages above deliberately don't.
const ORDER_STATUS_MESSAGES = {
  authorised: {
    tone: 'success',
    heading: 'Payment confirmed',
    body: 'Your payment has been confirmed. Your order is complete.',
  },
  refused: {
    tone: 'danger',
    heading: 'Payment declined',
    body: 'This payment was declined and confirmed as such. Nothing was charged.',
  },
  error: {
    tone: 'danger',
    heading: 'Something needs attention',
    body: "We couldn't reconcile this payment automatically. Nothing further will happen on this page — please contact support with your order reference.",
  },
  abandoned: {
    tone: 'warning',
    heading: 'Checkout timed out',
    body: "This checkout wasn't completed in time. Nothing was charged — you can start again with a new checkout.",
  },
};

export function getOrderStatusMessage(status) {
  return ORDER_STATUS_MESSAGES[status] || null;
}
