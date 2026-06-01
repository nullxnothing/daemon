# DAEMON AI Architecture & Build Plan

**Version:** Draft v0.1  
**Date:** May 12, 2026  
**Owner:** DAEMON / Spexx Music  
**Purpose:** Define how DAEMON should power, build, price, secure, and ship its in-house AI layer.

---

## 1. Executive Summary

DAEMON should not begin by training a full foundation model. The correct first product is an **in-house DAEMON AI agent layer** powered by frontier model providers, wrapped in DAEMON’s own context engine, tool runtime, Solana-native workflows, premium skills, usage metering, and entitlement system.

The product should be positioned as:

> **DAEMON AI = frontier models + DAEMON agent runtime + project context + local tools + Solana workflows + usage credits + holder access.**

The raw model is not the moat. The moat is that DAEMON knows the user’s development environment:

- active project
- files and selected code
- terminal output
- git state
- package/dependency structure
- MCP configuration
- wallet/RPC readiness
- Solana network context
- DAEMON Skills
- holder/subscription tier
- ship/deploy/launch workflow state

DAEMON should ship as an **open-core desktop workbench** with a **private hosted DAEMON AI Cloud**. Free users can use the local app and bring their own model keys. Paid users and eligible $DAEMON holders use DAEMON-hosted AI with monthly usage credits.

---

## 2. Product Direction

### 2.1 What DAEMON AI is

DAEMON AI is a platform-owned AI system that lives inside DAEMON. It is not just a chat box.

It should include:

1. **AI Chat** — project-aware Q&A, explanations, debugging, planning.
2. **Patch Mode** — AI proposes code changes as reviewable patches.
3. **Agent Mode** — AI reads files, plans, edits, runs commands, runs tests, and iterates with approval gates.
4. **Solana-Native Mode** — AI understands wallets, RPCs, programs, token workflows, launch flows, transaction safety, and deploy readiness.
5. **Cloud/Background Agents** — paid higher-tier agents that run longer tasks in isolated cloud environments.
6. **Premium DAEMON Skills** — private prompts, workflows, templates, and operator playbooks delivered from the backend.

### 2.2 What DAEMON AI is not at launch

DAEMON AI should **not** initially be:

- a custom-trained base model,
- an unlimited AI plan for holders,
- a client-only paywall,
- a hidden feature bundle in the public repo,
- an autonomous wallet transaction signer,
- a free model proxy with no cost controls.

Training a model may become a later research path, but the first commercial version should focus on the hosted agent layer.

---

## 3. Product Positioning

DAEMON should price and position closer to Cursor than to a small plugin.

Cursor’s current public pricing includes Free, Pro at $20/month, Pro+ at $60/month, Ultra at $200/month, and Teams at $40/user/month. Their paid tiers include more agent/model usage, frontier models, MCPs, skills, hooks, cloud agents, usage analytics, and admin features. See the official Cursor pricing page in the references section.

DAEMON should use a similar pricing shape but differentiate around Solana-native development and operator workflows.

### 3.1 Recommended DAEMON plans

| Plan | Price | Purpose |
|---|---:|---|
| **DAEMON Light** | Free | Local IDE/workbench and BYOK AI access. |
| **DAEMON Pro** | $20/month | Main paid plan with DAEMON AI, Pro Skills, Arena, and standard AI credits. |
| **DAEMON Operator** | $60/month | Heavy builder plan with higher AI limits, agent workflows, and advanced ship/deploy automation. |
| **DAEMON Ultra** | $200/month | Power-user plan with maximum usage, priority queue, premium models, and early access. |
| **DAEMON Teams** | $49/user/month target | Team billing, shared workspaces, admin controls, usage reporting, pooled credits. |

### 3.2 Holder access model

The holder model should be strong but cost-safe:

| Holder tier | Benefit |
|---|---|
| **1M+ $DAEMON** | Claim DAEMON Pro with included monthly DAEMON AI credits. |
| **5M+ $DAEMON** | Higher credit allowance or Operator discount. |
| **10M+ $DAEMON** | Ultra discount, priority access, private beta features. |

Public copy should be simple:

> **Hold 1,000,000 $DAEMON to claim DAEMON Pro with included monthly DAEMON AI usage.**

Holder access should not mean unlimited AI usage forever. AI usage has real provider cost, so holder access should include fair-use credits that reset monthly.

---

## 4. System Architecture

### 4.1 High-level architecture

```text
DAEMON Desktop App
  - editor
  - terminal
  - git
  - local project files
  - wallet/RPC panels
  - MCP management
  - local tool approval UI
  - BYOK provider keys, optional
        |
        | HTTPS / WebSocket / Server-Sent Events
        v
DAEMON AI Cloud
  - auth + entitlement checks
  - holder verification
  - subscription + billing
  - usage metering
  - model router
  - DAEMON agent runtime
  - context policy engine
  - premium skills/prompts/templates
  - cloud/background agents
        |
        v
Model Providers
  - OpenAI
  - Anthropic
  - Google Gemini
  - future local/open model providers
```

