# DAEMON AI Cloud — HTTP API Reference

The DAEMON AI Cloud service is a standalone Express server (`electron/services/daemon-ai-cloud/`)
that hosts the DAEMON AI chat layer and the Pro/holder subscription system. It is built and run
separately from the desktop app:

```bash
pnpm run build:daemon-ai-cloud      # bundles to dist-cloud/daemon-ai-cloud-server.mjs
pnpm run start:daemon-ai-cloud      # runs the bundled server
```

Default bind: `0.0.0.0:4021` (override with `PORT` or `DAEMON_AI_CLOUD_PORT`).
Source of truth for this document: `server.ts`, `DaemonAICloudGateway.ts`, `SubscriptionGateway.ts`,
and `productionGateway.ts`.

---

## Conventions

- **Success** responses are JSON. Most endpoints wrap the payload as `{ "ok": true, "data": ... }`;
  the subscribe/holder/admin write endpoints return `{ "ok": true, ... }` with fields at the top level.
- **Error** responses are `{ "ok": false, "code": "<machine_code>", "error": "<human message>" }`.
- **Auth** for the AI endpoints uses a bearer JWT: `Authorization: Bearer <jwt>`. The JWT is issued by
  the subscribe/holder/admin endpoints and verified (HS256) against `DAEMON_PRO_JWT_SECRET`
  (or `DAEMON_AI_JWT_SECRET`). In production the token is also checked against an active row in
  `daemon_subscriptions` unless `DAEMON_AI_ALLOW_UNBACKED_JWT=1`.
- **Admin** endpoints require the `x-admin-secret` header (or `Authorization: Bearer <secret>`)
  matching `DAEMON_PRO_ADMIN_SECRET` (or `DAEMON_ADMIN_SECRET`).
- **Rate limits:** AI endpoints — 240 req/min/IP (`daemon_ai_rate_limited`). Subscription endpoints —
  180 req/min/IP (`daemon_pro_rate_limited`). Both return HTTP 429.

---

## Health

### `GET /health`
Liveness check. No auth. Returns `{ "ok": true, "service": "daemon-ai-cloud" }`.

### `GET /health/ready`
Readiness probe. No auth. `200` when all required env is present, `503` otherwise.
Body: `{ "ok": <bool>, "service": "daemon-ai-cloud" }`.

### `GET /health/ready/details`
Same as `/health/ready` but includes the full readiness object (missing env keys, configured
providers, storage hints). Requires the `x-admin-secret` header. `401` (`daemon_admin_unauthorized`)
if the secret is missing or wrong.

---

## AI (bearer JWT required)

All `/v1/ai/*` endpoints require a bearer JWT whose entitlement includes the `daemon-ai` feature.
Missing token → `401 { code: implied, error: "Missing bearer token" }`.
Invalid/expired → `401 daemon_ai_auth_required`. Lacking the feature → `403`.

### `GET /v1/ai/features`
Returns the caller's hosted entitlement.

```json
{ "ok": true, "data": {
  "hostedAvailable": true,
  "plan": "pro",
  "accessSource": "payment",
  "features": ["daemon-ai", "..."],
  "lane": "standard",
  "allowedLanes": ["auto", "fast", "standard"],
  "entitlementExpiresAt": "2026-06-30T00:00:00.000Z"
} }
```

### `GET /v1/ai/usage`
Returns monthly credit usage for the caller.

```json
{ "ok": true, "data": {
  "plan": "pro",
  "accessSource": "payment",
  "lane": "standard",
  "allowedLanes": ["auto", "fast", "standard"],
  "monthlyCredits": 100000,
  "usedCredits": 1234,
  "remainingCredits": 98766,
  "resetAt": 1751328000000
} }
```

### `GET /v1/ai/models`
Returns the hosted model lane catalog. No body required.

```json
{ "ok": true, "data": [
  { "lane": "auto",      "label": "Auto",      "hosted": true, "byok": false, "requiresPlan": "pro" },
  { "lane": "fast",      "label": "Fast",      "hosted": true, "byok": false, "requiresPlan": "pro" },
  { "lane": "standard",  "label": "Standard",  "hosted": true, "byok": false, "requiresPlan": "pro" },
  { "lane": "reasoning", "label": "Reasoning", "hosted": true, "byok": false, "requiresPlan": "operator" },
  { "lane": "premium",   "label": "Premium",   "hosted": true, "byok": false, "requiresPlan": "ultra" }
] }
```

### `POST /v1/ai/chat`
Request a hosted AI response. The lane is checked against the caller's plan, credits are
reserved/charged, and the request is routed to a configured provider.

Request body (normalized by `requestValidation.ts`):

| Field | Type | Notes |
|-------|------|-------|
| `prompt` / `message` | string | The user input. |
| `mode` | string | Request mode (e.g. chat/patch flow). |
| `modelPreference` | lane | One of `auto`, `fast`, `standard`, `reasoning`, `premium`. |
| `usedContext` | object | Optional project context passed to the provider. |

Success:

```json
{ "ok": true, "data": {
  "text": "...",
  "provider": "anthropic",
  "model": "claude-...",
  "usage": { "daemonCreditsCharged": 42, "...": "..." },
  "requestId": "uuid"
} }
```

