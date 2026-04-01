# Plugin Implementation TODOs

Each plugin has a **context** (AI persona, templates, skills) and a **service** (IPC, business logic, UI).
Context system is complete for all 9 plugins. Service/UI work remains per plugin.

---

## Phase 9: Image Generator (imagegen)
- [x] Plugin context registered (system prompt, templates: generate/refine, skills: photo-real/ui-mockup/logo-icon)
- [x] Plugin registered in PLUGIN_REGISTRY
- [ ] ImageGenService — call Gemini imagen-4 API for generation
- [ ] Wire pluginPrompt('imagegen', 'generate') for prompt refinement before sending to imagen
- [ ] IPC handlers: imagegen:generate, imagegen:list, imagegen:delete
- [ ] Preload bridge: window.daemon.imagegen.*
- [ ] UI: prompt input, style/ratio selectors, gallery grid, image preview
- [ ] Save generated images to images table + ~/.daemon/images/
- [ ] Saga orchestration: generate prompt → call imagen → save file → insert DB

## Phase 10: Gmail Code Catcher (gmail)
- [x] Plugin context registered (system prompt, templates: extract/summarize, skills: code-detect/action-items)
- [x] Plugin registered in PLUGIN_REGISTRY
- [x] GmailService — OAuth2 flow via Google API (tokens in oauth_tokens table via safeStorage)
- [x] Wire pluginPrompt('gmail', 'extract') to parse email bodies
- [x] IPC handlers: gmail:auth-status, gmail:auth, gmail:exchange-code, gmail:logout, gmail:list, gmail:read, gmail:extract, gmail:summarize
- [x] Preload bridge: window.daemon.gmail.*
- [x] UI: auth flow (credentials + code exchange), inbox list, email viewer, extract + summarize buttons, extraction cards with copy
- [x] Saga orchestration: extract code via orchestratedPrompt
- [ ] Auto-detect code in new emails, surface in morning briefing
- [ ] Onboarding: Gmail OAuth setup during first-run

## Phase 11: Tweet Generator (tweet-generator)
- [x] Plugin context registered (system prompt, templates: original/reply/quote/thread, skills: ct-voice/solana-context/engagement-hooks/thread-craft)
- [x] TweetService refactored to use pluginPrompt + SagaOrchestrator
- [x] Voice profile reads from plugin context (falls back to legacy DB)
- [x] IPC handlers complete
- [x] Preload bridge complete
- [x] UI: TweetGenerator, VoiceProfileEditor, TweetVariations, DraftList
- [ ] Thread generation UI (uses 'thread' template, not yet wired)
- [ ] Plugin context editor UI (toggle skills, edit system prompt from Settings)
- [ ] Scheduled tweet drafts (morning batch generation)

## Phase 12: Subscription Manager (subscriptions)
- [x] Plugin context registered (system prompt, templates: analyze-usage/cost-alert/compare-plans, skills: usage-tracking/cost-optimization/overage-prediction)
- [x] Plugin registered in PLUGIN_REGISTRY
- [x] DB table: subscriptions (id, name, monthly_cost, renewal_day, usage_limit, usage_current, alert_at, url, api_key_hint)
- [ ] SubscriptionService — CRUD + usage tracking + alert logic
- [ ] Wire pluginPrompt('subscriptions', 'analyze-usage') for monthly reports
- [ ] Wire pluginPrompt('subscriptions', 'cost-alert') for overage warnings
- [ ] IPC handlers: subscriptions:list, subscriptions:add, subscriptions:update, subscriptions:delete, subscriptions:analyze
- [ ] Preload bridge: window.daemon.subscriptions.*
- [ ] UI: subscription list, add/edit modal, usage bars, cost breakdown chart
- [ ] Alert integration with morning briefing (flag services approaching limits)

## Phase 13: Remotion Panel (remotion)
- [x] Plugin context registered (full production formula hardwired, templates: scene/composition/animate/terminal-demo/encode, 10 skills)
- [x] Plugin registered in PLUGIN_REGISTRY
- [ ] RemotionService — manage localhost Remotion studio, render pipeline
- [ ] Wire pluginPrompt('remotion', 'scene') for AI scene generation
- [ ] Wire pluginPrompt('remotion', 'composition') for full video scaffolding
- [ ] Wire pluginPrompt('remotion', 'encode') for ffmpeg command generation
- [ ] IPC handlers: remotion:render, remotion:preview, remotion:generate-scene, remotion:list-compositions
- [ ] Preload bridge: window.daemon.remotion.*
- [ ] UI: composition browser, scene editor, render queue, preview iframe
- [ ] CompanionPanel (already in registry) — timeline, props editor
- [ ] Saga orchestration: generate scene → write file → preview → render → encode

