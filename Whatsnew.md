# DAEMON v4.0.0-rc.0

Unreleased release-candidate notes. Do not tag, publish, or switch the hosted service to production until the live cloud gates below pass.

## Highlights

- Added the deployable DAEMON AI cloud API for hosted Pro and holder access.
- Added hosted model routing for OpenAI, Anthropic, and Google-compatible provider lanes.
- Added JWT-backed cloud authentication and SQLite usage metering for hosted DAEMON AI.
- Wired the desktop DAEMON AI client to hosted cloud mode while keeping BYOK mode available.
- Added local and live smoke harnesses for the DAEMON AI cloud contract.
- Expanded v4 smoke coverage for Electron startup, workflow journeys, layout cohesion, and visual regression.
- Added low-power performance mode for slower computers, including reduced panel preloads, slower background wallet/email/Solana refreshes, and near-zero UI motion.

## Hardening

- Enforced hosted model lane entitlements at the cloud API boundary before credit checks or provider calls.
- Kept the desktop hosted API fallback pointed at the v4 staging service for RC testing.
- Added Docker and persistent-disk deployment notes for the cloud service.
- Added regression coverage for cloud entitlement enforcement, client defaults, and production readiness.
- Split renderer startup into critical boot work and deferred idle work so DAEMON reaches the usable shell before optional plugins, onboarding, and activity history finish loading.

## Local Verification

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run test:daemon-ai:cloud-local`
- `pnpm run rebuild`
- `pnpm run test:smoke`
- `pnpm run test:mcp-stress`
- `pnpm run test:pro-entitlement`
- `pnpm run lint:styles`
- `pnpm run test:journeys`
- `pnpm run test:responsive`
- `pnpm run test:layout`
- `pnpm run test:visual`
- `pnpm run test:packaged-smoke`

## Pre-Live Gates

- Decide and configure the production DAEMON AI cloud base URL.
- Run `pnpm run release:check:v4:live` against the deployed service with intentional test accounts.
- Confirm Pro, Operator, and Ultra model lane behavior with real wallet-issued JWTs.
- Confirm persistent cloud storage is attached before metered usage is accepted.
- Replace the RC version with the final v4 version, then tag and publish from a clean release commit.
