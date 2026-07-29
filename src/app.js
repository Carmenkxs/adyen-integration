import express from 'express';
import { createWebhookRouter } from './webhooks/route.js';
import { createOrdersRouter } from './routes/orders.js';

export function createApp({ env }) {
  const app = express();

  // Webhook route must come before any global JSON body parser: HMAC needs the raw bytes.
  app.use('/webhooks', createWebhookRouter({ env }));

  app.use(express.json());
  app.use('/vendor/adyen-web', express.static('node_modules/@adyen/adyen-web/dist/es'));
  app.use('/orders', createOrdersRouter({ env }));
  app.use(express.static('public'));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  return app;
}
