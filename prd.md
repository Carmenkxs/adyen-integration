# Shop A: Adyen Checkout Build Specification

Sandbox integration. Solo, part-time. Test environment only. 100% self-serve.

---

## 0. Self-serve guarantee

**This build has no human dependency and no real money at any point.** This was verified against Adyen documentation before this specification was written, and it is the constraint that determines scope.

Every feature in this specification can be enabled by the builder alone, in the test Customer Area or via API, with no support ticket, no sales conversation, and no account manager.

### Explicitly excluded because they are not self-serve

These are excluded by design, not deferred. Do not build toward them and do not add them later without re-verifying.

| Feature | Gate |
|---|---|
| Adyen for Platforms, balance platform, account holders, splits, payouts to third parties | Enterprise sales process. No self-serve path exists |
| Apple Pay, PayPal | Require live-equivalent setup |
| Klarna with auto-capture in test | Support ticket required. Test defaults to manual capture |
| Multiple partial captures on one authorisation | Support ticket required |
| Raw card data handling | Requires the PCI role on the API credential, granted by support |
| MOTO payments | Separate merchant account plus support ticket |
| Enhanced scheme data, level 2 and 3 | Support ticket required |
| Updating stored payment details via API on Checkout v70 and later | Eligibility review by support |
| MobilePay and similar methods with no test platform | Require live penny tests with real money |

### Standing rule for the coding agent

If any step in this build requires contacting Adyen support, requesting a role, submitting a form to a human, or spending real money, **stop and report it rather than proceeding**. That is a scope error in this specification, not a task to work around.

---

## 1. Objective

Build a single-merchant online payments integration against Adyen's test environment that handles the complete lifecycle of a card payment: authorise, challenge, capture, refund, and charge again without the shopper present. Every capability must be a real Adyen API call, with nothing simulated, mocked, or approximated in application code. The integration must be buildable and demonstrable end to end by one person with no external dependency.

---

## 2. Scenario and entities

### Business

**Shop A** is a direct-to-consumer online store selling physical goods. Shoppers buy one-off items. Some items are also offered on a replenishment subscription that rebills monthly.

Shop A is the merchant of record. There is no seller, no sub-merchant, no split, and no third party receiving funds. Shop A takes the money because Shop A sold the goods.

This scenario is chosen because it justifies every milestone naturally:

| Business fact | Technical requirement it creates |
|---|---|
| Shoppers pay by card online | Checkout session, Drop-in |
| Some shoppers are challenged by their bank | 3D Secure handling |
| Goods ship after the order, not instantly | Authorise now, capture on despatch |
| Some items go out of stock after ordering | Partial capture, cancellation |
| Shoppers return goods | Refunds, full and partial |
| Subscription rebills monthly with no shopper present | Tokenisation, merchant-initiated payment |

### Minimum entity set

| Entity | Count | Created by |
|---|---|---|
| Company account | 1 | Self-serve signup |
| Merchant account | 1 | Provisioned at signup |
| API credential with Checkout role | 1 | Self-serve, Customer Area |
| Client key | 1 | Self-serve, Customer Area |
| Standard webhook with HMAC | 1 | Self-serve, Customer Area |
| Tokenisation webhook with HMAC | 1 | Self-serve, Customer Area |
| Shopper | 0 in Adyen | Local record only. Adyen knows a `shopperReference` string, nothing more |

### Local persistence

SQLite via `better-sqlite3`, or a JSON file store at the agent's discretion.

- `shoppers`: internal id, `shopperReference` string sent to Adyen, email
- `orders`: order reference, amount, currency, status, psp reference, authorised amount, captured amount, refunded amount
- `tokens`: stored payment method id, shopper internal id, brand, last 4, expiry, status
- `payments`: psp reference, parent order reference, type (authorisation, capture, refund, cancel), amount, status
- `webhook_events`: psp reference or event id, event code, received timestamp, raw payload, processed flag

**`shopperReference` must not contain personally identifiable information.** Adyen documents this explicitly. Use an opaque internal id, never an email address.

---

## 3. Scope

### Target end state

