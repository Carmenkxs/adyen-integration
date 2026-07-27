const SECRET_KEYS = new Set([
  'apikey',
  'x-api-key',
  'clientkey',
  'hmacsignature',
  'hmackey',
  'authorization',
  'password',
]);

function redact(value) {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val);
    }
    return out;
  }
  return value;
}

function emit(level, event, fields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(fields),
  };
  const out = JSON.stringify(line);
  if (level === 'error') {
    console.error(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  error: (event, fields) => emit('error', event, fields),
};

export function logOutboundCall({ endpoint, idempotencyKey, status, pspReference, durationMs }) {
  logger.info('adyen.outbound_call', { endpoint, idempotencyKey, status, pspReference, durationMs });
}

export function logWebhook({ eventCode, identifier, hmacResult, outcome }) {
  logger.info('adyen.webhook', { eventCode, identifier, hmacResult, outcome });
}
