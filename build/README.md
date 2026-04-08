# Build Configuration

## Code Signing

### Windows
Set `CSC_LINK` to the path/base64 of your `.pfx` certificate and `CSC_KEY_PASSWORD` to the password.

### macOS
DAEMON now supports env-gated signing and notarization during packaging.

Required for signed mac builds:
- `CSC_LINK`: path or base64 content for your `.p12` Developer ID Application certificate
- `CSC_KEY_PASSWORD`: password for the `.p12`

Required for notarization:
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Behavior:
- if the Apple env vars are missing, mac builds still package, but notarization is skipped
- if the certificate env vars are missing, mac builds remain unsigned
- no secrets are stored in the repo

### CI
Add the signing and notarization secrets to your CI environment before publishing mac releases.
Without signing secrets, builds are still suitable for development but will not be Gatekeeper-clean.
