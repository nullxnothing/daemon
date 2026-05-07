# Daemon Seeker Mobile

Daemon Seeker is the native mobile command center for Daemon. The desktop IDE stays the full build environment, while the mobile app handles approvals, wallet handoff, push alerts, and project monitoring.

## What is implemented

- Expo / React Native mobile app scaffold
- Seeker-style mobile dashboard
- Pairing code and deep-link session hook
- Desktop relay client hook
- Approval queue hook with approve/reject/reset events
- Mobile Wallet Adapter hook for wallet authorization and message signing
- Push notification hook for approval alerts
- Bottom-tab mobile UI for Home, Approvals, Wallet, and Pairing
- Android package configuration for `tech.daemonide.seeker`
- Development and preview EAS build profiles

## Run locally

From the repo root:

```bash
cd apps/seeker-mobile
npm install
npm run android
```

Or from the root scripts:

```bash
npm run mobile:seeker:android
```

## Important mobile note

Solana Mobile development uses Android native modules. Use a custom Expo development build, not Expo Go. The app includes `expo-dev-client` and a crypto polyfill so Mobile Wallet Adapter can run in a real Android build.

## Deep link format

```txt
daemonseeker://pair?code=DMN-ABCD-87&relay=http://192.168.1.10:7778&project=Daemon
```

The mobile app parses this link and updates the active pairing session.

## Relay API expected by the hooks

The app is ready for a desktop relay with these endpoints:

### Fetch session snapshot

```http
GET /api/seeker/session/:sessionCode
```

Expected response:

```json
{
  "project": {
    "name": "Daemon Hackathon Build",
    "readiness": 91,
    "validatorOnline": true,
    "enabledIntegrations": 5,
    "pendingApprovals": 2
  },
  "approvals": []
}
```

### Send mobile event

```http
POST /api/seeker/events
```

Example payload:

```json
{
  "type": "approval.approve",
  "sessionCode": "DMN-ABCD-87",
  "payload": {
    "approvalId": "deploy-devnet-001",
    "status": "approved"
  }
}
```

## Next backend tasks

1. Add the desktop relay server inside Daemon.
2. Emit real approval requests from agent, deploy, token, and wallet workflows.
3. Generate QR codes / deep links from desktop.
4. Store paired devices securely.
5. Replace demo project data with relay snapshots.
6. Route real deploy and transaction payloads into Mobile Wallet Adapter signing flows.