A shopper can pay, be challenged by 3D Secure, be charged later than they authorised, be charged for less than they authorised, be refunded, and be charged again while not present. Anything not on that path is out.

### In scope

| Item | Reason |
|---|---|
| Sessions flow with Drop-in | Adyen's recommended integration. Lowest PCI exposure |
| Cards only | Depth over breadth. Other methods add surface without adding lifecycle |
| 3D Secure, including challenge, frictionless, and failure paths | The most commonly mishandled part of any card integration |
| Manual capture, set per payment request | Per-request override means no Customer Area dependency |
| Partial capture, single | Real behaviour when stock is short |
| Cancellation of an uncaptured authorisation | The other half of partial capture |
| Full and partial refunds | Every real store needs this |
| Card tokenisation via zero-amount authorisation | The self-serve, documented test path |
| Merchant-initiated subscription payment using a token | Proves the shopper-not-present flow |
| Token deletion | Regulatory and practical necessity |
| HMAC webhook validation on both webhook types | Non-negotiable |
| Idempotency keys on every state-changing POST | Cheap now, expensive to retrofit |

### Out of scope

| Item | Reason |
|---|---|
| Everything in Section 0 | Not self-serve |
| Non-card payment methods | Breadth, not depth. Each adds its own test-data quirks |
| Risk rules and RevenueProtect configuration | Configuration exercise, not integration |
| Reporting and settlement file parsing | Batch file handling, not API work |
| Real UI beyond what checkout requires | This is a backend integration |
| Multi-currency | Adds settlement complexity, no new API surface |
| Going live | Test environment only |

### Deferred (build order if extended)

1. A second payment method with a redirect flow, for example iDEAL, to exercise the redirect result handling path
2. Real Time Account Updater scenarios, which have documented test cards
3. Token groups across multiple merchant accounts
4. Native 3D Secure component rather than the Drop-in default
5. Reconciliation against settlement detail reports

---

## 4. Milestones

Each milestone is independently verifiable. No milestone begins until the previous one's acceptance criteria pass.

---

### M1: Authenticated connection and verified webhook receiver

**Objective**
Prove this machine can talk to Adyen and can receive and cryptographically verify inbound webhooks, before any payment logic exists.

**What gets built**
- Node 20+ Express application
- Environment loader with fail-fast validation of every required variable
- Adyen client via `@adyen/api-library`, configured for TEST
- `POST /webhooks/adyen` reading the raw request body, validating HMAC, persisting to `webhook_events`, returning the documented acknowledgement
- `npm run doctor`: calls `POST /paymentMethods` with the merchant account and prints the payment methods returned
- Structured logging of every outbound call: endpoint, idempotency key, HTTP status, psp reference, duration

**Unit of value**
A command that proves, from cold, that credentials work and that a webhook arrives, authenticates, and is stored exactly once.

**Demonstrable artefact**
1. `npm run doctor` output listing the live payment methods available on the merchant account
2. Log showing a Customer Area test webhook arriving, its HMAC validating, and the acknowledgement returned
3. Log showing the same payload with a tampered signature rejected with 401
4. Database showing 1 row after the same valid webhook is delivered twice

**Acceptance criteria**
- `doctor` exits 0 on valid credentials and non-zero with a named cause on invalid ones
- Missing environment variables cause startup failure listing exactly what is missing
- Valid HMAC returns the documented acknowledgement and persists once
- Invalid HMAC returns 401 and persists nothing
- A valid webhook with an unrecognised event code is still stored and acknowledged, proving the receiver is generic rather than hardcoded to one payload shape
- No API key, client key, or HMAC key appears in any log line

**Effort**: S

---

### M2: A shopper pays

**Objective**
Take a real card payment from a browser through to a confirmed authorisation driven by webhook, not by the API response.

**What gets built**
- `POST /orders` creating an order record and returning an order reference
- `POST /orders/:ref/session` calling Checkout `POST /sessions` with amount, currency, order reference, return URL, and `shopperReference`
- Static checkout page mounting Adyen Drop-in against the returned session, using the client key
- Return URL handler that reads the redirect result and shows a provisional outcome
- Webhook handler for the authorisation event, which is the only thing permitted to move an order to a confirmed state

