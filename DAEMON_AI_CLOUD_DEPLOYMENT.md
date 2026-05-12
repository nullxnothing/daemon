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

```powershell
$env:DAEMON_AI_API_BASE="https://your-staging-api"
$env:DAEMON_PRO_JWT="your-real-pro-or-holder-jwt"
pnpm run test:daemon-ai:live

$env:DAEMON_AI_LIVE_SMOKE_CHAT="1"
pnpm run test:daemon-ai:live
```

The second command spends provider credits and should only be run against staging or production with an intentional test account.
