# DAEMON macOS app icon — Liquid Glass handoff

**Scope: macOS only.** This sets up the new macOS 26 Tahoe "Liquid Glass" icon.
**Windows is intentionally unchanged** — it keeps the existing `resources/icon.ico`
(`win.icon` in `electron-builder.json` was not touched). Linux is out of scope here.

Two small code changes are included (already on the branch — listed at the bottom).

## The source of truth (vectors)
- `build/icon-src/mark.svg`      — white logo mark only, transparent, 1024 canvas.
                                    This is the Liquid Glass **foreground** layer.
- `build/icon-src/icon-full.svg` — full composed icon (squircle + #121414 bg + mark),
                                    used only to rasterize the legacy .icns.
- `build/icon-src/generate.sh`   — regenerates the macOS assets below from the two
                                    SVGs and re-validates the .icon. Requires librsvg
                                    (`brew install librsvg`) + macOS 26 / Xcode 26.

## The Liquid Glass icon (the important new bit)
- `build/Daemon.icon/`           — Icon Composer document.
    - `icon.json`                — dark #121414 background fill + the mark as a
                                   glass layer (specular highlight + neutral shadow).
                                   The system applies the squircle mask, glass, and
                                   shadow at render time — they are NOT baked in.
    - `Assets/mark.svg`          — the foreground layer art.

## How it ships (macOS)
`electron-builder.json` → `mac.icon: "build/Daemon.icon"`.
electron-builder 26.8.1 compiles the .icon with `actool` into an `Assets.car`
+ `CFBundleIconName`, and auto-derives an `.icns` fallback.

REQUIREMENT: the machine that *packages the macOS app* must run **macOS 26 + Xcode 26**
(actool ≥ 26). Otherwise the .icon compile step fails. CI runners need this too.

## macOS fallbacks (regenerated, same artwork)
- `build/icon.icns`              — full multi-res icns (pre-Tahoe macOS).
- `public/daemon-icon.png` (+ `-48`) — dev-mode dock/window icon (unpackaged Electron).

## Code changes (for review)
1. `electron-builder.json` — added `"icon": "build/Daemon.icon"` under `mac` only.
2. `electron/main/index.ts` — the runtime `app.dock.setIcon(daemon-icon.png)` call
   is now gated to `!app.isPackaged`. In a packaged build we must NOT override the
   dock icon, otherwise the flat PNG replaces the system Liquid Glass icon.

## Verifying
- Dev (`pnpm dev`): dock shows the new dark-squircle PNG (NOT the glass effect —
  that's expected; Liquid Glass only renders for a packaged/signed .app).
- Real glass: build a bundle (`pnpm package`, or `electron-builder --mac dir` for an
  unsigned quick check) and look at the .app in Finder / the dock on Tahoe.