### 4.2 Core architectural decision

The desktop app should not directly use DAEMON’s production provider keys. The app should call DAEMON’s backend. The backend should:

- verify entitlement,
- meter usage,
- choose the model,
- enforce feature gates,
- store usage events,
- protect private prompts and premium assets,
- handle provider fallback,
- rate-limit abusive usage.

Free users can still use **BYOK Mode**, where they bring their own OpenAI, Anthropic, Gemini, or other provider keys. In that mode, DAEMON does not pay model costs.

---

## 5. Existing DAEMON Foundation

The current DAEMON repo already has useful foundations for this:

- Electron desktop app.
- React/TypeScript renderer.
- Main-process services and IPC.
- SQLite via `better-sqlite3`.
- Wallet and Solana services.
- Claude/Codex launcher patterns.
- MCP management.
- Pro entitlement skeleton.
- Pro IPC endpoints.
- Pro skills, Arena, priority quota, and MCP sync concepts.
- Dependencies that already indicate model/provider/payment support, including AI SDKs and x402/payment-related packages.

The next step is not to start from scratch. The next step is to formalize DAEMON AI as a first-class product surface and connect it to a private backend.

---

## 6. DAEMON AI Modes

### 6.1 BYOK Mode

**Audience:** Free Light users and developers who prefer their own provider accounts.

Behavior:

- User stores their own model provider API keys locally.
- DAEMON uses local keychain/secure storage.
- DAEMON can run local project-aware chat and agent flows through the user’s key.
- DAEMON does not pay inference cost.
- Premium DAEMON Skills, cloud agents, and private workflows still require entitlement.

BYOK Mode keeps the free product useful and reduces free-user COGS.

### 6.2 DAEMON Hosted AI

**Audience:** Pro, Operator, Ultra, Teams, and eligible holders.

Behavior:

- User authenticates through DAEMON Pro/holder flow.
- Desktop calls DAEMON AI Cloud.
- Backend routes to OpenAI, Anthropic, Gemini, or other providers.
- Usage is metered against monthly credits.
- Premium skills and workflow templates are served by the backend.
- Higher tiers receive better limits, priority, and model access.

Hosted AI is the paid product.

---

## 7. Desktop Integration

### 7.1 New desktop files

Recommended additions:

```text
electron/ipc/daemon-ai.ts
electron/services/DaemonAIService.ts
electron/services/ContextService.ts
electron/services/ToolApprovalService.ts
electron/shared/ai-types.ts
src/panels/DaemonAI/
src/panels/DaemonAI/DaemonAIChat.tsx
src/panels/DaemonAI/AgentRunView.tsx
src/panels/DaemonAI/PatchPreview.tsx
src/store/aiStore.ts
src/lib/ai/features.ts
```

### 7.2 Preload bridge

Add a new `window.daemon.ai` surface:

```ts
window.daemon.ai = {
  chat(input),
  streamChat(input),
  createAgentRun(input),
  cancelAgentRun(runId),
  approveToolCall(runId, toolCallId, decision),
  getUsage(),
  getModels(),
  summarizeContext(input),
}
```

### 7.3 Renderer surfaces

Required UI surfaces:

1. **DAEMON AI panel** — chat, plan, patch, agent run history.
2. **AI usage panel** — credits remaining, reset date, current plan.
3. **Model selector** — Auto, Fast, Pro, Reasoning, Premium.
4. **Context selector** — selected file, active tab, git diff, terminal logs, full project.
5. **Tool approval modal** — file edits, terminal commands, package installs, git operations, deploys.
6. **Patch preview panel** — accept/reject changes.
7. **Plan/upgrade gate** — free users see BYOK path and upgrade path.

---

## 8. DAEMON AI Cloud Backend

### 8.1 Recommended repo structure

DAEMON AI backend should live in a private repo or private folder until the business model is mature.