**Unit of value**
Money is authorised on a real card in Adyen's test environment, and Shop A's database learns about it the way a production system would.

**Demonstrable artefact**
1. The `POST /sessions` request and response, from logs
2. Screen recording of Drop-in completing with a test card
3. Customer Area payment list showing the transaction
4. Order record showing the transition to authorised, with the webhook that caused it in the log immediately prior

**Acceptance criteria**
- The order reaches a confirmed state only via the webhook handler. The session response and the redirect result may set a provisional state but never a final one
- A declined test card produces a distinguishable failure state and a clear message, not a generic error
- An authorisation webhook for an unknown order reference is logged and acknowledged, never thrown
- The same order reference cannot produce 2 sessions with different amounts
- `shopperReference` contains no personally identifiable information

**Effort**: M

---

### M3: 3D Secure

**Objective**
Handle the case where the shopper's bank interrupts the payment to challenge them, including when that challenge fails.

**What gets built**
- 3D Secure enabled on the session request
- Full handling of the additional action returned by Adyen: the Drop-in surfaces the challenge, and the server resolves the final outcome
- Explicit handling of 4 outcomes: frictionless success, challenge passed, challenge failed, challenge abandoned
- Order state machine extended to represent "awaiting shopper action" as a real state with a timeout, not an implicit gap

**Minimum state set after this milestone**

`created`, `session_open`, `awaiting_shopper_action`, `authorised`, `refused`, `abandoned`, `error`.

`awaiting_shopper_action` must carry a timestamp so abandonment is detectable by age rather than only by an event that may never arrive. Add further states only if the build proves they are needed, and record why in OBSERVATIONS.md.

**Unit of value**
The integration behaves correctly in the situation that breaks most card integrations: the payment is not finished when the API first responds.

**Demonstrable artefact**
1. Screen recording of a challenge being presented and passed
2. Screen recording of a challenge being failed, with the resulting order state
3. Log traces for all 4 outcomes side by side
4. The order state machine, as a diagram or as the actual enum in code

**Acceptance criteria**
- All 4 outcomes are reachable using Adyen's published 3D Secure test cards
- An abandoned challenge leaves the order in a recoverable state, not stuck permanently between states
- The application never treats "action required" as either success or failure
- Refreshing the browser mid-challenge does not corrupt the order state

**Effort**: M

**Note**: use Adyen's documented 3D Secure test card numbers. Do not invent card numbers. Different numbers deliberately trigger different outcomes and that mapping is the point of the milestone.

---

### M4: Capture, partial capture, cancel, refund

**Objective**
Separate the moment money is reserved from the moment money is taken, and be able to give it back.

**What gets built**
- Manual capture requested per payment in the `/sessions` or `/payments` request, overriding the account default. This avoids any Customer Area dependency. The field that controls this is documented in the Checkout API reference for the session and payment requests. Locate it there rather than relying on this document
- `POST /orders/:ref/capture` accepting a full or partial amount
- `POST /orders/:ref/cancel` for an uncaptured authorisation
- `POST /orders/:ref/refund` accepting a full or partial amount
- Webhook handlers for capture, capture failed, cancel, refund, and refund failed
- Amount tracking on the order: authorised, captured, refunded, and the derived remaining balance in each direction

**Unit of value**
The full commercial lifecycle of one order is demonstrable in a single ledger view, and every state change was caused by an Adyen webhook.

**Demonstrable artefact**
1. One order taken through authorise, partial capture, then partial refund, with the amount fields shown after each step
2. A second order authorised then cancelled, showing no funds were ever taken
3. The webhook log for both, in sequence
4. The error response when a refund is attempted for more than was captured

**Acceptance criteria**
- Capturing less than the authorised amount succeeds, and the behaviour of the remaining authorised balance is observed and recorded rather than assumed
- Refunding more than was captured is rejected by the application before it reaches Adyen, with a clear error
- Capture and refund are attempted only once per logical operation, enforced by idempotency key, even if the endpoint is called twice
- A failed capture or refund webhook moves the order to a state that makes the failure visible, rather than silently leaving the optimistic state in place
- Every amount is held in minor units as an integer. No floating point arithmetic anywhere near money

