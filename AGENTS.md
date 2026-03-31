# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the renderer app: React panels, Zustand state, and shared UI types. `electron/` contains the main-process code, preload bridge, IPC handlers, services, and SQLite migrations. Static assets live in `public/`, shared styles in `styles/`, packaging assets in `build/`, and helper scripts in `scripts/`. Product context and workflow rules live in [CLAUDE.md](./CLAUDE.md) and [MASTER_PLAN.md](./MASTER_PLAN.md).

## Build, Test, and Development Commands
- `npm run dev`: start the persistent Vite/Electron dev session.
- `npm run dev:debug`: start dev with DevTools auto-open.
- `npm run typecheck`: run TypeScript checks once.
- `npm run typecheck:watch`: keep TypeScript checking in watch mode.
- `npm test`: run the Vitest suite.
- `npm run build`: compile TypeScript and build the renderer.
- `npm run package`: build and create a packaged Electron app.
- `npm run rebuild`: rebuild native modules (`better-sqlite3`, `node-pty`) after dependency changes.

Use the normal inner loop: `npm run dev` in one terminal and `npm run typecheck:watch` in another.

## Coding Style & Naming Conventions
Use TypeScript throughout. Prefer concise React function components, `camelCase` for variables/functions, `PascalCase` for components, and descriptive file names like `WalletService.ts` or `GitPanel.tsx`. Match the existing style: single quotes, minimal comments, and small IPC methods returning `{ ok, data?, error? }`. Keep privileged logic in `electron/`; the renderer should go through `window.daemon`.

## Testing Guidelines
Vitest is configured via `vitest.config.ts`, but there are currently no committed test files. Add new tests near the code they cover using `*.test.ts` or `*.test.tsx`. Prioritize IPC behavior, store logic, and utility functions. For UI changes, also verify the running Electron app using the workflow documented in [CLAUDE.md](./CLAUDE.md).

## Commit & Pull Request Guidelines
This repository does not yet have established git history, so use short imperative commit subjects, for example: `Add wallet panel settings toggle`. Keep commits focused. PRs should include a clear summary, impacted areas, manual test notes, and screenshots for visible UI changes.

## Security & Configuration Tips
Never hardcode API keys or secrets. Store sensitive values through the secure key flows already used by the app. Keep DB access in the main process, wrap IPC handlers in `try/catch`, and verify features work in the packaged app, not only in dev.