```text
daemon-pro-api/
  src/
    auth/
      jwt.ts
      sessions.ts
      walletChallenge.ts
      holderVerification.ts

    entitlements/
      entitlementService.ts
      planFeatures.ts
      holderTiers.ts
      offlineGrace.ts

    billing/
      subscriptions.ts
      x402.ts
      stripe.ts optional
      credits.ts
      invoices.ts

    ai/
      chatController.ts
      agentController.ts
      modelRouter.ts
      usageMeter.ts
      contextPolicy.ts
      promptBuilder.ts
      streaming.ts
      safety.ts

    agents/
      agentRuntime.ts
      daemonBuildAgent.ts
      daemonDebugAgent.ts
      solanaAgent.ts
      shiplineAgent.ts
      tokenLaunchAgent.ts
      securityAuditAgent.ts

    tools/
      toolSchemas.ts
      toolBroker.ts
      localToolResults.ts
      mcpRegistry.ts
      permissions.ts

    providers/
      openaiProvider.ts
      anthropicProvider.ts
      geminiProvider.ts
      providerFallback.ts

    skills/
      skillManifest.ts
      skillDownload.ts
      premiumSkills.ts

    arena/
      submissions.ts
      votes.ts

    sync/
      mcpSync.ts
      workspaceSync.ts

    db/
      schema.ts
      migrations.ts
      adapters.ts
```

### 8.2 Backend responsibilities

The backend should own:

- plan enforcement,
- holder verification,
- subscription verification,
- AI request metering,
- model selection,
- private prompt storage,
- premium skill delivery,
- cloud agent orchestration,
- request audit logs,
- abuse prevention,
- model provider fallback.

The backend should never trust the desktop app’s local entitlement state for paid server features.

---

## 9. Model Router

### 9.1 Purpose

The model router decides which provider/model should handle each task.

It should consider:

- user plan,
- remaining credits,
- task type,
- context size,
- required reasoning depth,
- latency target,
- provider availability,
- user-selected model preference,
- cost controls,
- safety constraints.

### 9.2 Model lanes

| Lane | Purpose | Example use |
|---|---|---|
| **Fast** | Low-cost, low-latency tasks | Summaries, titles, small Q&A. |
| **Standard** | Main coding help | Code explanation, debugging, regular chat. |
| **Reasoning** | Complex planning/debugging | Architecture, audits, multi-step fixes. |
| **Premium** | Highest-quality work | Large refactors, hard Solana problems, security analysis. |
| **Background** | Long-running agent work | Cloud tasks, repo audits, app generation. |

### 9.3 Provider strategy

Use multiple providers from the beginning:

- OpenAI for strong general coding, structured outputs, tool calling, and agent workflows.
- Anthropic for coding agents, long-context workflows, Claude Code compatibility, and agentic file/code patterns.
- Gemini or other providers for fallback, speed, and cost diversity.
- Future local/open models for lightweight tasks or privacy-sensitive features.

Do not hardcode the product to one provider.

### 9.4 Cost controls

The router should:

- default to cheaper models for simple tasks,
- use expensive models only when justified,
- cache repeated context where possible,
- summarize context before sending huge payloads,
- cap max output tokens by task type,
- downgrade or ask for confirmation when a task is expensive,
- fallback on provider failure,
- record exact provider cost per request.

---

## 10. Context Engine

### 10.1 Context sources

DAEMON AI should be able to use:

| Context source | Included by default? | Notes |
|---|---:|---|
| Active file | Yes | Selected/visible file content. |
| Selected code | Yes | Highest priority context. |
| Open tabs | Optional | Include only relevant snippets. |
| Project tree | Yes | Structure only, not full content. |
| Git diff | Optional | Strongly useful for review and patch tasks. |
| Terminal logs | Optional | User should choose or approve. |
| Package manifests | Yes | `package.json`, lockfiles, config files. |
| Error logs | Optional | Useful for debugging. |
| Wallet public address | Optional | Public metadata only. |
| Token balances | Optional | Only for explicit Solana/wallet tasks. |
| Secrets/API keys | Never | Must be redacted/blocked. |
| Private keys | Never | Must never be sent or exposed. |

### 10.2 Context policy

The context engine must follow strict rules:

1. Never send private keys.
2. Never send secure keychain values.
3. Redact `.env` values by default.
4. Ask before including terminal logs if they may contain secrets.
5. Ask before including wallet holdings or addresses in cloud context.
6. Respect ignored files and directories.
7. Limit file size and total context size.
8. Prefer summaries and snippets over full-project dumps.
9. Show users what context is being used.
10. Keep cloud-stored context ephemeral unless the user opts in.

### 10.3 Context building pipeline

```text
User request
  -> classify task
  -> choose context recipe
  -> collect local context
  -> redact sensitive content
  -> rank relevance
  -> summarize if needed
  -> attach metadata
  -> send to backend/model
```

---

## 11. Agent Runtime

### 11.1 Agent run lifecycle

```text
User task
  -> create agent run
  -> classify intent
  -> collect context
  -> create plan
  -> request tool calls
  -> require approvals where needed
  -> apply safe actions
  -> run checks/tests
  -> iterate
  -> produce final summary
```

### 11.2 Agent types

