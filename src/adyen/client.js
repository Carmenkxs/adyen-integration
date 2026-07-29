import { Client, CheckoutAPI, EnvironmentEnum } from '@adyen/api-library';
import { logOutboundCall } from '../logging/logger.js';

let checkoutApi;

export function getCheckoutApi(env) {
  if (checkoutApi) return checkoutApi;

  const client = new Client({
    apiKey: env.adyenApiKey,
    environment: EnvironmentEnum.TEST,
  });
  checkoutApi = new CheckoutAPI(client);
  return checkoutApi;
}

export async function createSession(env, { orderReference, amount, currency, returnUrl, shopperReference }) {
  const checkout = getCheckoutApi(env);
  const idempotencyKey = `order:${orderReference}:session`;
  const start = Date.now();

  try {
    const response = await checkout.PaymentsApi.sessions(
      {
        merchantAccount: env.adyenMerchantAccount,
        reference: orderReference,
        amount: { value: amount, currency },
        returnUrl,
        shopperReference,
      },
      { idempotencyKey },
    );

    logOutboundCall({
      endpoint: 'POST /sessions',
      idempotencyKey,
      status: 200,
      pspReference: undefined,
      durationMs: Date.now() - start,
    });

    return response;
  } catch (err) {
    logOutboundCall({
      endpoint: 'POST /sessions',
      idempotencyKey,
      status: err.statusCode || err.status || 'unknown',
      pspReference: undefined,
      durationMs: Date.now() - start,
    });
    throw err;
  }
}
