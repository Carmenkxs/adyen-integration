const REQUIRED_VARS = [
  'ADYEN_API_KEY',
  'ADYEN_CLIENT_KEY',
  'ADYEN_MERCHANT_ACCOUNT',
  'ADYEN_HMAC_KEY_STANDARD',
  'ADYEN_HMAC_KEY_TOKENISATION',
  'ADYEN_ENVIRONMENT',
  'PUBLIC_BASE_URL',
  'DEFAULT_CURRENCY',
];

export function loadEnv() {
  const missing = REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  if (process.env.ADYEN_ENVIRONMENT !== 'TEST') {
    throw new Error(
      `ADYEN_ENVIRONMENT must be TEST for this build, got: ${process.env.ADYEN_ENVIRONMENT}`,
    );
  }

  return {
    adyenApiKey: process.env.ADYEN_API_KEY,
    adyenClientKey: process.env.ADYEN_CLIENT_KEY,
    adyenMerchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
    adyenHmacKeyStandard: process.env.ADYEN_HMAC_KEY_STANDARD,
    adyenHmacKeyTokenisation: process.env.ADYEN_HMAC_KEY_TOKENISATION,
    adyenEnvironment: process.env.ADYEN_ENVIRONMENT,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    defaultCurrency: process.env.DEFAULT_CURRENCY,
  };
}
