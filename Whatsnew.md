# DAEMON v4.0.0

DAEMON v4 ships the hosted DAEMON AI cloud path, broader release smoke coverage, and the low-power desktop work needed for slower machines.

## Highlights

- Added the DAEMON AI cloud API for hosted Pro, Operator, Ultra, and holder-backed access.
- Added hosted model routing across OpenAI, Anthropic, and compatible provider lanes.
- Wired the desktop DAEMON AI and Pro subscription clients to the production cloud service.
- Preserved BYOK and local development paths for users who do not want hosted model traffic.
- Added local and live cloud smoke gates for Pro, Operator, and Ultra entitlement behavior.
- Expanded release coverage for Electron startup, MCP stress, Pro entitlement flow, workflow journeys, responsive layout, visual regression, packaging, and packaged app smoke.
- Added low-power performance mode with deferred startup work, reduced background refresh pressure, and lower motion.

## Hardening

- Required hosted model lane entitlements at the cloud API boundary before credit checks or provider calls.
- Added SQLite-backed usage metering for hosted DAEMON AI requests.
- Added production readiness checks for provider configuration, JWT secrets, admin grant support, Solana RPC, and cloud storage.
- Stabilized wallet workspace visual regression coverage after the loaded wallet header became the expected release surface.
- Updated Integration Command Center tests for the enabled-integration workflow.

## Verification

- `pnpm run release:check:v4:local`
- `pnpm run release:check:v4:live`
- `DAEMON_AI_LIVE_SMOKE_CHAT=1 pnpm run release:check:v4:live`
