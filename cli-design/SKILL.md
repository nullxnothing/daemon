# SKILL: ARIA CLI Workflow Design

The authoritative spec for how the DAEMON standalone ARIA CLI (`aria`) is built.
The `daemon-cli-workflow-designer` agent reads this before designing or reviewing
CLI command workflows, ANSI theming, or boot banners.

## Architecture (the one true path)

```
scripts/aria.mjs                 Ink (React) TUI launcher - the `aria` bin. Plain JS.
   │  spawns electron ... --aria-server,  newline-delimited JSON frames over stdio
   ▼
electron/services/AriaTerminalBackendService.ts   --aria-server backend (bundled in main)
   │  dispatches slash commands, calls AriaAgentService + the ARIA tool catalog
   ▼
electron/services/AriaAgentService.ts             the tool-calling agent loop
```

There is exactly one front-end (`aria.mjs`) and one backend (`AriaTerminalBackendService`).
The former `--aria-cli` readline path was removed - do not reintroduce a second CLI.

## Single sources of truth

| Concern | Owner | Notes |
|---|---|---|
| Commands | `electron/services/aria/cli/commandRegistry.ts` | Shipped to the launcher as a `manifest` frame → drives `/help`, autocomplete, footer. Add a command = one entry here. |
| ANSI theme | `electron/services/aria/cli/ansi-theme.ts` | Canonical tokens. Mirrored in `scripts/aria-shared/ansi-theme.mjs` (launcher can't import the bundle); `test/services/AriaCliThemeSync.test.ts` asserts parity. |
| Boot banner | `electron/services/aria/cli/aria-boot-banner.ts` | `buildBanner(state)` from real version/cluster/session; emitted as a `banner` frame. |
| Frame protocol | `electron/services/aria/cli/frames.ts` | Typed `AriaServerFrame` / `AriaClientFrame` unions. |

## The runtime boundary (why sharing works the way it does)

`dist-electron/main/index.js` is a **single bundle** - the launcher (plain `.mjs`,
runs before any build) cannot import compiled backend modules by path. So:
- **Static data** (theme tokens) is duplicated into a `.mjs` mirror, drift-guarded by a test.
- **Dynamic data** (commands, banner) flows over the frame protocol - the backend stays
  the single behavioral source; the launcher renders what it's told.

Never try to `import` a `dist-electron/**` file from `scripts/aria.mjs`.

## Hard rules (DAEMON, non-negotiable)

1. No inline `\x1b[` escapes or color literals - add a token to `ansi-theme.ts`.
2. No emoji in chrome; status via colored dots (`ARIA_DOT`) only.
3. Honor `NO_COLOR` and non-TTY (`isColorDisabled()`) - degrade to raw text.
4. Windows-terminal-safe glyphs only; deterministic banner width.
5. Full versioned model strings; never bare names.
6. Commands are operator-local (`read` tier). On-chain effects are **tools**, gated by ARIA's
   risk tiers (read=auto, write=approve, sensitive=typed-confirm; `[MAINNET]` re-validates cluster).
7. Reuse existing tools (`getTool`) for data - never re-implement tool logic in a command.

## Adding a command (the workflow)

1. Write the contract from `command-contract-template.md`.
2. Add one entry to `COMMAND_REGISTRY` (+ an `AriaCommandActions` method if it changes state).
3. If it emits structured data, add a frame to `frames.ts` and a `format*` + handler in `aria.mjs`.
4. All rendering via theme tokens; plain-mode formatter must handle the frame.
5. Gate loop green: `pnpm run typecheck && pnpm run test && pnpm run build`.
6. Verify TTY (`node scripts/aria.mjs --cwd .`) and piped (`echo "/cmd" | node scripts/aria.mjs`).

## Verification

- **Gate loop:** `pnpm run typecheck && pnpm run test && pnpm run build`
- **TTY:** banner renders from frame, `/help` lists registry commands, Tab completes, PgUp scrolls.
- **Piped:** structured frames render as plain text, exit code 0.
- **Distribution:** `--version`, `--help`, `NO_COLOR=1` all behave.
