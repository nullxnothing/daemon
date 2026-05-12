# DAEMON AI Cloud Deployment

This is the deployable v4 hosted AI API for DAEMON Pro and holder access.

## Build

```powershell
pnpm run build:daemon-ai-cloud
```

## Required Environment

```text
DAEMON_PRO_JWT_SECRET=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
DAEMON_AI_CLOUD_DB_PATH=/data/daemon-ai-cloud.db
PORT=4021
```

At least one model provider key is required. `DAEMON_AI_JWT_SECRET` can be used instead of `DAEMON_PRO_JWT_SECRET`.

## Start

```powershell
pnpm run start:daemon-ai-cloud
```

## Container

```powershell
docker build -f Dockerfile.cloud -t daemon-ai-cloud:v4 .
docker run --rm -p 4021:4021 `
  -e DAEMON_PRO_JWT_SECRET="replace-me" `
  -e OPENAI_API_KEY="replace-me" `
  -e DAEMON_AI_CLOUD_DB_PATH="/data/daemon-ai-cloud.db" `
  -v daemon-ai-cloud-data:/data `
  daemon-ai-cloud:v4
```

The container healthcheck calls `/health/ready`, so missing JWT/provider env keeps the deployment unhealthy.

The server exposes:

```text
GET  /health
GET  /health/ready
GET  /v1/ai/features
GET  /v1/ai/usage
GET  /v1/ai/models
POST /v1/ai/chat
```

## Live Smoke

Before deploying, run the local hosted smoke. It builds the cloud bundle, starts the compiled server, routes provider calls to a deterministic local OpenAI-compatible stub, signs a short-lived JWT, and verifies the same HTTP contract as the live smoke.

```powershell
pnpm run test:daemon-ai:cloud-local
```

This smoke rebuilds `better-sqlite3` for the local Node runtime because the desktop app rebuilds native modules for Electron. Run `pnpm run rebuild` before returning to Electron smoke tests or desktop packaging.

```powershell
$env:DAEMON_AI_API_BASE="https://your-staging-api"
$env:DAEMON_PRO_JWT="your-real-pro-or-holder-jwt"
pnpm run test:daemon-ai:live

$env:DAEMON_AI_LIVE_SMOKE_CHAT="1"
pnpm run test:daemon-ai:live
```

The second command spends provider credits and should only be run against staging or production with an intentional test account.
