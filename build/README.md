# Build Configuration

## Code Signing (Optional)

### Windows
Set `CSC_LINK` to the path/base64 of your .pfx certificate and `CSC_KEY_PASSWORD` to the password.

### macOS
Set `CSC_LINK` to the path/base64 of your .p12 certificate, `CSC_KEY_PASSWORD`, and for notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### GitHub Actions
Add these as repository secrets. The release workflow will use them automatically.
Without signing secrets, builds are unsigned (fine for development).
