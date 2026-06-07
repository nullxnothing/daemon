# Settings UX Lane — Results

Polish pass on the settings lane (SettingsPanel + EnvManager). Goal was a calm,
scannable, trustworthy surface for dense forms, toggles, and key-management flows.

## Files changed (all in-lane)

| File | What changed |
| --- | --- |
| `src/panels/SettingsPanel/SettingsPanel.tsx` | Keys/Integrations/Providers/Tools/Setup/Crashes UX; added `SecretInput` + `middleEllipsis` helpers; confirmation-gated destructive actions |
| `src/panels/SettingsPanel/SettingsPanel.css` | Secret-field + reveal styles, `quiet-danger` button, integration key→value row fix, provider status-card auth alignment, Keys list spacing |
| `src/panels/EnvManager/EnvManager.tsx` | Unified DEV/PROD reveal to click-to-reveal (removed hover-reveal of secrets) |
| `src/panels/EnvManager/EnvManager.css` | Compact stat cards (killed the tall empty wells), tightened stats row |

## Review method

Launched the real app (this worktree's renderer on Vite `:7777`, Electron in smoke
mode on CDP `:9223` to coexist with the sibling `ux-wallet` instance that owns the
default `:9222`) and drove it via the `electron-test` MCP. Collapsed terminal/right
panel/sidebar to review each settings surface at full height. Screenshotted every
tab before and after each change — did not edit CSS blind.

## Visual changes

### Keys tab (security-sensitive)
- **Before:** no grouping eyebrows; tall sparse rows; a bare `...347b` fingerprint
  floating mid-row; long key names overflowing; **`Remove` rendered loud red and
  deleted immediately with no confirmation**; plaintext-capable value field with no
  reveal control.
- **After:** `STORED KEYS` / `ADD A KEY` eyebrows; each row shows a green "set" status
  dot + middle-ellipsised key name + right-aligned `ends ·347b` value fingerprint;
  `Remove` is now a **quiet secondary** (muted until hover/focus) and **confirmation-
  gated** via the shared `confirm()` dialog; the add-value field is a masked
  `SecretInput` with an explicit **Show/Hide** reveal-on-intent toggle; a transient
  "Saved …" confirmation replaces the helper line after a successful add.

### Integrations tab
- **Before:** Status / CLI Path / Voight rows had the name set to `flex:1`, stranding
  every value against the far-right edge with a large dead gap — read as disconnected;
  two different row systems (`integration-row` vs `display-row`) stacked together;
  password fields with no reveal; long CLI path with no ellipsis; loud red `Remove`.
- **After:** rows are tight **key→value pairs** (fixed-width name, value sits directly
  after it); hairline dividers give consistent rhythm; CLI path uses middle-ellipsis
  with full value on hover/title; API-key and Voight-key fields are masked
  `SecretInput`s with reveal toggles; `Remove` demoted to `quiet-danger`; MCP rows pin
  the toggle to the right with the `project` source label beside it.

### Providers tab
- **Before:** three pref groups separated by dividers only (no titles); status cards
  had a name→authMode gap.
- **After:** added `CONNECTIONS` / `ARIA` / `DAEMON AI` / `DEFAULTS` section eyebrows so
  the groups are named, not just implied; status-card authMode is muted mono,
  right-aligned.

### Tools tab
- Removed a redundant stacked description + divider before `WORKSPACE PROFILE`.

### Setup / Crashes tabs
- `Reset UI Layout` is now `quiet-danger` **and confirmation-gated** (was loud red,
  fired immediately). `Clear History` demoted to `quiet-danger`.

### EnvManager
- **Before:** the three stat cards (`LOCAL KEYS` / `PRODUCTION KEYS` / `SYNCED`) used the
  shared `Stat` module's `88px` min-height + `fs-28` stacked value, leaving a tall
  empty well under a tiny number (~120px tall cards). **DEV revealed on click but PROD
  revealed on hover** — a secret echoing on every cursor pass, the exact anti-pattern
  to avoid.
- **After:** stat cards are compact single-line `LABEL … value` rows (~37px, ~80px of
  vertical space reclaimed). **DEV and PROD now share one safe model: single-click
  reveals/hides, double-click edits, never reveal on hover.** Both masked by default.

## Design-system compliance
- Spacing snapped to the 4/8/12/16 scale on touched rows; no off-scale values added.
- Tokens only — `pnpm run lint:styles` passes (no new literal font-sizes, hex colors,
  radii, or inline shadows; all within baseline budgets).
- Status via 5px colored dots, no emoji in chrome. Green reserved for set/healthy/saved.
- Secret fields masked-by-default with obvious, safe reveal affordances.

## Deferred / shared-file notes
- **No backend changes were required.** All fixes were renderer-only and stayed inside
  the two panel subtrees. The `confirm()` store and `Dot` component were used as
  read-only existing APIs (no edits).
- The EnvManager expanded per-project drill-down still shows full plaintext values; it
  sits behind an explicit expand click and was left as an intentional reveal context.
  Flagging it here as a candidate for a future masked treatment if desired.

## Gate loop status
- `pnpm run typecheck` — ✅ pass (clean)
- `pnpm run test` — ⚠️ 784/785 pass. The single failure is
  `test/services/SeekerRelayService.test.ts` (mobile relay session-auth, returns 404
  instead of 200). **Pre-existing on branch HEAD and unrelated to this lane** —
  verified by stashing the four panel changes and reproducing the identical failure.
  `SeekerRelayService` is outside the settings lane and was not touched.
- `pnpm run build` — ✅ pass (renderer + electron main + preload)
- `pnpm run lint:styles` — ✅ pass

## Screenshots
Captured inline in the working session (before/after for Keys, Integrations, Providers,
Display, Tools, Panels, and EnvManager). After-state PNGs were also written to the
system temp dir during review (`keys_after.png`, `env_after.png`); no screenshot files
were committed into the lane subtree to avoid touching out-of-lane paths.
