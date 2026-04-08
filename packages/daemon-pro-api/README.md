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

The MVP deliberately stubs the following. Do NOT deploy to mainnet-backed payments before checking each item off:

- [ ] Real x402 middleware — swap `verifyPaymentHeader` for `@x402/express`'s `paymentMiddlewareFromConfig` with a live PayAI facilitator client in `src/lib/x402.ts` / `src/index.ts`.
- [ ] On-chain signature verification — the MVP accepts any well-formed X-Payment header. Production must verify the payment actually settled.
- [ ] Postgres — swap `better-sqlite3` for `pg` in `src/lib/db.ts` (the query shapes are SQL-standard so this is ~1 file).
- [ ] `DAEMON_PRO_JWT_SECRET` env var with `openssl rand -hex 64`.
- [ ] Tight CORS allowlist in `DAEMON_PRO_ALLOWED_ORIGINS`.
- [ ] Rate limiting on `/v1/subscribe` to prevent nonce/amount probing.
- [ ] Real Pro skill content in `content/pro-skills/` (the sample-* dirs are placeholders).
- [ ] Arena submissions manual-moderation flow (no current admin UI — direct DB writes).

## Local dev

```bash
cd packages/daemon-pro-api
cp .env.example .env
pnpm install
pnpm dev
```

Server listens on `:4021` by default. The DAEMON client points at `DAEMON_PRO_API_BASE` (default `http://127.0.0.1:4021`) in dev.

## Testing the subscribe flow manually

```bash
# Step 1: challenge
curl -i -X POST http://127.0.0.1:4021/v1/subscribe
# → 402 Payment Required with { x402Version, accepts: [...] }

# Step 2: submit fake payment header (MVP only — production verifies the signature)
PAYLOAD=$(echo -n '{"wallet":"ABC123","signature":"test","nonce":"n1","amount":"5000000","network":"solana:mainnet"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
curl -i -X POST http://127.0.0.1:4021/v1/subscribe -H "X-Payment: $PAYLOAD"
# → 200 OK with { ok, jwt, expiresAt, features, tier }

# Step 3: use the JWT on a gated route
JWT="<paste jwt from step 2>"
curl -H "Authorization: Bearer $JWT" http://127.0.0.1:4021/v1/sync/mcp
```
