#!/usr/bin/env bash
# Regenerate every app-icon asset from the two vector sources in this folder:
#   mark.svg        - white logo mark only, transparent, full 1024 canvas
#                     (the Liquid Glass FOREGROUND layer; system adds mask/glass/shadow)
#   icon-full.svg   - full composed icon: squircle + #121414 background + mark
#                     (used to rasterize the legacy .icns / PNG fallbacks)
#
# The Liquid Glass icon itself lives in ../Daemon.icon (icon.json + Assets/mark.svg).
# electron-builder (>=26, macOS 26 + Xcode 26) compiles ../Daemon.icon via actool into
# an Assets.car + CFBundleIconName, and derives an .icns automatically. The assets below
# are the cross-platform / pre-Tahoe / dev-dock fallbacks.
#
# Requires: rsvg-convert (librsvg), sips + iconutil (macOS).
set -euo pipefail
cd "$(dirname "$0")"
ROOT="../.."

rsvg-convert -w 1024 -h 1024 icon-full.svg -o full-1024.png

IS=daemon.iconset
rm -rf "$IS"; mkdir -p "$IS"
g(){ sips -Z "$1" full-1024.png --out "$IS/$2" >/dev/null; }
g 16 icon_16x16.png;    g 32 icon_16x16@2x.png
g 32 icon_32x32.png;    g 64 icon_32x32@2x.png
g 128 icon_128x128.png; g 256 icon_128x128@2x.png
g 256 icon_256x256.png; g 512 icon_256x256@2x.png
g 512 icon_512x512.png; cp full-1024.png "$IS/icon_512x512@2x.png"
iconutil -c icns "$IS" -o icon-new.icns

# Deploy
cp icon-new.icns "$ROOT/build/icon.icns"
cp full-1024.png "$ROOT/build/icons/1024x1024.png"
sips -Z 512  full-1024.png --out "$ROOT/build/icon.png"           >/dev/null
sips -Z 1024 full-1024.png --out "$ROOT/public/daemon-icon.png"   >/dev/null
sips -Z 48   full-1024.png --out "$ROOT/public/daemon-icon-48.png">/dev/null
sips -Z 512  full-1024.png --out "$ROOT/resources/icon.png"       >/dev/null
for sz in 512 256 128 64 48 32 24 16; do
  sips -Z "$sz" full-1024.png --out "$ROOT/build/icons/${sz}x${sz}.png" >/dev/null
done

# Validate the Liquid Glass bundle compiles (same call electron-builder makes)
TMP=$(mktemp -d); cp -R "$ROOT/build/Daemon.icon" "$TMP/Icon.icon"; mkdir -p "$TMP/out"
actool "$TMP/Icon.icon" --compile "$TMP/out" --output-format human-readable-text \
  --notices --warnings --output-partial-info-plist "$TMP/out/p.plist" \
  --app-icon Icon --include-all-app-icons --accent-color AccentColor \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx
rm -rf "$TMP"

rm -rf "$IS" full-1024.png icon-new.icns
echo "Icons regenerated."