| Agent | Purpose |
|---|---|
| **DAEMON Build Agent** | Adds features, edits files, runs checks. |
| **DAEMON Debug Agent** | Diagnoses build/runtime/test failures. |
| **Solana Agent** | Handles Solana programs, clients, wallets, transactions, and RPC issues. |
| **Security Audit Agent** | Finds vulnerabilities in web/Electron/Solana code. |
| **Shipline Agent** | Helps prepare, build, deploy, and ship apps. |
| **Token Launch Agent** | Assists token launch workflows with strict safety approvals. |
| **App Factory Agent** | Turns product specs into app scaffolds and implementation plans. |
| **Docs Agent** | Writes README, docs, changelogs, and launch copy. |

### 11.3 Agent modes

| Mode | Description | User approval level |
|---|---|---|
| **Ask** | AI answers questions only. | No action approval needed. |
| **Plan** | AI produces an implementation plan. | No action approval needed. |
| **Patch** | AI proposes file changes. | User accepts patch. |
| **Agent** | AI can run tools with approvals. | Tool approvals required. |
| **Background** | AI runs longer cloud tasks. | Higher-tier only, strict sandboxing. |

---

## 12. Tooling and Permissions

### 12.1 Local tool broker

The desktop app should expose tools through a broker, not give the model direct system access.

Example local tools:

```text
read_file
search_files
list_project_tree
get_active_file
get_git_status
get_git_diff
write_patch
run_terminal_command
run_tests
inspect_package_json
create_file
rename_file
delete_file_safe
git_stage
git_commit_draft
open_external_url
```

Example Solana tools:

```text
get_wallet_public_info
check_token_balance
inspect_transaction
simulate_transaction
prepare_devnet_deploy
read_anchor_program
audit_anchor_accounts
generate_solana_client
explain_transaction
prepare_token_launch_plan
```

### 12.2 Permission matrix

| Action | Default rule |
|---|---|
| Read selected file | Allowed. |
| Search workspace | Allowed after workspace access is granted. |
| Read ignored/sensitive paths | Blocked unless explicitly approved. |
| Read `.env` values | Redacted by default. |
| Write code | Patch preview required. |
| Run tests | Can be allowed per project setting. |
| Run terminal command | Approval required. |
| Install package | Approval required. |
| Delete files | Approval required and high-friction warning. |
| Git commit | User approval required. |
| Git push | User approval required. |
| Deploy | User approval required. |
| Wallet transaction | User approval/signature required. |
| Export private key | Never allowed for AI. |
| Sign transaction | Never autonomous; user must explicitly sign. |

### 12.3 Wallet safety rule

DAEMON AI can:

- explain transactions,
- prepare transactions,
- simulate transactions,
- warn about risks,
- generate transaction code,
- guide devnet testing.

DAEMON AI must not:

- export private keys,
- sign transactions invisibly,
- bypass user confirmation,
- execute token launch/buy/sell actions without explicit user approval.

---

## 13. Entitlements and Holder Access

### 13.1 Entitlement sources

| Access source | Meaning |
|---|---|
| **free** | DAEMON Light. |
| **payment** | Active paid subscription. |
| **holder** | Eligible $DAEMON wallet holder. |
| **admin** | Manual/admin grant. |
| **dev_bypass** | Local development only, never production. |

### 13.2 Holder verification flow

```text
User selects wallet
  -> backend creates nonce + challenge message
  -> desktop asks wallet/keypair to sign message
  -> backend verifies signature
  -> backend checks $DAEMON balance
  -> if balance >= threshold, backend issues entitlement token
  -> desktop stores entitlement metadata locally
```

Rules:

- Use message signing, not transaction signing.
- Nonce must expire quickly.
- Nonce must be single-use.
- Backend must verify signature server-side.
- Backend must verify token balance server-side.
- Holder status should refresh periodically.
- If holder falls below threshold, access expires after grace period.

### 13.3 Suggested holder thresholds

| Threshold | Access |
|---|---|
| **1M $DAEMON** | Pro plan + monthly Pro AI credits. |
| **5M $DAEMON** | More AI credits or Operator discount. |
| **10M+ $DAEMON** | Ultra discount, priority access, beta access. |

### 13.4 Offline grace

The desktop app may cache entitlement locally so the UI works offline, but server-required features should still require backend verification.

Suggested behavior:

- Local entitlement can unlock UI immediately.
- Backend refresh runs in the background.
- If backend is offline, allow a short offline grace window.
- After grace expires, premium server features lock until refreshed.
- Local state must not be trusted to download premium assets or run hosted AI.

---

## 14. Usage Credits and Metering

### 14.1 Why credits

DAEMON should not expose raw token accounting to most users. Use **DAEMON AI Credits** as the product abstraction.

Credits let DAEMON:

- meter usage across multiple providers,
- simplify plan limits,
- protect margins,
- reward holders,
- support usage packs,
- route users to cheaper models when needed.

### 14.2 Suggested credit structure

These are internal starting points, not final public copy:

| Plan | Monthly AI access concept |
|---|---|
| **Light** | BYOK + optional tiny trial. |
| **Pro** | Standard DAEMON AI credits. |
| **Operator** | 3–4x Pro usage. |
| **Ultra** | 15–20x Pro usage. |
| **Teams** | Pooled team credits. |
| **1M holder** | Pro-level credits. |
| **5M holder** | Extra credits or discount. |
| **10M holder** | Higher credits, priority, beta access. |

### 14.3 Usage ledger

Every AI event should produce a usage ledger record:

```ts
type AiUsageEvent = {
  id: string
  userId: string
  walletAddress?: string
  plan: 'free' | 'pro' | 'operator' | 'ultra' | 'teams'
  accessSource: 'free' | 'payment' | 'holder' | 'admin' | 'dev_bypass'
  feature: string
  provider: 'openai' | 'anthropic' | 'google' | 'local' | 'other'
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  providerCostUsd: number
  daemonCreditsCharged: number
  createdAt: number
}
```

### 14.4 Overage behavior

When credits run low:

1. Notify user early.
2. Offer cheaper model lane.
3. Offer BYOK fallback.
4. Offer upgrade.
5. Offer usage pack.
6. For Teams, allow admin-controlled overages.

---

## 15. API Contract

### 15.1 AI endpoints

```text
POST /v1/ai/chat
POST /v1/ai/chat/stream
POST /v1/ai/agent/runs
GET  /v1/ai/agent/runs/:runId
POST /v1/ai/agent/runs/:runId/cancel
POST /v1/ai/tool-result
POST /v1/ai/context/summarize
GET  /v1/ai/usage
GET  /v1/ai/models
GET  /v1/ai/features
```

### 15.2 Example chat request

```json
{
  "conversationId": "conv_123",
  "mode": "ask",
  "message": "Why is my Solana build failing?",
  "projectId": "proj_abc",
  "context": {
    "activeFile": true,
    "gitDiff": true,
    "terminalLogs": true,
    "walletContext": false
  },
  "modelPreference": "auto"
}
```

### 15.3 Example chat response

```json
{
  "ok": true,
  "data": {
    "messageId": "msg_456",
    "conversationId": "conv_123",
    "text": "The build is failing because...",
    "usedContext": [
      "terminal:latest-build-log",
      "file:programs/example/src/lib.rs",
      "file:Anchor.toml"
    ],
    "usage": {
      "creditsCharged": 12,
      "remainingCredits": 1830
    }
  }
}
```

### 15.4 Agent run request

```json
{
  "task": "Add holder verification UI to the Pro settings panel.",
  "projectId": "proj_abc",
  "mode": "patch",
  "allowedTools": [
    "read_file",
    "search_files",
    "write_patch",
    "run_tests"
  ],
  "approvalPolicy": "require_for_write_and_terminal"
}
```

### 15.5 Tool call approval object

```ts
type ToolApprovalRequest = {
  runId: string
  toolCallId: string
  toolName: string
  riskLevel: 'low' | 'medium' | 'high' | 'blocked'
  summary: string
  argumentsPreview: unknown
  requiresApproval: boolean
}
```

---

## 16. Data Model

### 16.1 Backend tables

Recommended backend tables:

```text
users
wallet_identities
entitlements
holder_verifications
subscriptions
ai_credit_balances
ai_usage_ledger
ai_conversations
ai_messages
agent_runs
agent_steps
tool_approval_events
skill_manifests
skill_downloads
mcp_sync_snapshots
audit_logs
```

### 16.2 Local desktop tables

Recommended local tables:

```text
ai_local_conversations
ai_local_messages
ai_context_preferences
ai_recent_runs
ai_tool_approval_history
pro_state
```

Local storage should be treated as convenience state, not proof of entitlement for server features.

---

## 17. Build Phases

## Phase 0 — Foundation Audit

**Goal:** Confirm existing Pro, wallet, AI, MCP, and IPC structure.

Deliverables:

- feature entitlement map,
- paywall matrix,
- existing ProService audit,
- backend contract,
- desktop integration plan.

Success condition:

- DAEMON has a clear map of what is Free, Pro, Operator, Ultra, and holder-accessible.

---

## Phase 1 — DAEMON AI Chat MVP

**Goal:** Launch the first hosted DAEMON AI experience.

Features:

- DAEMON AI panel,
- project-aware chat,
- streaming responses,
- model router v1,
- entitlement check,
- usage metering,
- BYOK fallback,
- basic context selector.

User value:

- Users can ask DAEMON AI about their project, errors, Solana code, and build issues.

