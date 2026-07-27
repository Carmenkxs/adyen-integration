import { loadEnv } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './logging/logger.js';

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(`Startup failed: ${err.message}`);
  process.exit(1);
}

const app = createApp({ env });
const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info('server.started', { port, publicBaseUrl: env.publicBaseUrl });
});
