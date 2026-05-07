# Daemon Seeker Companion

Daemon Seeker is a mobile command center for Solana builders. The desktop app remains the full IDE, while Seeker becomes the secure approval, monitoring, and wallet handoff layer.

## Product shape

- Build on desktop, command from Seeker.
- Review AI agent actions before they touch files, commands, deploys, or wallet flows.
- Use Seeker as the mobile signing surface for Solana actions.
- Give builders a pocket dashboard for project health, launches, payments, and integrations.

## MVP surface added in this branch

The first UI pass lives inside the Solana toolbox as the `Seeker` workflow tab.

It includes:

- Seeker hero and mobile preview shell
- Launch readiness score derived from current Solana project/toolchain state
- Active project summary
- Pairing-code placeholder for a future QR/deep-link session
- Mock approval queue for agent diffs, devnet deploys, and x402 tests
- Pocket toolbox action list
- Backend implementation path

## Backend work still needed

### 1. Pairing/session relay

Create a short-lived encrypted session between desktop Daemon and the Seeker app. The pairing code in the UI is currently a front-end placeholder. Production should use a QR/deep link flow with expiry, device identity, and signed challenge verification.

### 2. Agent approval pipeline

Agent actions should emit structured approval requests before performing sensitive actions:

- file writes
- terminal commands
- dependency installs
- GitHub pushes
- deploys
- token launches
- payment requests
- wallet signing requests

Each request should include risk level, reason, command/diff preview, and allowed responses.

### 3. Mobile Wallet Adapter handoff

The Seeker app should use Solana Mobile Wallet Adapter for wallet connection, signing messages, and signing transactions. Desktop Daemon should prepare transaction payloads and the mobile app should handle user approval and wallet handoff.

### 4. Push notifications

Notify builders when:

- an agent needs approval
- a build fails
- a deploy succeeds
- a payment arrives
- a launch checklist regresses
- a project receives usage or marketplace activity

### 5. Native mobile shell

Once the desktop-integrated prototype is stable, extract the companion experience into a Solana Mobile app using the current React Native / Expo starter path.

## Suggested next implementation milestone

Build the session relay first. Once desktop can send a real approval request to the mobile surface, every other feature becomes easier to demo and sell.