Backend work:

- `/v1/ai/chat`,
- `/v1/ai/chat/stream`,
- provider adapters,
- entitlement middleware,
- usage ledger.

Desktop work:

- AI panel,
- preload bridge,
- IPC service,
- context collector,
- Pro/holder gating.

---

## Phase 2 — Patch Preview Mode

**Goal:** Let DAEMON AI propose code edits safely.

Features:

- AI returns unified diffs or structured patches,
- patch preview UI,
- accept/reject per file/hunk,
- local apply patch,
- typecheck/test suggestion.

User value:

- Users can get code changes without handing the app full autonomous control.

Safety:

- No silent file writes.
- No destructive edits without explicit approval.

---

## Phase 3 — Local Agent Mode

**Goal:** Give DAEMON AI controlled local tools.

Features:

- read/search files,
- inspect git status/diff,
- write patch,
- run tests,
- run approved terminal commands,
- iterate on failures,
- produce final summaries.

User value:

- DAEMON becomes a real agentic coding environment.

Safety:

- Approval required for writes, terminal, package installs, git commits, deploys.

---

## Phase 4 — Solana-Native DAEMON AI

**Goal:** Differentiate DAEMON from generic AI editors.

Features:

- Solana program analysis,
- Anchor account validation,
- transaction explanation,
- token balance checks,
- devnet deploy preparation,
- token launch planning,
- wallet/RPC readiness checks,
- Helius/Jupiter/Pump/Raydium/Meteora-aware workflows.

User value:

- DAEMON becomes the AI-native Solana workbench.

Safety:

- AI can prepare/simulate/explain transactions.
- User must explicitly sign any transaction.

---

## Phase 5 — Cloud/Background Agents

**Goal:** Create the Operator/Ultra value layer.

Features:

- cloud sandboxes,
- repo-connected tasks,
- long-running builds/audits,
- background app generation,
- priority queue,
- resumable runs,
- run logs and artifacts.

User value:

- Users can delegate bigger tasks while keeping local DAEMON as the control center.

Requires:

- isolated execution,
- provider cost controls,
- artifact storage,
- abuse prevention,
- stronger audit logs.

---

## Phase 6 — Teams and Enterprise

**Goal:** Monetize collaboration.

Features:

- team accounts,
- pooled usage,
- shared rules/prompts/skills,
- admin controls,
- usage reporting,
- SSO/SAML/OIDC later,
- org-level privacy controls,
- audit logs.

---

## 18. First Implementation Sequence

Recommended PR sequence:

1. **Entitlement model**
   - Create typed plans, access sources, features, holder status, and usage state.

2. **AI backend contract**
   - Document endpoints and request/response schemas.

3. **Desktop AI IPC/preload surface**
   - Add `window.daemon.ai` and main-process handler skeleton.

4. **DAEMON AI panel**
   - Add chat UI, streaming state, context selector, plan gate.

5. **Hosted model gateway**
   - Add private backend endpoint with model router v1.

6. **Usage metering**
   - Add credits, ledger, plan limits, and UI usage display.

7. **Holder entitlement integration**
   - Connect holder access to AI credits and plan status.

8. **Patch preview mode**
   - AI can propose patches; users approve.

9. **Tool broker**
   - Add safe local tools with approval rules.

10. **Solana-native tools**
   - Add wallet/RPC/devnet/transaction explanation tools.

11. **Premium skills backend**
   - Move private DAEMON Skills out of the public repo.

12. **Cloud agent beta**
   - Operator/Ultra only.

---

## 19. Security Requirements

### 19.1 Hard requirements

- DAEMON production provider keys must never be stored in the desktop app.
- Premium prompts, templates, and skills must not live in the public repo.
- Server-required features must verify entitlement server-side.
- Holder access must be verified server-side.
- All AI tool actions must pass through a permission broker.
- AI must never export private keys.
- AI must never silently sign wallet transactions.
- File writes require patch preview or explicit approval.
- Terminal commands require explicit approval unless user whitelists a safe class.
- MCP servers and commands require explicit consent.
- Tool descriptions from untrusted MCP servers should not be blindly trusted.
- Secrets must be redacted before cloud context upload.

### 19.2 Prompt injection risks

DAEMON AI should treat project files, terminal output, web content, and MCP resources as untrusted input.

Mitigations:

- separate system/developer instructions from project content,
- never let file content override safety policies,
- require tool approval for risky operations,
- scan tool arguments for dangerous patterns,
- restrict file access to project roots,
- show users what the AI is about to do.

### 19.3 MCP risks

MCP is powerful because it standardizes tools, prompts, and resources for LLM apps. It also introduces risk because tools can represent arbitrary code execution or sensitive data access. DAEMON should implement explicit consent, clear tool descriptions, command previews, per-server trust, and revocation controls.