Errors (all include `requestId`):

| Status | Code | When |
|-------:|------|------|
| 400 | `daemon_ai_bad_request` | Invalid/oversized request body. |
| 402 | `daemon_ai_insufficient_credits` | Monthly credits exhausted. |
| 403 | `daemon_ai_plan_required` | Lane requires a higher plan than the caller holds. |
| 502 | `daemon_ai_provider_error` | Upstream provider unavailable. |
| 500 | `daemon_ai_cloud_error` | Unclassified failure. |

---

## Subscriptions (public + payment)

### `GET /v1/subscribe/price`
Returns pricing for a plan. Query: `?plan=pro|operator|ultra|team|enterprise` (defaults to `pro`).
Body: `{ "ok": true, "data": { plan, priceUsdc, durationDays, network, payTo, paymentMint, holderMint, holderMinAmount } }`.

### `GET /v1/subscribe/status`
Returns the subscription/holder status for a wallet. Query: `?wallet=<base58>` (required),
optional `?plan=`. Returns `400 daemon_pro_bad_request` for a missing/invalid wallet.

```json
{ "ok": true, "data": {
  "active": true, "expiresAt": 1751328000000, "features": ["daemon-ai"],
  "tier": "pro", "plan": "pro", "accessSource": "payment",
  "holderStatus": { "enabled": true, "eligible": false, "mint": "...", "minAmount": 1000000, "currentAmount": 0, "symbol": "DAEMON" }
} }
```

### `POST /v1/subscribe`
x402 USDC payment flow.

- **No payment header** → `402 daemon_pro_payment_required` with `PAYMENT-REQUIRED` /
  `X-Payment-Required` response headers describing the required payment.
- **With `x-payment` (or `payment-signature`) header** → verifies and settles the payment, writes the
  subscription, and returns a JWT.

Success: `{ "ok": true, "jwt": "...", "expiresAt", "features", "tier", "plan", "paymentId", "paidUsdc", "settlementTransaction" }`.
Replayed payment → `409 daemon_pro_payment_replayed`. Invalid payment → `402 daemon_pro_payment_invalid`.
Facilitator unavailable → `503 daemon_pro_payment_unavailable`.

### `POST /v1/subscribe/holder/challenge`
Begins a holder-access claim. Body: `{ "wallet": "<base58>" }`. Returns a nonce + message to sign
(5-minute TTL). `503 daemon_holder_not_configured` if no holder mint is set.

```json
{ "ok": true, "data": { "nonce": "uuid", "message": "DAEMON holder access claim\n...", "holderStatus": { ... } } }
```

### `POST /v1/subscribe/holder/claim`
Completes a holder claim. Body: `{ "wallet", "nonce", "signature" }` (base58 ed25519 signature of the
challenge message). Verifies the signature and on-chain balance ≥ `holderMinAmount`, then issues a Pro JWT.

| Status | Code | When |
|-------:|------|------|
| 400 | `daemon_pro_bad_request` | Missing fields / bad signature encoding. |
| 401 | `daemon_holder_invalid_challenge` / `daemon_holder_invalid_signature` / `daemon_holder_challenge_expired` | Challenge or signature checks fail. |
| 403 | `daemon_holder_insufficient_balance` | Wallet below the holder threshold. |
| 409 | `daemon_holder_challenge_replayed` | Challenge already used. |

Success: `{ "ok": true, "data": { "jwt", "expiresAt", "features", "tier": "pro", "plan": "pro" } }`.

---

## Admin (`x-admin-secret` required)

### `POST /v1/admin/subscriptions/grant`
Grants a subscription without payment. Body: `{ "walletAddress", "plan", "accessSource"?: "admin"|"trial", "durationDays"? }`.
Returns a JWT plus the granted entitlement. `401 daemon_admin_unauthorized` if the secret is wrong,
`503` if the admin API is not configured.

### `POST /v1/admin/subscriptions/revoke`
Revokes a wallet's subscription. Body: `{ "walletAddress", "reason"? }`.
Returns `{ "ok": true, "data": { "revoked": true, "walletAddress" } }`.

---

## Required environment

The server reports readiness via `/health/ready`. Production requires:

| Variable | Purpose |
|----------|---------|
| `DAEMON_PRO_JWT_SECRET` *(or `DAEMON_AI_JWT_SECRET`)* | Signs/verifies entitlement JWTs. |
| `DAEMON_PRO_PAY_TO` | USDC payment recipient. |
| `DAEMON_PRO_ADMIN_SECRET` *(or `DAEMON_ADMIN_SECRET`)* | Admin endpoint secret. |
| `SOLANA_RPC_URL` *(or `HELIUS_RPC_URL` / `HELIUS_API_KEY`)* | Holder balance lookups. |
| `OPENAI_API_KEY` *and/or* `ANTHROPIC_API_KEY` | At least one model provider. |
| `DAEMON_AI_CLOUD_DB_PATH` | SQLite path (set `DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1` to enforce a persistent disk). |

See [internal/DAEMON_AI_CLOUD_DEPLOYMENT.md](internal/DAEMON_AI_CLOUD_DEPLOYMENT.md) for the full deployment runbook.