## Phase 14: Browser + Playwright CDP (browser)
- [x] Plugin context registered (system prompt, templates: summarize-page/extract-data/compare-pages/audit-page, skills: content-extract/page-diff/security-recon/screenshot-analysis)
- [x] Plugin registered in PLUGIN_REGISTRY
- [x] BrowserService — fetch-based navigation, page caching, AI analysis via pluginPrompt
- [x] Wire pluginPrompt('browser', 'summarize-page') for page analysis
- [x] Wire pluginPrompt('browser', 'audit-page') for security recon
- [x] IPC handlers: browser:navigate, browser:content, browser:analyze, browser:audit, browser:history, browser:clear
- [x] Preload bridge: window.daemon.browser.*
- [x] UI: URL bar, page info, summarize/extract/audit buttons, content/analysis/history tabs, history list
- [x] Saga orchestration: analysis via orchestratedPrompt
- [ ] Playwright CDP integration (port 9222) for interactive automation
- [ ] Embedded webview for visual browsing (currently fetch-only)
- [ ] Screenshot capture + visual analysis
- [ ] Page diff tracking (compare states before/after actions)
- [ ] Onboarding: optional Playwright setup during first-run

## Phase 15: Context Bridge Extension
- [ ] VS Code extension that syncs DAEMON context to editor
- [ ] Bi-directional: editor selections → DAEMON plugins, DAEMON outputs → editor
- [ ] No plugin context needed (bridge, not AI consumer)

---

## Future Plugins

### Telegram (telegram)
- [x] Plugin context registered (system prompt, templates: compose/summarize-chat/reply/announcement, skills: ct-tone/dev-tone/chat-summary/formatting)
- [x] Plugin registered in PLUGIN_REGISTRY
- [ ] TelegramService — connect via telegram-user MCP or TDLib
- [ ] Wire pluginPrompt('telegram', 'compose') for message drafting
- [ ] Wire pluginPrompt('telegram', 'summarize-chat') for conversation digests
- [ ] IPC handlers: telegram:dialogs, telegram:read, telegram:send, telegram:summarize
- [ ] Preload bridge: window.daemon.telegram.*
- [ ] UI: dialog list, chat view, compose panel, channel management
- [ ] Integration with morning briefing (overnight message summaries)

### Morning Briefing (morning-briefing)
- [x] Plugin context registered (system prompt, templates: digest/prioritize, skills: error-triage/git-summary)
- [x] Plugin registered in PLUGIN_REGISTRY
- [ ] BriefingService — aggregate overnight data from all sources
- [ ] Wire pluginPrompt('morning-briefing', 'digest') for overnight compilation
- [ ] Wire pluginPrompt('morning-briefing', 'prioritize') for task ranking
- [ ] IPC handlers: briefing:generate, briefing:history, briefing:dismiss
- [ ] Preload bridge: window.daemon.briefing.*
- [ ] UI: overlay panel (already mounted as 'overlay' position), dismiss/snooze
- [ ] Data sources: error_logs, git activity, crash_history, overnight_runs, telegram, gmail
- [ ] DB table: overnight_runs (exists) — link briefings to run data

### Services Panel (services)
- [x] Plugin context registered (system prompt, templates: diagnose-crash/health-report/suggest-config/log-analysis, skills: crash-analysis/auto-fix/resource-monitor/log-parsing)
- [x] Plugin registered in PLUGIN_REGISTRY
- [x] DB tables: services, crash_history (exist)
- [ ] ServicesService — start/stop/restart, health checks, log capture
- [ ] Wire pluginPrompt('services', 'diagnose-crash') for crash analysis
- [ ] Wire pluginPrompt('services', 'log-analysis') for pattern detection
- [ ] IPC handlers: services:list, services:start, services:stop, services:logs, services:diagnose
- [ ] Preload bridge: window.daemon.services.*
- [ ] UI: service list with status dots, log viewer, crash history, config editor
- [ ] Auto-restart with crash analysis before retry
- [ ] Saga orchestration: detect crash → analyze logs → suggest fix → optionally auto-apply → restart

---

## Cross-Plugin Infrastructure (Complete)
- [x] PluginContextRegistry — register/get/update/toggle/reset per plugin
- [x] PluginPrompt — template interpolation, skill injection, ClaudeRouter routing
- [x] SagaOrchestrator — multi-step operations with compensation/rollback
- [x] orchestratedPrompt() — wraps pluginPrompt in saga steps
- [x] plugin_contexts DB table (V9 migration)
- [x] IPC: plugin-context:get/update/toggle-skill/reset/list
- [x] Preload: window.daemon.plugins.contextGet/Update/ToggleSkill/Reset/List
- [x] Type declarations: PluginContextConfig, PluginSkill, PromptTemplate
- [ ] Plugin Context Editor UI — settings panel to edit system prompts, toggle skills, switch models per plugin
