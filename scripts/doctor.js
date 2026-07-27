import { loadEnv } from '../src/config/env.js';
import { getCheckoutApi } from '../src/adyen/client.js';
import { logOutboundCall, logger } from '../src/logging/logger.js';

async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(`doctor: environment invalid — ${err.message}`);
    process.exit(1);
  }

  const checkoutApi = getCheckoutApi(env);
  const idempotencyKey = `doctor:${env.adyenMerchantAccount}:${Date.now()}`;
  const start = Date.now();

  try {
    const response = await checkoutApi.PaymentsApi.paymentMethods(
      { merchantAccount: env.adyenMerchantAccount },
      { idempotencyKey },
    );

    logOutboundCall({
      endpoint: 'POST /paymentMethods',
      idempotencyKey,
      status: 200,
      pspReference: undefined,
      durationMs: Date.now() - start,
    });

    const methods = (response.paymentMethods || []).map((m) => m.name || m.type);
    console.log(`doctor: credentials valid. ${methods.length} payment method(s) available:`);
    for (const name of methods) {
      console.log(`  - ${name}`);
    }
    process.exit(0);
  } catch (err) {
    const status = err.statusCode || err.status || 'unknown';
    logOutboundCall({
      endpoint: 'POST /paymentMethods',
      idempotencyKey,
      status,
      pspReference: undefined,
      durationMs: Date.now() - start,
    });
    console.error(`doctor: call failed — HTTP ${status}: ${err.message}`);
    process.exit(1);
  }
}

main();
