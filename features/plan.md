## Plan: Base-level cloud onboarding integration

Implement a first-run optional onboarding orchestrator that silently installs required CLIs/MCP tooling, supports hybrid auth (OAuth when available, CLI fallback), and prompts per project to link GitHub→Vercel/Railway from day one. Reuse DAEMON’s existing secure key storage, MCP registry/toggling, and Claude session lifecycle so this ships as a cohesive platform capability rather than ad-hoc setup scripts.

**Steps**
1. Phase 1 — Integration domain skeleton (blocks all later phases)
   1.1 Add a new integrations domain in main process with IPC + service layer for provider lifecycle.
   1.2 Define provider state model (installed/authenticated/mcpConfigured/linkedProjects/errors) and expose it via preload.
   1.3 Add non-boolean app settings helpers (or dedicated integration tables) for structured onboarding/integration state persistence.

2. Phase 2 — Silent install + health checks (depends on 1)
   2.1 Implement installer/check runners for Claude CLI, Vercel CLI, Railway CLI, Vercel MCP, Railway MCP, Railway Claude plugin, GitHub MCP.
   2.2 Implement idempotent checks first, then install-only-if-missing behavior, with per-tool logs and retry metadata.
   2.3 Add startup guard so installer runs only when onboarding flow requests it (not on every app boot).
   2.4 Add Windows-first command strategy with safe fallbacks and timeout/error normalization.

3. Phase 3 — Hybrid auth + token persistence (depends on 1, parallel with 2 after interfaces are stable)
   3.1 Implement provider auth adapters:
   - Claude: reuse existing `claude:verify-connection`
   - Vercel: CLI login check + token mode (`--token`) support
   - Railway: CLI login + browserless fallback support
   - GitHub: token-based flow for MCP (PAT validation)
   3.2 Persist secrets in encrypted storage (`secure_keys`) with provider-specific key names and masked hints.
   3.3 Add optional OAuth wiring points for providers where browser OAuth is desired later; use current hybrid mode with CLI/token first for MVP.

4. Phase 4 — Onboarding UX overhaul (depends on 1, 2, 3)
   4.1 Replace single-purpose Claude onboarding with multi-provider onboarding wizard.
   4.2 Keep onboarding fully optional with no reminders (per decision), while allowing one-click “Set up everything now.”
   4.3 Show granular status chips per provider/tool (install, auth, MCP, link readiness) and action buttons for retry/open login.
   4.4 Add per-project linking step (prompt per project) for GitHub→Vercel and GitHub→Railway relationships.

5. Phase 5 — Project linkage model + automation (depends on 1, 3, 4)
   5.1 Extend project metadata to store provider link state (team/org, project/service IDs, repo slug, branch).
   5.2 Implement link discovery from local git remotes and provider CLIs/APIs.
   5.3 Add “prompt per project” linking flow during onboarding and support later relink/unlink from UI.
   5.4 Use documented platform constraints:
   - Vercel repo/provider linking via `vercel git connect`
   - Railway repo linkage via service “Connect Repo” model and/or CLI/project linkage where available.

6. Phase 6 — Claude wiring for all integrations (depends on 2, 3, 5)
   6.1 Ensure Vercel and Railway MCP server configs are auto-added/toggled into project/global MCP config according to onboarding selection.
   6.2 Auto-inject required MCP env values (e.g., GitHub token) from secure storage when enabling MCP servers.
   6.3 Ensure agent spawn context includes integration readiness and linked project metadata so Claude can immediately operate on those systems.
   6.4 Restart active Claude sessions when MCP topology changes (reuse existing restart-all flow).

7. Phase 7 — Verification and hardening (depends on all phases)
   7.1 Add focused tests for installers/checkers, secure key persistence, link-state serialization, and IPC responses.
   7.2 Manual E2E validation of first-run flow in dev + packaged app.
   7.3 Failure-path checks: missing Node/npm, failed global install, OAuth/login cancel, revoked tokens, and partial onboarding completion.

