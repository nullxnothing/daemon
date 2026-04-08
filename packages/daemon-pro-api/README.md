# @daemon/pro-api

Subscription server for Daemon Pro. The open DAEMON IDE talks to this service to subscribe, sync MCP configs, view Arena submissions, and download the Pro tool pack.

## MVP scope

- `POST /v1/subscribe` — x402 handshake → JWT issuance
- `GET /v1/subscribe/status?wallet=…` — check active subscription
- `GET /v1/subscribe/price` — current price (unauth convenience)
- `GET|POST /v1/sync/mcp` — hosted MCP config sync (gated)
- `GET /v1/arena/submissions` — curated submissions list (gated)
- `POST /v1/arena/submit` — submit a new tool (gated)
- `POST /v1/arena/vote/:id` — one-vote-per-wallet (gated)
- `GET /v1/pro-skills/manifest` — list of Pro skills with hashes (gated)
- `GET /v1/pro-skills/:id/files` — download a single skill bundle (gated)
- `GET /v1/priority/quota` — current month's priority-api usage (gated)
- `POST /v1/priority/explain-tx` — stub paid explain-tx (gated + quota)
- `POST /v1/priority/audit-idl` — stub paid Anchor IDL audit (gated + quota)

All `/v1/*` routes except `/v1/subscribe` + `/v1/health` require a valid subscription JWT via `Authorization: Bearer <jwt>`.

## Production checklist

The payment path is now wired to PayAI/x402. Before shipping, check these off:

- [x] Real x402 verification and settlement on `POST /v1/subscribe`.
- [x] Production startup guard for `PAYAI_API_KEY_ID` / `PAYAI_API_KEY_SECRET`.
- [x] Payment wallet configured via `DAEMON_PRO_PAY_TO`.
- [x] Holder access gate wired via `DAEMON_PRO_HOLDER_MINT` + `DAEMON_PRO_HOLDER_MIN_AMOUNT`.
- [ ] Postgres or hosted durable DB instead of local SQLite in `src/lib/db.ts`.
- [ ] `DAEMON_PRO_JWT_SECRET` set to a strong secret, e.g. `openssl rand -hex 64`.
- [ ] Tight CORS allowlist in `DAEMON_PRO_ALLOWED_ORIGINS`.
- [ ] Rate limiting on `/v1/subscribe` to prevent payment probing / abuse.
- [ ] Real Pro skill content in `content/pro-skills/` instead of the sample skill dirs.
- [ ] Arena submissions moderation/admin flow.
- [ ] One live end-to-end mainnet payment test against your production `DAEMON_PRO_PAY_TO` wallet.

## Local dev

```bash
cd packages/daemon-pro-api
cp .env.example .env
pnpm install
pnpm dev
```

Server listens on `:4021` by default. The DAEMON client points at `DAEMON_PRO_API_BASE` (default `http://127.0.0.1:4021`) in dev.

## Payment wallet

The receiving wallet is whatever you set in `DAEMON_PRO_PAY_TO`.

- The current code default is only a placeholder fallback: `FeeW4lLet1111111111111111111111111111111111`.
- For production, replace it in `.env` with a real Solana wallet you control.
- Current intended production wallet: `GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W`.
- That wallet should be a treasury/merchant wallet, not a personal hot wallet.

## Holder access

DAEMON Pro can also be claimed by token holders.

- Holder mint: `DAEMON_PRO_HOLDER_MINT`
- Current working threshold: `DAEMON_PRO_HOLDER_MIN_AMOUNT=1000000`
- Verification RPC: `DAEMON_PRO_HOLDER_RPC_URL`
- Claim token TTL: `DAEMON_PRO_HOLDER_JWT_HOURS`

The flow is:

1. The client asks the API for a holder challenge.
2. The wallet signs the one-time challenge message locally.
3. The API verifies the signature and checks the live token balance on-chain.
4. If the wallet still meets the threshold, the API issues a short-lived Pro JWT.

## Hosting notes

This package is a stateful Express server today.

- It still uses `better-sqlite3` with a local file DB at `DAEMON_PRO_DB_PATH`.
- That means a normal long-lived Node host is the right fit today: Railway, Fly.io, Render, a VPS, or similar.
- Render is a valid option for the current implementation if you run it as a Web Service and attach persistent storage for the SQLite file.
- Vercel is not a good default fit for the current implementation because serverless functions plus local SQLite are not durable, and native module handling is more brittle.
- If you want Vercel, first move `src/lib/db.ts` to Postgres or another hosted database and treat the API as stateless.

## Testing the subscribe flow manually

```bash
# Step 1: challenge
curl -i -X POST http://127.0.0.1:4021/v1/subscribe
# → 402 Payment Required with { x402Version, accepts: [...] }

# Step 2: retry with a real x402 client using PAYMENT-SIGNATURE.
# In test mode, the suite still accepts the legacy fake X-Payment header.

# Step 3: use the JWT on a gated route after a successful payment
JWT="<paste jwt from subscribe response>"
curl -H "Authorization: Bearer $JWT" http://127.0.0.1:4021/v1/sync/mcp
```

## Testing the real 402 flow against Railway

Use the standalone client harness while validating live payments. It is simpler and more reliable than testing through the Electron app first.

```bash
cd packages/daemon-pro-api
set DAEMON_PRO_TEST_URL=https://daemon-pro-api-production.up.railway.app/v1/subscribe
set DAEMON_PRO_TEST_PRIVATE_KEY=<base58-secret-or-[json-array]>
pnpm run test:x402
```

What it checks:

- the endpoint returns a real 402 challenge
- the client can create a valid SVM x402 payment payload
- Railway verifies and settles the payment
- the API returns a JWT plus settlement response headers

Use a dedicated funded test wallet. Do not use your treasury wallet for this.
