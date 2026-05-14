# DAEMON v4 Release Checklist

Use this checklist for the final v4 release on May 15, 2026.

## 1. Local Release Gate

Run the full local gate from a clean release machine:

```powershell
pnpm run release:check:v4:local
```

This covers typecheck, unit tests, DAEMON AI cloud-local smoke, native rebuild, Electron smoke, MCP stress, Pro entitlement smoke, style debt, journeys, responsive/layout checks, visual regression, packaging, and packaged app smoke.

## 2. Production DAEMON AI Cloud Gate

Deploy the cloud service with persistent storage and required production env:

```text
DAEMON_AI_JWT_SECRET=...
OPENAI_API_KEY=... or ANTHROPIC_API_KEY=...
DAEMON_AI_CLOUD_DB_PATH=/data/daemon-ai-cloud.db
DAEMON_AI_REQUIRE_PERSISTENT_STORAGE=1
DAEMON_PRO_PAY_TO=...
DAEMON_PRO_ADMIN_SECRET=...
SOLANA_RPC_URL=...
```

Then run:

```powershell
$env:DAEMON_AI_API_BASE="https://your-production-daemon-ai-cloud"
$env:DAEMON_PRO_JWT="your-real-pro-jwt"
$env:DAEMON_OPERATOR_JWT="your-real-operator-jwt"
$env:DAEMON_ULTRA_JWT="your-real-ultra-jwt"
pnpm run release:check:v4:live
```

Run the paid provider smoke once before final publish:

```powershell
$env:DAEMON_AI_LIVE_SMOKE_CHAT="1"
pnpm run release:check:v4:live
```

## 3. Final Version and Tag

Only after both gates pass:

1. Change `package.json` from `4.0.0-rc.0` to `4.0.0`.
2. Change `Whatsnew.md` from RC notes to final release notes.
3. Re-run `pnpm run release:check:v4:local`.
4. Commit from a clean worktree.
5. Run `pnpm run release:check:v4:final-state`.
6. Tag `v4.0.0`.
7. Publish `release/4.0.0/DAEMON-setup.exe` and verify the GitHub latest download URL.

## 4. Known External Follow-Up

Existing SpawnAgents agents created before the edge-threshold fix may still have `pm_edge_threshold: 5` stored server-side. Those should be corrected to `0.05` by SpawnAgents or respawned from the fixed DAEMON build.
