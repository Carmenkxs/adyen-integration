// Shared copy for Drop-in result codes, used by both checkout.html and the
// return page. Kept honest about what's actually confirmed: the webhook is
// the only thing that finalises an order, so nothing here claims certainty
// beyond what Adyen's client-side result code actually tells us.

const MESSAGES = {
  Authorised: {
    heading: 'Card approved',
    body: "Your card was approved. We're confirming this with Adyen now — your order will be marked as paid once that finishes, usually within a few seconds.",
  },
  Refused: {
    heading: 'Card declined',
    body: 'Your bank declined this card. Nothing was charged. Try a different card, or check with your bank if this keeps happening.',
  },
  Cancelled: {
    heading: 'Payment cancelled',
    body: 'The payment was cancelled before it completed. Nothing was charged.',
  },
  Pending: {
    heading: 'Payment pending',
    body: "This payment is still being processed by your bank. No action is needed — we'll update your order once it's confirmed.",
  },
  Received: {
    heading: 'Payment received',
    body: "We've received this payment method and are waiting on confirmation. We'll update your order once that arrives.",
  },
  Error: {
    heading: 'Something went wrong',
    body: 'We could not process this payment due to a technical error. Nothing was charged. Please try again.',
  },
};

const FALLBACK = (resultCode) => ({
  heading: 'Payment status unclear',
  body: `We received a response (${resultCode || 'no code'}) we don't have specific guidance for yet. Your order's final status will still be confirmed separately — check back shortly.`,
});

export function getResultMessage(resultCode) {
  return MESSAGES[resultCode] || FALLBACK(resultCode);
}
