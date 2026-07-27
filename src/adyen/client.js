import { Client, CheckoutAPI, EnvironmentEnum } from '@adyen/api-library';

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
