# ARIA CLI - Design Research Notes

Accumulated rationale behind the standalone CLI design. Append findings; don't rewrite history.

## 2026-06-26 - Consolidation pass

**Problem.** The CLI's command set, ANSI theme, and banner art each existed three times: inline in
`scripts/aria.mjs`, inline in `AriaTerminalBackendService.ts`, and inline again in a dead
`AriaTerminalService.ts` (`--aria-cli`, unreachable - `aria.mjs` only ever spawned `--aria-server`).
Adding a command meant editing multiple files, and the three copies had drifted.

**Hard constraint discovered.** `dist-electron/main/index.js` is a single Rollup bundle (~1.3 MB);
there is no per-file emit. The launcher (`scripts/aria.mjs`) is plain `.mjs` run by Node before any
build step, so it **cannot import a compiled backend module by path**. This rules out a single shared
TS module consumed by both runtimes.

**Decision - two sharing channels:**
- *Static data* (theme tokens): canonical in `cli/ansi-theme.ts`, mirrored in
  `scripts/aria-shared/ansi-theme.mjs`, parity asserted by `AriaCliThemeSync.test.ts`. The duplication
  is real but contained - the test fails the gate if the two diverge.
- *Dynamic data* (commands, banner): flow over the existing frame protocol as `manifest` and `banner`
  frames emitted before `ready`. The backend stays the single behavioral source; the launcher renders
  what it's told. This is what makes "add a command = one file edit" true.

**Why not codegen the mirror.** Adds a build step + a stale-artifact failure mode. A parity test is
cheaper and the theme rarely changes.

**Deleted.** `electron/services/AriaTerminalService.ts` and the `--aria-cli` branch in
`electron/main/index.ts`. One front-end, one backend.

**Distribution fix.** `react` was in `devDependencies` but `aria.mjs` imports it at runtime via Ink - moved to `dependencies` so `npx aria` / a standalone install resolves it. `react-dom` stays dev-only
(renderer-bundled).

**New commands.** `/tools` (catalog grouped by risk with colored dots), `/status`
(`read_project_status` tool), `/memory` (`recall_memories` tool). All reuse existing tool handlers via
`getTool()` - no logic re-implemented.

**TUI polish.** Manifest-driven slash autocomplete (Tab), scrollback as a pure React offset over the
transcript (PageUp/PageDown - not terminal-native, to avoid fighting Ink's `alternateScreen`),
theme-token approval/patch coloring, real `--help`/`--version`, defined exit codes, `NO_COLOR`.

## Open follow-ups
- Protocol versioning: launcher tolerates a missing `manifest`/`banner` with a static fallback. If the
  frame schema changes incompatibly, add a version field to the `manifest` frame.
- Banner wordmark uses CP437/box-drawing block glyphs (`█ ╗ ╔ ═ ╚`); verified to render in Windows
  Terminal. Legacy `conhost` with a raster font may misalign - revisit if a user reports it.