**Effort**: L

**Attempt exactly once**: multiple partial captures on a single authorisation require Adyen support and are out of scope. Perform 1 partial capture per authorisation only.

---

### M5: Charge a shopper who is not there

**Objective**
Store a card with the shopper's consent, then bill it later with no browser and no shopper involved.

**What gets built**
- Zero-amount authorisation to create a token, with the documented recurring parameters set
- Webhook handler for the token creation event, persisting the stored payment method id against the shopper
- `GET /shoppers/:id/payment-methods` returning stored cards via `GET /storedPaymentMethods`
- `POST /subscriptions/:id/charge` making a merchant-initiated payment against the token using the `/payments` endpoint
- Token deletion endpoint
- Handling for a rebill that fails because the token is no longer usable

**Unit of value**
A subscription rebill runs from a command line with no browser open, which is the actual production shape of recurring revenue.

**Demonstrable artefact**
1. The zero-amount authorisation request and the token creation webhook it produced
2. `GET /shoppers/:id/payment-methods` output showing the stored card
3. A rebill executed from the terminal with no browser involved, and the resulting authorisation webhook
4. A rebill against a deleted token, and how the failure surfaces

**Acceptance criteria**
- The token is captured from the token creation webhook, not scraped from the payment response
- The merchant-initiated payment sets the correct shopper interaction and recurring processing model for a subscription, and the agent can state why each value was chosen
- A rebill against a deleted or invalid token fails with a distinguishable, actionable error
- Deleting a token removes it from the stored payment methods list on the next call

**Effort**: M

**Architectural constraint**: Adyen documents that when using the Sessions flow, token payments where the shopper is not present must go through the `/payments` endpoint rather than `/sessions`. The build therefore uses both endpoints, deliberately. Record in OBSERVATIONS.md why this split exists.

---

### Dependency chain

```
M1 (credentials + webhooks)
  -> M2 (authorised payment)
       -> M3 (3D Secure, payment is not finished when the API responds)
            -> M4 (capture, cancel, refund)
                 -> M5 (tokenise and rebill)
```

---

## 5. Technical architecture

### API surfaces touched

| API | Used for | Milestone |
|---|---|---|
| Checkout, `/paymentMethods` | Credential validation, available methods | M1 |
| Checkout, `/sessions` | Shopper-present payments | M2, M3, M5 (token creation) |
| Checkout, `/payments` | Merchant-initiated payments | M5 |
| Checkout, `/payments/{pspReference}/captures` | Capture | M4 |
| Checkout, `/payments/{pspReference}/cancels` | Cancel | M4 |
| Checkout, `/payments/{pspReference}/refunds` | Refund | M4 |
| Checkout, `/storedPaymentMethods` | List and delete tokens | M5 |

**Versioning**: read the current Checkout API version from Adyen's API Explorer at build time and pin it. Do not take a version number from this document or from training data. If the Node library sets a default, record which version it resolves to.

### Authentication model

Deliberately simple, and worth understanding as a contrast to the platform stack.

| Credential | Where it is used | How it travels |
|---|---|---|
| API key | Server to Adyen, all Checkout calls | `X-API-Key` request header |
| Client key | Browser to Adyen, Drop-in initialisation | Public by design. Restricted by allowed origins configured in the Customer Area |
| HMAC key, per webhook | Adyen to server, signature verification | Not transmitted. Used to recompute the signature locally |

No OAuth, no bearer tokens, no refresh. The API key is a static secret in an environment variable.

**The client key is not a secret and the API key must never reach the browser.** The Drop-in receives a session id and the client key. Nothing else. If any design pressure pushes the API key client-side, that is a design error.

### Data flows

**Shopper-present payment (M2, M3)**

```
Shopper  -> Shop A            starts checkout
Shop A   -> Checkout API      POST /sessions
Shop A   -> Shopper           session id + client key
Shopper  -> Adyen Drop-in     submits card
Adyen    -> Shopper           3DS challenge, if required
Adyen    -> Shop A            AUTHORISATION webhook
Shop A   -> local store       order confirmed
```

**Modification (M4)**