**Relevant files**
- `c:\Users\offic\Projects\DAEMON\src\panels\Onboarding\Onboarding.tsx` — current onboarding entry; replace with multi-provider wizard.
- `c:\Users\offic\Projects\DAEMON\src\App.tsx` — current onboarding trigger logic via Claude connection; broaden to integration bootstrap state.
- `c:\Users\offic\Projects\DAEMON\src\store\ui.ts` — UI state for onboarding visibility; extend for step/progress state.
- `c:\Users\offic\Projects\DAEMON\electron\preload\index.ts` — expose new integrations API surface to renderer.
- `c:\Users\offic\Projects\DAEMON\src\types\daemon.d.ts` — add strongly-typed preload contracts for new integration IPC methods.
- `c:\Users\offic\Projects\DAEMON\electron\main\index.ts` — register new integrations IPC handlers.
- `c:\Users\offic\Projects\DAEMON\electron\ipc\claude.ts` — reuse restart + secure-key patterns; avoid duplication.
- `c:\Users\offic\Projects\DAEMON\electron\ipc\settings.ts` — extend for onboarding/integration preferences if app_settings is reused.
- `c:\Users\offic\Projects\DAEMON\electron\services\ClaudeRouter.ts` — reuse command execution, connection verification, and context injection patterns.
- `c:\Users\offic\Projects\DAEMON\electron\services\McpConfig.ts` — add env injection and idempotent MCP provisioning logic.
- `c:\Users\offic\Projects\DAEMON\electron\services\SecureKeyService.ts` — canonical encrypted credential storage for all provider tokens.
- `c:\Users\offic\Projects\DAEMON\electron\services\EnvService.ts` — reuse Vercel token/env patterns where applicable.
- `c:\Users\offic\Projects\DAEMON\electron\db\schema.ts` — add provider/link/onboarding persistence tables or keys.
- `c:\Users\offic\Projects\DAEMON\electron\db\migrations.ts` — migration and seed updates for new integration defaults.
- `c:\Users\offic\Projects\DAEMON\electron\ipc\projects.ts` — integrate per-project linking prompts with existing project lifecycle.
- `c:\Users\offic\Projects\DAEMON\src\panels\ClaudePanel\ClaudePanel.tsx` — ensure post-onboarding visibility of MCP/link status and controls.

**Verification**
1. Automated
   1.1 Run TypeScript checks and unit tests for new integration services/IPC handlers.
   1.2 Add/execute tests that simulate: install success, install failure, already-installed idempotency, token save/load, link metadata roundtrip.
2. Manual onboarding E2E
   2.1 Fresh profile: onboarding opens, optional skip works, no reminders shown.
   2.2 “Setup everything now” runs silent install path and produces deterministic statuses.
   2.3 Hybrid auth works per provider (CLI login + token path).
   2.4 Per-project prompts appear and persist accepted/declined link states.
   2.5 MCP entries appear in project/global lists and Claude session restart applies changes.
3. Packaged app parity
   3.1 Validate onboarding + installs + auth + linking in packaged build, not only dev.

**Decisions**
- Onboarding mode: fully optional, no reminders.
- Auth flow: hybrid OAuth/CLI, with CLI/token fallback.
- Install policy: silent auto-install.
- Default setup stack includes: Claude CLI check, Vercel CLI/login/git connect, Railway CLI/login/link, Vercel MCP, Railway MCP, Railway Claude plugin, GitHub MCP.
- Linking depth: prompt per project during onboarding.

**Scope boundaries**
- Included:
  - First-run/base-level integration system in DAEMON
  - Installer/check/auth/link orchestration
  - Claude/MCP wiring and secure token persistence
- Excluded for this implementation pass:
  - Full provider-specific rich management dashboards beyond onboarding and core status/actions
  - Autonomous background relinking/sync daemons
  - Non-requested providers beyond Claude/GitHub/Vercel/Railway

**Further Considerations**
1. Persistence shape recommendation: add dedicated `provider_accounts` + `project_provider_links` tables instead of overloading `app_settings` and `projects.infra`; cleaner migrations and querying.
2. Install execution recommendation: implement a command runner with explicit allowlist and structured logs to avoid shell injection and simplify support diagnostics.
3. MCP source-of-truth recommendation: keep user-level/global and project-level configs distinct, but derive renderer status from a normalized merged view to prevent UI confusion.

**Related artifacts**
- `/memories/session/features/daemon-ide-status-requirements-prd.md` — cleaned consolidated status + PRD requirements from latest review notes.
