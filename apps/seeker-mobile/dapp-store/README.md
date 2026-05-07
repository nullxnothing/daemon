# Daemon Seeker — Solana dApp Store submission

Submission for the Solana Mobile dApp Store (Seeker / Saga).

> **The dApp Store is mainnet-only.** There is no devnet listing path.
> Listing the app costs SOL. Your in-app wallet flow can still default to
> devnet (and ours does), but the *submission* requires mainnet.
>
> Reference: https://docs.solanamobile.com/dapp-publishing/intro

The publishing flow changed in late 2025. It is now driven by the web portal
at https://publish.solanamobile.com — the CLI only uploads release APKs.

## Flow at a glance

```
EAS Build  ─►  Portal web UI  ─►  CLI release upload  ─►  Solana review
(APK)          (publisher +        (signs + posts            (1–2 weeks)
                app NFTs +          release NFT)
                metadata)
```

## 1. Build a signed release APK

From repo root:

```bash
cd apps/seeker-mobile
npm i -g eas-cli
eas login                                  # interactive — opens browser
eas init                                   # one-time, fills extra.eas.projectId
eas build -p android --profile dapp-store  # ~10 min, runs in EAS cloud
```

When EAS finishes it prints a download URL. Either:

- Download the APK to `./build/daemon-seeker-release.apk` (this dir), or
- Keep the EAS URL and pass `--apk-url` to the CLI later.

## 2. Create a publisher keypair

```bash
solana-keygen new -o ./publisher-keypair.json
solana-keygen pubkey ./publisher-keypair.json   # note the address
```

Fund this address with **~0.15 SOL on mainnet** before step 3
(publisher NFT + app NFT minting fees).

## 3. Register publisher + app on the portal

Open https://publish.solanamobile.com in a browser and sign in with the
publisher keypair (it expects a Solana wallet — load the keypair into
Phantom or any standard wallet to sign in).

In the portal:

1. **Create publisher** — name, website, contact email. Upload
   `assets/publisher-icon-512.png`. Mints publisher NFT.
2. **Create app** — name "Daemon Seeker", package
   `tech.daemonide.seeker`. Upload `assets/app-icon-512.png`. Mints app NFT.
3. **App listing details** — copy the metadata in `config.yaml` (this
   directory) into the portal forms. Specifically:
   - Short description: *"Mobile command center for Solana builders."*
   - Long description: see `config.yaml > release.catalog.en-US.long_description`
   - Privacy policy URL: `https://www.daemonide.tech/privacy`
   - License URL: `https://www.daemonide.tech/license`
   - Banner: `assets/banner-1920x1080.png`
   - Feature graphic: `assets/feature-1024x500.png`
   - Screenshots: `assets/screenshots/01-home.png` … `04-pair.png`
   - Testing instructions: see `config.yaml > solana_mobile_dapp_publisher_portal.testing_instructions`
4. **Generate an API key** from the portal — paste into a local env var:

   ```bash
   export DAPP_STORE_API_KEY="<paste>"
   ```

## 4. Upload the release APK via CLI

```bash
cd apps/seeker-mobile/dapp-store
export DAPP_STORE_API_KEY="<from portal>"

# either with a downloaded APK …
npx @solana-mobile/dapp-store-cli@latest \
  --apk-file ./build/daemon-seeker-release.apk \
  --whats-new "First public release of Daemon Seeker." \
  --keypair ./publisher-keypair.json \
  --verbose

# … or pointing at the EAS-hosted APK URL directly
npx @solana-mobile/dapp-store-cli@latest \
  --apk-url "https://expo.dev/artifacts/eas/<id>.apk" \
  --whats-new "First public release of Daemon Seeker." \
  --keypair ./publisher-keypair.json \
  --verbose
```

The CLI uploads the APK, mints the release NFT, and submits for review.

## 5. Wait for review

Solana Mobile reviews manually. Typical turnaround: **1–2 weeks**.
Common rejection reasons:

- Privacy policy URL returns 404 (deploy `daemon-landing` first)
- App crashes on launch on a real device (test through EAS internal
  distribution before submitting)
- Screenshots that obviously aren't from the actual app
- Missing icon, banner, or feature graphic

## Updates

For each new version, just bump `version` in `app.json` (and let
`autoIncrement: versionCode` in `eas.json` handle the version code), build a
new APK with EAS, then re-run step 4 with a new `--whats-new`.

## What's in this directory

```
config.yaml           Metadata reference (paste into portal forms)
README.md             This file
assets/
  publisher-icon-512.png
  app-icon-512.png
  banner-1920x1080.png
  feature-1024x500.png
  screenshots/
    01-home.png       1080x1920
    02-approvals.png  1080x1920
    03-wallet.png     1080x1920
    04-pair.png       1080x1920
build/                EAS APK lands here (gitignored)
publisher-keypair.json (gitignored — never commit)
```