```
Shop A   -> Checkout API      POST /payments/{psp}/captures  (or cancels, refunds)
Adyen    -> Shop A            CAPTURE / CANCELLATION / REFUND webhook
Shop A   -> local store       amount fields updated
```

**Merchant-initiated rebill (M5)**

```
Shop A   -> Checkout API      POST /payments with storedPaymentMethodId + shopperReference
Adyen    -> Shop A            AUTHORISATION webhook
Shop A   -> local store       subscription period marked paid
```

Note the absence of a browser in the third flow. That is the point of the milestone.

### Webhook handling

**Reachability**: a publicly reachable HTTPS URL is required. Use `cloudflared`, `ngrok`, or `localtunnel`. A named tunnel is strongly preferred, because a changing URL means silently missing webhooks and hours lost to the wrong diagnosis. This build uses `localtunnel` via `npx`, a quick (non-named) tunnel, as a deliberate scope tradeoff: a stable/named URL would require owning a domain, which is out of scope. The URL is expected to change between sessions and must be re-pasted into `.env` and the client key's allowed origins each time.

**Webhooks to configure, both self-serve in the Customer Area**

| Webhook | Events consumed | Milestone |
|---|---|---|
| Standard notification | Authorisation, capture, capture failed, cancellation, refund, refund failed | M2, M4 |
| Recurring tokens life cycle events | Token created, token updated, token disabled | M5 |

**Handler rules, applied uniformly**

1. Read the raw request body before any JSON parsing middleware touches it. HMAC is computed over the raw bytes
2. Validate HMAC. Reject with 401 on failure. Never process an unvalidated payload
3. Acknowledge fast. Persist the raw event, acknowledge, then process asynchronously. No Adyen API call inside the webhook request-response cycle
4. Deduplicate before processing. Adyen may redeliver
5. Never assume ordering. A capture webhook may arrive before you have finished handling the authorisation
6. Unknown event codes are persisted and acknowledged, never rejected
7. The webhook is the source of truth for money. An API response is a hint

**Acknowledgement format**: the standard notification webhook expects a specific acknowledgement body, not merely a 200. Confirm the exact expected response in current documentation and confirm whether the tokenisation webhook expects the same. Do not assume the two are identical. Record the answer in OBSERVATIONS.md.

### Idempotency

Every state-changing POST to Adyen carries an `Idempotency-Key`, derived deterministically from the logical operation so a retry reuses the same key.

| Operation | Key derivation |
|---|---|
| Create session | `order:{orderRef}:session` |
| Capture | `order:{orderRef}:capture:{sequence}` |
| Cancel | `order:{orderRef}:cancel` |
| Refund | `order:{orderRef}:refund:{sequence}` |
| Token creation | `shopper:{shopperId}:token:{sequence}` |
| Rebill | `subscription:{subscriptionId}:period:{periodId}` |

The rebill key is the most important one in the build. It is what stops a retried subscription job from charging a shopper twice, which is the single most damaging bug this kind of system can have.

### Error and edge case handling

**Adyen API error classes**

| Class | Behaviour |
|---|---|
| 401, 403 | Fail loudly. Credential problem. Never retry |
| 422 validation | Surface the Adyen error code and offending field. Never retry |
| 429 | Retry with exponential backoff |
| 5xx | Retry up to 3 times with backoff, reusing the same idempotency key |
| Network timeout | Same as 5xx. The idempotency key makes this safe |

Never swallow an Adyen error code. The code is the diagnostic.

**Domain edge cases that must be explicitly handled**

1. Card declined at authorisation
2. 3D Secure challenge failed
3. 3D Secure challenge abandoned, browser closed mid-flow
4. Shopper refreshes or navigates back during the redirect
5. Capture attempted on an authorisation that was already cancelled
6. Refund attempted exceeding the captured amount
7. Refund attempted on an uncaptured authorisation
8. Authorisation left uncaptured. Adyen documents that authorisations expire. Confirm the current window and record it
9. Rebill against a deleted or disabled token
10. Duplicate webhook delivery
11. Webhook arriving out of order
12. Webhook arriving for an order this system has never seen