---

## 20. Open-Core and Paywall Strategy

DAEMON can remain useful as a public/open-core local app, but premium value must be protected by the backend.

### 20.1 Public/free layer

Can remain public:

- editor,
- terminal,
- git,
- local projects,
- local wallet basics,
- BYOK AI wiring,
- basic MCP setup,
- sample/free skills,
- docs,
- core UI.

### 20.2 Private/paid layer

Should be private/backend protected:

- hosted DAEMON AI,
- model router provider keys,
- premium DAEMON Skills,
- premium prompts,
- App Factory templates,
- cloud agents,
- Arena server operations,
- priority API,
- MCP cloud sync,
- premium Solana/operator workflows.

### 20.3 Why this matters

A client-only paywall can be bypassed. A server-enforced paywall around hosted AI, private assets, cloud sync, and cloud agents is much stronger.

---

## 21. Testing Plan

### 21.1 Unit tests

- entitlement helpers,
- holder tier logic,
- usage credit calculations,
- model routing decisions,
- context redaction,
- tool risk classification,
- patch parsing,
- API schema validation.

### 21.2 Integration tests

- Pro user can call DAEMON AI,
- free user is gated from hosted AI,
- BYOK user can call local provider path,
- holder claim unlocks Pro credits,
- expired holder access locks hosted AI,
- usage ledger records provider cost,
- patch preview applies cleanly,
- terminal command approval is required.

### 21.3 E2E tests

- fresh install opens as DAEMON Light,
- AI panel shows BYOK/upgrade CTA,
- Pro subscription unlocks hosted chat,
- holder wallet claim unlocks hosted chat,
- AI explains a project error,
- AI proposes a patch,
- user accepts patch,
- tests run after approval,
- usage decreases after AI request.

---

## 22. Operational Metrics

Track these from day one:

### Product metrics

- DAEMON Light installs,
- AI panel opens,
- first AI message rate,
- Pro conversion rate,
- holder claim rate,
- accepted patch rate,
- successful agent run rate,
- average time saved per workflow,
- Arena/Skills usage.

### Cost metrics

- provider cost per user,
- provider cost per plan,
- gross margin by plan,
- average credits used,
- overage rate,
- model fallback rate,
- cache hit rate.

### Safety metrics

- denied tool calls,
- cancelled tool calls,
- high-risk command approvals,
- patch rejection rate,
- redaction events,
- wallet action approvals,
- failed holder verifications.

---

## 23. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Model costs exceed subscription revenue | High | Usage credits, routing, caps, BYOK, overages. |
| Client paywall bypass | High | Server-side enforcement and private assets. |
| Prompt injection causes unsafe tool use | High | Tool broker, approvals, untrusted-context policy. |
| Wallet action confusion | High | Message signing only for holder claim; explicit transaction warnings. |
| Provider outage | Medium | Multi-provider router and fallback. |
| Latency hurts UX | Medium | Streaming, fast model lane, local summaries. |
| Free users drain AI | High | BYOK by default, tiny trial only. |
| Holder users drain unlimited AI | High | Monthly holder credits and fair-use caps. |
| Premium assets leak in public repo | Medium | Private backend/private asset repo. |
| Cloud agents abuse compute | High | Sandboxing, quotas, rate limits, audit logs. |

---

## 24. MVP Definition

The first public DAEMON AI release should include:

1. DAEMON AI panel.
2. Hosted chat for Pro/holders.
3. BYOK chat for Free Light users.
4. Context selector.
5. Streaming responses.
6. Model router v1.
7. Usage credits.
8. Holder entitlement connection.
9. Plan/upgrade UI.
10. Basic Solana-aware system prompt.
11. Basic project-aware debugging.
12. No autonomous file writes yet.

This is the smallest version that can justify DAEMON Pro at $20/month.

---

## 25. V1 Definition

The first major DAEMON AI version should add:

1. Patch preview mode.
2. AI-generated code diffs.
3. Test running with approval.
4. Git diff review.
5. Solana transaction explanation.
6. Devnet deploy preparation.
7. Premium skill downloads.
8. Advanced usage dashboard.
9. Operator tier higher limits.
10. Agent run history.

This is where DAEMON starts feeling meaningfully different from a normal chat panel.

---

## 26. V2 Definition

The second major DAEMON AI version should add:

1. Local agent mode.
2. Approved terminal command execution.
3. Multi-step debugging loops.
4. App Factory beta.
5. Shipline beta.
6. Cloud/background agent private beta.
7. Teams billing foundation.
8. Shared team skills/rules.
9. Pooled credits.
10. Admin usage analytics.

This is where DAEMON can support Operator and Ultra pricing confidently.

---

