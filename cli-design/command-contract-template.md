# Command Contract - `/<name>`

> Copy this template for every new ARIA CLI command. A command is not "done"
> until every section below is filled. Commands are operator-local (they drive
> the CLI session); on-chain side effects belong to ARIA **tools**, not commands.

## Name & synopsis
- **Name:** `/<name>` (no leading slash in the registry entry)
- **Synopsis:** one sentence, imperative. Shown in `/help` and autocomplete.
- **Args:** argument hint, e.g. `<id>` or `auto|fast|standard|reasoning|premium`. Omit if none.
- **Keybinding:** optional, e.g. `shift+tab`. Shown in the footer.

## Risk tier
One of `read` | `write` | `sensitive`, matching ARIA's central gating:
- `read` - auto-run, no prompt. **All session commands are `read`.**
- `write` - requires inline approval.
- `sensitive` - typed-confirm; mark `[MAINNET]` and re-validate cluster if on-chain.

The tier here is used for color coding only (read=blue, write=amber, sensitive=red).

## Data source / channel
- **Registry entry:** `electron/services/aria/cli/commandRegistry.ts` (the single source).
- **Backend action:** which `AriaCommandActions` method it calls.
- **Tool reused (if any):** e.g. `read_project_status`, `recall_memories` from
  `electron/services/aria/tools/*` via `getTool(name)`. Do not re-implement tool logic.

## Output schema (frame)
Define the frame the backend emits and its payload, e.g.:
```
{ type: 'status', status: { project, cluster, rpcProvider, defaultWallet, ... } }
```
Add the frame to the `AriaServerFrame` union in `electron/services/aria/cli/frames.ts`.

## ANSI rendering
- Every visual element references a named token from
  `electron/services/aria/cli/ansi-theme.ts` (and its launcher mirror
  `scripts/aria-shared/ansi-theme.mjs`). **No inline `\x1b[` escapes.**
- Status uses colored dots (`ARIA_DOT`), never emoji.
- Provide graceful degradation: `isColorDisabled()` (NO_COLOR / non-TTY) returns raw text.
- Launcher formatter lives in `scripts/aria.mjs` (`format*`) and is shared by the
  TUI transcript and plain (piped) mode.

## Error cases
Enumerate each failure with the exact user-facing message, e.g.:
- Missing arg → `Usage: /<name> <arg>`
- Not found → `Session not found: <id>`
- Tool failure → the tool's `summary` surfaced as a `log` warn frame.

## Example
Show the invocation and sample rendered output (both TTY and piped).
```
> /status
Project status:
  project   C:/Users/offic/Projects/DAEMON
  cluster   devnet (helius)
  wallet    main  ·  2 wallet(s)
  packs     core, solana
```

## Checklist (before delivering)
- [ ] One entry in `COMMAND_REGISTRY`; manifest auto-ships to the launcher.
- [ ] Risk tier assigned; on-chain commands flag `[MAINNET]` + re-validate cluster.
- [ ] All styling via theme tokens; no inline escapes; dots not emoji.
- [ ] Output frame added to `frames.ts` union and handled in `aria.mjs`.
- [ ] Plain-mode formatter handles the frame (piped output works).
- [ ] Errors enumerated with exact messages.
- [ ] Example with rendered output.
- [ ] Windows-terminal glyph/width safe.
- [ ] Gate loop green: `pnpm run typecheck && pnpm run test && pnpm run build`.