**Logging**: every outbound call logs endpoint, idempotency key, status, psp reference, and duration. Every webhook logs event code, identifier, HMAC result, and processing outcome. No secret and no card data ever reaches a log.

---

## 6. Environment and setup requirements

### Account setup, all self-serve

1. Create a free test account at adyen.com/signup. Activation is by email. Multi-factor authentication is required at first login
2. When asked what payments you accept, choose an option that includes ecommerce. The merchant account is typically your account name suffixed with ECOM
3. Generate an API key on a web service user in the test Customer Area
4. Generate a client key and add your local tunnel origin to its allowed origins
5. Configure the standard notification webhook, generate its HMAC key
6. Configure the recurring tokens life cycle events webhook, generate its HMAC key
7. Confirm cards are enabled under payment methods. Add any missing card brands, which Adyen documents as instant for most methods

If any of these steps presents a form that goes to a human, stop and report it.

### Local environment

| Requirement | Notes |
|---|---|
| Node 20 LTS or later | |
| `@adyen/api-library` | Confirm current major version at install |
| Adyen Web Drop-in | Version must be compatible with the pinned API version |
| Express with raw body access on the webhook route | |
| `better-sqlite3` or a JSON store | Agent's discretion |
| `cloudflared`, `ngrok`, or `localtunnel`, named tunnel preferred | This build uses `localtunnel` via `npx`, a quick tunnel, per the scope tradeoff recorded in Section 5 |
| `.env`, git-ignored | |

### Required environment variables

```
ADYEN_API_KEY
ADYEN_CLIENT_KEY
ADYEN_MERCHANT_ACCOUNT
ADYEN_HMAC_KEY_STANDARD
ADYEN_HMAC_KEY_TOKENISATION
ADYEN_ENVIRONMENT=TEST
PUBLIC_BASE_URL
DEFAULT_CURRENCY=AUD
```

### Region and currency

AUD, shopper country AU. There is no platform-availability question here, unlike the platform stack: card processing in test is not region-gated in the same way. If any AU-specific test-data friction appears, GB or EUR are safe fallbacks with no impact on the build.

### Test data

Use Adyen's published test cards and 3D Secure test credentials. Do not invent card numbers. The specific numbers map to specific outcomes and that mapping is load-bearing for M3.

**Standard test amounts**, so results are comparable across milestones. All in minor units, AUD.

| Purpose | Amount |
|---|---|
| Baseline payment, every milestone | 100 |
| Partial capture and refund testing, M4 | 1999, capture 1200, refund 500 |
| Token creation, M5 | 0 (zero-amount authorisation) |
| Subscription rebill, M5 | 100 |

Adyen's testing guidance recommends beginning each test scenario with an amount of 100. Deviating from these amounts is fine, but record the change and the reason.

**PCI note**: this build never handles raw card data. Drop-in tokenises client-side. Where documentation shows raw card fields, they are not applicable to this integration.

### Repository structure

```
/src
  /adyen        client, one module per concern
  /routes       express routes
  /webhooks     hmac validation, per-event handlers
  /store        persistence
  /domain       order state machine, amount arithmetic
/scripts
  doctor.js
  rebill.js     M5, runs with no browser
/public
  checkout.html
BUILD_LOG.md    agent-owned, evidence only
OBSERVATIONS.md builder-owned, agent must never write to this
README.md
.env.example
```

---

## 7. Open technical questions and risks

Resolve during the build and record. Do not assume.

### Before or during M1

1. **Webhook acknowledgement format.** The exact expected response body for the standard notification webhook, and whether the tokenisation webhook expects the same
2. **HMAC computation.** Whether the signature calculation is identical for both webhook types. Verify, do not reuse one implementation blindly
3. **Client key allowed origins.** Whether a tunnel URL is accepted, and what happens when the tunnel URL changes

### During M2 and M3

4. **Sessions flow result handling.** Exactly what the redirect result tells you and what it does not, and why it cannot be treated as final
5. **3D Secure test card mapping.** Which published test numbers produce which of the 4 outcomes
6. **Abandonment.** What Adyen does, if anything, when a shopper abandons a challenge, and whether any webhook ever arrives

### During M4