## 27. Suggested Public Copy

### DAEMON AI

> DAEMON AI is a Solana-native development agent built into the DAEMON workbench. It understands your project, terminal, git state, wallet context, MCPs, and shipping workflows so you can debug, build, and launch faster.

### DAEMON Light

> Free local development workbench. Use the editor, terminal, git, wallet basics, local agents, MCPs, and bring your own AI keys.

### DAEMON Pro

> $20/month. Unlock DAEMON-hosted AI, Pro Skills, Arena, premium workflows, and monthly AI credits.

### DAEMON Operator

> $60/month. Higher DAEMON AI limits, advanced agent workflows, Shipline/App Factory access, and priority builder tools.

### DAEMON Ultra

> $200/month. Maximum usage, premium model access, priority queue, early features, and advanced operator automation.

### $DAEMON Holder Access

> Hold 1,000,000 $DAEMON to claim DAEMON Pro with included monthly DAEMON AI usage. Higher holder tiers unlock larger allowances, discounts, and early access.

Avoid investment language. The token should be described as a product access and community benefit, not equity, dividends, yield, profit expectation, or financial return.

---

## 28. Codex Implementation Prompts

### Prompt A — DAEMON AI architecture audit

```text
Audit the current DAEMON repo for all AI, Pro, MCP, wallet, terminal, and agent-related files. Produce a map of what already exists, what should power DAEMON AI, what needs to move behind a backend, and the smallest implementation path for a DAEMON AI Chat MVP. Do not modify code.
```

### Prompt B — Add DAEMON AI shared types

```text
Create shared TypeScript types for DAEMON AI: plans, access sources, model lanes, chat requests, streaming events, usage events, agent runs, tool calls, approval requests, and patch proposals. Add tests for helper functions. Do not implement provider calls yet.
```

### Prompt C — Add DAEMON AI desktop surface

```text
Add a new DAEMON AI panel with chat UI, context selector, streaming-ready state, usage display placeholder, and Pro/BYOK gate. Wire it through preload and IPC using mock responses only. Keep styling aligned with the existing app.
```

### Prompt D — Add hosted AI backend gateway

```text
Implement a private/backend-ready DAEMON AI gateway with /v1/ai/chat, entitlement middleware, usage metering stub, and model provider abstraction. Add OpenAI and Anthropic provider interfaces but keep secrets in environment variables only.
```

### Prompt E — Add patch preview mode

```text
Implement patch proposal support for DAEMON AI. The model/backend returns structured patch operations or unified diffs. The renderer shows a patch preview and lets users accept or reject changes. No silent writes.
```

---

## 29. References

These are external references that informed this plan. Always re-check pricing/API details before publishing final public copy.

1. Cursor Pricing — Free, Pro $20/month, Pro+ $60/month, Ultra $200/month, Teams $40/user/month.  
   https://cursor.com/pricing

2. OpenAI Responses API — stateful interactions, built-in tools, file search, web search, computer use, function calling, and MCP tools.  
   https://platform.openai.com/docs/api-reference/responses/retrieve

3. OpenAI Tools Guide — built-in tools, remote MCP, web search, file search, and function calling.  
   https://platform.openai.com/docs/guides/tools

4. OpenAI API Pricing — model and tool pricing changes over time; use for cost modeling only after re-checking current numbers.  
   https://openai.com/api/pricing/

5. Anthropic Claude Code SDK — coding agents, file operations, code execution, MCP extensibility, permissions, session management, and monitoring.  
   https://docs.anthropic.com/en/docs/claude-code/sdk

6. Anthropic API Pricing — model pricing and prompt caching.  
   https://platform.claude.com/docs/en/about-claude/pricing

7. Model Context Protocol Specification — MCP resources, prompts, tools, and trust/safety principles.  
   https://modelcontextprotocol.info/specification/2025-11-25/

8. MCP Security Best Practices — consent, OAuth, command execution, and related MCP risks.  
   https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices

---

## 30. Final Recommendation

Build DAEMON AI in this order:

1. **Hosted AI backend gateway**
2. **Entitlement + usage credits**
3. **DAEMON AI chat panel**
4. **Project context engine**
5. **Streaming responses**
6. **BYOK fallback**
7. **Holder credit integration**
8. **Patch preview mode**
9. **Local agent tools with approvals**
10. **Solana-native tools**
11. **Premium skills backend**
12. **Cloud/background agents**

The first commercial goal is simple:

> Make DAEMON Pro worth $20/month by shipping DAEMON-hosted, project-aware, Solana-native AI chat with usage credits and holder access.

The longer-term goal:

> Make DAEMON Operator and Ultra worth $60–$200/month by adding safe local agents, premium Solana workflows, App Factory/Shipline automation, and cloud/background agents.
