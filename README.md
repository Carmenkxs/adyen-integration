# Shop A: Adyen Checkout Integration (WIP)

A solo, part-time build of a card payments integration against **Adyen's test
environment**. No real money, no production traffic — this is a learning/demo
project working through the full lifecycle of a card payment.

Full specification lives in [`prd.md`](prd.md).

## What this is

**Shop A** is a fictional direct-to-consumer store. The build implements, end
to end, using real (test-environment) Adyen API calls:

- Checkout Sessions flow with Drop-in
- 3D Secure (frictionless, challenge, and failure paths)
- Manual capture, partial capture, cancel, refund
- Tokenisation and merchant-initiated (subscription) rebills
- HMAC-verified inbound webhooks as the source of truth for order state

Nothing is mocked or simulated — every capability is a real call against
Adyen's TEST environment.

## Status: work in progress

Being built milestone by milestone:

| Milestone | Scope | Status |
|---|---|---|
| M1 | Authenticated connection + verified webhook receiver | In progress |
| M2 | A shopper pays (Drop-in, webhook-driven authorisation) | Not started |
| M3 | 3D Secure | Not started |
| M4 | Capture, partial capture, cancel, refund | Not started |
| M5 | Tokenisation + merchant-initiated rebill | Not started |

See [`prd.md`](prd.md) Section 4 for full milestone detail and acceptance
criteria.

## Stack

- Node.js >= 20, Express
- `@adyen/api-library` (Adyen Checkout API, TEST environment)
- SQLite (`better-sqlite3`) for local persistence
- No frontend framework — static Drop-in page

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your own Adyen test credentials
   (API key, client key, merchant account, HMAC key).
3. `npm run doctor` — verifies credentials by listing available payment
   methods.
4. `npm start` — runs the app.

A public tunnel (e.g. `localtunnel`) is required for Adyen to deliver
webhooks to a local machine during development.

## Notes

This is a personal build exercise, not a production integration. Test-mode
Adyen credentials only; no live payment methods or real money are ever
involved.