7. **Authorisation expiry window.** Documentation references both 28 and 30 days in different places. Determine the current authoritative figure
8. **Remaining balance after partial capture.** Whether the uncaptured remainder is cancelled automatically. Documentation indicates the default is automatic cancellation, with the alternative requiring support. Confirm the observed default behaviour
9. **Delayed capture webhook.** Whether the capture event requires enabling additional event codes or a setting on the webhook

### During M5

10. **Zero-amount authorisation.** Whether it is supported for the chosen test cards and region without additional configuration
11. **Shopper interaction and recurring processing model values.** The correct combination for a subscription rebill, and what changes if it is wrong
12. **Token lifecycle events.** The full set of token events and what triggers each

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tunnel URL changes and webhooks silently stop | Hours lost diagnosing the wrong layer | Named tunnel. Add a webhook liveness check to `doctor` |
| A milestone drifts toward a non-self-serve feature | Build stalls on a support ticket | Section 0 standing rule. Stop and report |
| Documentation pages assume a plugin or platform context | Wrong instructions followed | Check every page for a plugin banner or a platforms banner before using it |
| Part-time cadence causes context loss between sessions | Slow restarts | Fill in OBSERVATIONS.md at the end of each session, not retrospectively |
| Scope creep toward more payment methods | Breadth replaces depth | Deferred list is not a to-do list |

---

## 8. Recording findings: two files, hard separation

This build has a learning purpose, not only a delivery purpose. That purpose is defeated if the agent writes conclusions the builder was supposed to reach. The separation below is therefore a rule, not a convention.

### `BUILD_LOG.md`, owned by the agent

Append-only. Chronological. Timestamped. Created and maintained by the agent throughout.

**Records evidence only:**

- API versions pinned, and how that version was determined
- Exact endpoint paths, request shapes, and response shapes actually used
- Exact event type strings observed on webhooks, verbatim
- Where documentation and observed behaviour disagreed, stating both without resolving which is "right"
- Error codes encountered, with the request that produced them
- Configuration steps that turned out to be necessary but were not in this specification
- Test card numbers used and the outcome each produced
- Timestamps for milestone start, first success, and completion

**Must not contain:**

- Any sentence beginning "this means", "the reason is", "in summary", or "the key insight"
- Explanations of payments concepts
- Recommendations
- Anything the builder could have concluded themselves from the evidence above

If the agent is unsure whether something is evidence or conclusion, it is a conclusion. Leave it out.

### `OBSERVATIONS.md`, owned by the builder

**The agent must never write to, edit, or pre-fill this file.** It contains open questions for the builder to answer in their own words. Answers supplied by the agent destroy the file's only purpose.

The agent may read it, for one reason only: to know which evidence is worth capturing in `BUILD_LOG.md`.

### The handoff at each milestone boundary

On completing a milestone, the agent states, in the chat, which `BUILD_LOG.md` entries are relevant to which questions in the corresponding `OBSERVATIONS.md` section. It points. It does not answer.

Correct: "M2 complete. Log entries 14 to 22 cover the sessions flow and payment method enablement questions in your M2 section."

Incorrect: "M2 complete. Regarding your question on why the webhook is the source of truth: it is because the API response only confirms receipt, not outcome."

The second version has done the builder's thinking for them and is a failure of this section regardless of accuracy.

---

## 9. Instructions for the coding agent

1. Do not begin a milestone until the previous milestone's acceptance criteria pass
2. If any step requires contacting Adyen, requesting a role, or spending real money, stop and report. Do not work around it
3. Confirm every endpoint, field, enum, and API version against current Adyen documentation before use. Where this document and the documentation disagree, the documentation wins, and the discrepancy is recorded in OBSERVATIONS.md
4. Where documentation is ambiguous, make the smallest testable call and observe. Record the observation. Do not guess and continue
5. Never invent test data
6. Never handle raw card data
7. All money is integers in minor units. No floating point
8. Do not add features outside scope, including ones that look free
9. Maintain `BUILD_LOG.md` continuously, not retrospectively. Evidence only, per Section 8
10. Never write to `OBSERVATIONS.md`
11. UK English in comments, commits, and documentation. Numerals, not words. No em dashes