import crypto from 'node:crypto';

/**
 * Standard notification HMAC (Checkout/Notification webhooks).
 * Signature travels in additionalData.hmacSignature on each NotificationRequestItem.
 * Payload is 8 fields, colon-delimited, empty string for missing values.
 * Ref: https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures
 */
export function verifyStandardHmac(notificationItem, hmacKeyHex) {
  const amount = notificationItem.amount || {};
  const fields = [
    notificationItem.pspReference,
    notificationItem.originalReference,
    notificationItem.merchantAccountCode,
    notificationItem.merchantReference,
    amount.value,
    amount.currency,
    notificationItem.eventCode,
    notificationItem.success,
  ].map((v) => (v === undefined || v === null ? '' : String(v)));

  const payload = fields.join(':');
  const received = notificationItem.additionalData && notificationItem.additionalData.hmacSignature;
  if (!received) return false;

  const expected = signHmac(payload, hmacKeyHex);
  return timingSafeEqualBase64(expected, received);
}

/**
 * Recurring tokenisation lifecycle webhook HMAC.
 * Signature travels in the `hmacsignature` request header, computed over the raw request body.
 * Ref: https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures
 */
export function verifyTokenisationHmac(rawBody, headerSignature, hmacKeyHex) {
  if (!headerSignature) return false;
  const expected = signHmac(rawBody, hmacKeyHex);
  return timingSafeEqualBase64(expected, headerSignature);
}

function signHmac(payload, hmacKeyHex) {
  const keyBinary = Buffer.from(hmacKeyHex, 'hex');
  return crypto.createHmac('sha256', keyBinary).update(payload, 'utf8').digest('base64');
}

function timingSafeEqualBase64(a, b) {
  const bufA = Buffer.from(a, 'base64');
  const bufB = Buffer.from(b, 'base64');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
