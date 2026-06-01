# DAEMON AI Cloud Deployment

This is the deployable v4 hosted AI API for DAEMON Pro, Operator, Ultra, and holder access.

The v4 desktop client defaults hosted DAEMON AI traffic to the staging service:

```text
https://daemon-ai-cloud-v4-staging.onrender.com
```

Set `DAEMON_AI_API_BASE` to override that URL, or set `DAEMON_AI_DISABLE_DEFAULT_CLOUD=1` to disable the built-in staging fallback during local development.

## Build

```powershell
pnpm run build:daemon-ai-cloud
```

## Required Environment

```text
DAEMON_AI_JWT_SECRET=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
DAEMON_AI_CLOUD_DB_PATH=/data/daemon-ai-cloud.db
DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1
DAEMON_PRO_PAY_TO=...
DAEMON_PRO_ADMIN_SECRET=...
SOLANA_RPC_URL=...
PORT=4021
```

At least one model provider key is required. `DAEMON_PRO_JWT_SECRET` remains supported, but production should prefer `DAEMON_AI_JWT_SECRET` and use the same value on the landing app that issues wallet-backed entitlement tokens.
Use `DAEMON_PRO_JWT_PREVIOUS_SECRETS` or `DAEMON_AI_JWT_PREVIOUS_SECRETS` as comma-separated rotation windows when changing JWT secrets.

`DAEMON_PRO_PAY_TO` is the Solana address that receives USDC subscription payments. `SOLANA_RPC_URL` can be a Helius RPC URL and is used for payment and holder verification. `DAEMON_PRO_ADMIN_SECRET` protects manual grant and revoke endpoints; keep it server-only.

For Render Docker deployments, attach a persistent disk at `/data` before using the service for real metering. `/tmp` and the rest of the container filesystem are ephemeral.

## Start

```powershell
pnpm run start:daemon-ai-cloud
```

## Container

```powershell
docker build -f Dockerfile.cloud -t daemon-ai-cloud:v4 .
docker run --rm -p 4021:4021 `
  -e DAEMON_AI_JWT_SECRET="replace-me" `
  -e OPENAI_API_KEY="replace-me" `
  -e DAEMON_AI_CLOUD_DB_PATH="/data/daemon-ai-cloud.db" `
  -v daemon-ai-cloud-data:/data `
  daemon-ai-cloud:v4
```

The container healthcheck calls `/health/ready`, so missing JWT/provider env keeps the deployment unhealthy.
When `DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1` is set, `/health/ready` also reports unhealthy unless the database path points at an explicit non-`/tmp` storage path.

The server exposes:

```text
GET  /health
GET  /health/ready
GET  /v1/subscribe/price
GET  /v1/subscribe/status
POST /v1/subscribe
POST /v1/subscribe/holder/challenge
POST /v1/subscribe/holder/claim
POST /v1/admin/subscriptions/grant
POST /v1/admin/subscriptions/revoke
GET  /v1/ai/features
GET  /v1/ai/usage
GET  /v1/ai/models
POST /v1/ai/chat
```

Production hosted AI requests require both a valid JWT and a live, non-revoked subscription row. Editing desktop local state or replaying a JWT without an active backend subscription does not unlock paid hosted lanes.

## Live Smoke

Before deploying, run the local hosted smoke. It builds the cloud bundle, starts the compiled server, routes provider calls to a deterministic local OpenAI-compatible stub, signs a short-lived JWT, and verifies the same HTTP contract as the live smoke.

```powershell
pnpm run test:daemon-ai:cloud-local
```

This smoke rebuilds `better-sqlite3` for the local Node runtime because the desktop app rebuilds native modules for Electron. Run `pnpm run rebuild` before returning to Electron smoke tests or desktop packaging.

For final v4 release, use the live gate. It requires a production-looking `DAEMON_AI_API_BASE`, checks `/health/ready`, requires persistent storage readiness, and verifies Pro, Operator, and Ultra JWT lanes.

```powershell
$env:DAEMON_AI_API_BASE="https://your-production-daemon-ai-cloud"
$env:DAEMON_PRO_JWT="your-real-pro-jwt"
$env:DAEMON_OPERATOR_JWT="your-real-operator-jwt"
$env:DAEMON_ULTRA_JWT="your-real-ultra-jwt"
pnpm run release:check:v4:live

$env:DAEMON_AI_LIVE_SMOKE_CHAT="1"
pnpm run release:check:v4:live
```

The second command spends provider credits and should only be run against production or a final staging rehearsal with an intentional test account. To intentionally rehearse against staging, set `DAEMON_AI_LIVE_ALLOW_NON_PRODUCTION=1`.
