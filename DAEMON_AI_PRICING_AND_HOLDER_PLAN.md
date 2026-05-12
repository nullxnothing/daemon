# DAEMON AI Pricing & Holder Access Plan

**Version:** 1.0  
**Date:** May 12, 2026  
**Purpose:** Define the paid DAEMON model now that DAEMON is positioned as an AI-native development platform, not just a free/open-source Electron workbench.

---

## 1. Core Decision

DAEMON should not be priced like a small plugin or utility.

The product direction should be:

> **DAEMON is an AI-native development environment for builders, agents, Solana workflows, launch tooling, and autonomous shipping.**

That means the main paid plan should be priced closer to Cursor, not at 5 USDC/month.

The recommended structure is:

| Plan | Price | Target User | Summary |
|---|---:|---|---|
| **DAEMON Light** | **Free** | New users, open-source users, local builders | Free local IDE/workbench. Useful, but not the full DAEMON AI platform. |
| **DAEMON Pro** | **$20/month** | Individual builders | Main paid plan. Includes DAEMON AI, Pro Skills, Arena, and advanced workflows. |
| **DAEMON Operator** | **$60/month** | Heavy AI/agent users | Higher DAEMON AI usage, larger context, more agent runs, priority workflows. |
| **DAEMON Ultra** | **$200/month** | Power users, serious operators | Maximum individual usage, priority model access, early features, premium automation. |
| **DAEMON Teams** | **$49/user/month** | Small teams and studios | Shared workspaces, team billing, pooled usage, admin controls. |
| **Enterprise** | **Custom** | Larger teams, funds, labs, agencies | Custom limits, support, compliance, private deployments, invoicing. |

Benchmark note: Cursor currently has a similar pricing ladder: Free, Pro at $20/month, Pro+ at $60/month, Ultra at $200/month, and Teams at $40/user/month. Source: <https://cursor.com/pricing>

---

## 2. What Happened to the 5 USDC Price?

The old **5 USDC** price should not be the main DAEMON AI subscription.

It can still be used for one of these:

1. **Legacy early-access price** before DAEMON AI fully launches.
2. **Arena-only pass** for users who do not need the full AI platform.
3. **Weekly Pro pass** for short-term access.
4. **Beta/community promotional price** for early users.
5. **Non-AI Pro add-on** if the product ever separates AI from workflow features.

Recommended decision:

> Keep **5 USDC** as an optional early/beta/arena price, but make **$20/month** the real DAEMON Pro anchor once DAEMON AI launches.

---

## 3. DAEMON Light — Free

**Price:** $0  
**Purpose:** Let anyone try DAEMON and use the local workbench.

DAEMON Light should be useful enough that people can actually build with it.

### Included

- Local editor
- Terminal
- Git tools
- Local project management
- Basic wallet panel
- Basic token/portfolio viewing
- Bring-your-own-key Claude/Codex launching
- Local MCP setup
- Settings
- Basic docs
- Basic local tools
- Community/free templates

### Not Included

- DAEMON AI hosted usage
- Premium model routing
- DAEMON Pro Skills
- Cloud/background agents
- Cloud MCP sync
- Premium App Factory/Shipline flows
- Priority API quota
- Premium launch/deploy automation
- Private workflow templates
- Team/shared workspaces

### Product Copy

> **DAEMON Light**  
> Free local AI-native workbench for builders. Use the editor, terminal, git, local agents, wallet tools, and project workspace without a subscription.

---

## 4. DAEMON Pro — $20/month

**Price:** $20/month  
**Annual Option:** $192/year, equivalent to $16/month  
**Purpose:** Main paid plan for individual builders.

This is the plan most people should buy.

### Included

- DAEMON AI chat
- Project-aware AI assistant
- Solana-aware development assistant
- AI code generation and refactoring
- AI debugging
- AI terminal help
- DAEMON Pro Skills
- DAEMON Arena access
- Basic App Factory access
- Basic Shipline/deploy flows
- MCP/hook support
- Standard cloud sync
- Standard hosted usage limits

### Suggested Usage Positioning

Use a **DAEMON AI credit system** internally instead of promising unlimited usage.

Recommended starting point:

| Limit Type | Pro Suggested Limit |
|---|---:|
| DAEMON AI credits | Standard monthly allocation |
| Agent runs | Moderate monthly limit |
| Cloud/background agents | Limited |
| Project indexing | Standard project sizes |
| Premium skills | Included |
| Priority queue | Standard |

Avoid publishing exact token math at first. Use “monthly AI usage included” and tune based on actual model/API cost.

### Product Copy

> **DAEMON Pro — $20/month**  
> Unlock DAEMON AI, Pro Skills, Arena, advanced workflows, and AI-assisted Solana development.

---

## 5. DAEMON Operator — $60/month

**Price:** $60/month  
**Annual Option:** $576/year, equivalent to $48/month  
**Purpose:** Heavy builders who use agents daily.

This should be positioned as the serious builder tier.

### Included

Everything in Pro, plus:

- Higher DAEMON AI limits
- More agent runs
- Larger project context
- More cloud/background agent usage
- Advanced Shipline flows
- Advanced App Factory usage
- More premium skills
- Higher priority API quota
- Faster queue priority
- More workflow automation
- Early access to selected features

### Suggested Usage Positioning

| Limit Type | Operator Suggested Limit |
|---|---:|
| DAEMON AI credits | ~3x Pro |
| Agent runs | Higher monthly limit |
| Cloud/background agents | Higher limit |
| Project indexing | Larger projects |
| Premium skills | Included + expanded packs |
| Priority queue | Higher priority |

### Product Copy

> **DAEMON Operator — $60/month**  
> Built for daily agent users. Get higher DAEMON AI limits, advanced workflows, larger context, and priority automation.

---

## 6. DAEMON Ultra — $200/month

**Price:** $200/month  
**Annual Option:** $1,920/year, equivalent to $160/month  
**Purpose:** Power users, builders shipping constantly, and advanced operators.

### Included

Everything in Operator, plus:

- Maximum individual DAEMON AI usage
- Highest agent limits
- Priority model routing
- Priority access to new DAEMON AI features
- Advanced App Factory access
- Advanced Shipline automation
- Advanced wallet/operator workflows
- Early beta access
- Highest priority queue
- Premium support channel or faster support SLA

### Suggested Usage Positioning

| Limit Type | Ultra Suggested Limit |
|---|---:|
| DAEMON AI credits | ~10x Pro or higher |
| Agent runs | Very high monthly limit |
| Cloud/background agents | High limit |
| Project indexing | Large/multi-project support |
| Premium skills | Full library |
| Priority queue | Highest individual priority |

### Product Copy

> **DAEMON Ultra — $200/month**  
> Maximum DAEMON AI usage, priority model access, early features, and advanced operator automation.

---

## 7. DAEMON Teams — $49/user/month

**Price:** $49/user/month  
**Annual Option:** $468/user/year, equivalent to $39/user/month  
**Purpose:** Teams, small studios, agencies, and builder groups.

### Included

Everything in Pro or Operator-style team baseline, plus:

- Shared workspaces
- Team billing
- Pooled usage
- Shared DAEMON rules/prompts
- Shared MCP configs
- Shared skills/templates
- Usage dashboard
- Role-based access
- Admin controls
- Team wallet/project visibility settings
- Optional SSO in higher tiers

### Product Copy

> **DAEMON Teams — $49/user/month**  
> Shared DAEMON AI workspaces, pooled usage, team billing, admin controls, and collaborative agent workflows.

---

## 8. Enterprise — Custom

**Price:** Custom  
**Purpose:** Larger organizations, funds, labs, agencies, and serious teams.

### Potential Enterprise Features

- Custom AI usage limits
- Invoice/PO billing
- Private deployment options
- Dedicated support
- Custom model routing
- Custom skill packs
- Custom App Factory flows
- Private Solana/indexing infrastructure
- Team-level compliance and logging
- SSO/SAML/OIDC
- Audit logs
- Custom data controls

### Product Copy

> **DAEMON Enterprise**  
> Custom DAEMON AI infrastructure, private workflows, advanced controls, and dedicated support for teams building at scale.

---

## 9. $DAEMON Holder Access

Holder access should be powerful, but it should not create unlimited AI cost exposure.

The clean rule:

> **Hold $DAEMON to unlock DAEMON subscription benefits, with fair-use AI limits.**

### Recommended Holder Tiers

| Holder Level | Requirement | Benefit |
|---|---:|---|
| **Holder Pro** | **1,000,000 $DAEMON** | Claim DAEMON Pro at no extra cost, with standard Pro monthly AI limits. |
| **Holder Operator** | **5,000,000 $DAEMON** | Discounted Operator or upgraded monthly AI limits. |
| **Holder Ultra** | **10,000,000+ $DAEMON** | Ultra discount, higher priority, beta access, and advanced holder perks. |
| **Founding/Strategic Holder** | Custom/manual | Special access, founder badge, private beta access, or enterprise-style perks. |

### Recommended Initial Launch Rule

For v1, keep it simple:

> **Hold 1,000,000 $DAEMON and claim DAEMON Pro.**

Then add higher holder tiers later.

### What Holders Get

Eligible 1M+ holders get:

- DAEMON Pro plan access
- Standard Pro DAEMON AI usage allocation
- Pro Skills
- Arena access
- Cloud/MCP sync
- Basic App Factory access
- Holder badge/status
- Early access to selected features

### What Holders Do Not Get by Default

Holders should **not** automatically get:

- Unlimited AI usage
- Unlimited premium model calls
- Unlimited cloud agents
- Unlimited enterprise/team seats
- Unlimited priority API usage

Reason:

> AI usage has real cost. Holder access should grant meaningful utility, not unlimited infrastructure burn.

---

## 10. How Holder Claim Works

The holder flow should be simple and safe.

1. User opens DAEMON.
2. User goes to **Account / DAEMON Pro / Holder Access**.
3. User selects a local wallet.
4. DAEMON asks the wallet to sign a plain message.
5. The backend verifies:
   - wallet owns the address,
   - signature is valid,
   - nonce has not expired,
   - wallet holds enough $DAEMON,
   - holder threshold is met.
6. Backend issues an entitlement token.
7. DAEMON unlocks the correct plan.
8. App refreshes holder status periodically.

Important:

- This should be a **message signature**, not a transaction.
- No tokens should leave the wallet.
- The app should clearly say: “This does not transfer tokens.”
- Holder access should refresh every 12–24 hours or at least once per billing period.
- If the wallet falls below the threshold, access expires after the current grace window.

---

## 11. Suggested Entitlement Logic

Each user should have an entitlement state like this:

```ts
type PlanId = 'light' | 'pro' | 'operator' | 'ultra' | 'team' | 'enterprise'

type AccessSource =
  | 'free'
  | 'payment'
  | 'holder'
  | 'admin'
  | 'trial'
  | 'dev_bypass'

interface EntitlementState {
  active: boolean
  plan: PlanId
  accessSource: AccessSource
  walletAddress?: string | null
  expiresAt?: number | null
  lastCheckedAt?: number | null
  offlineGraceUntil?: number | null
  features: string[]
  holderStatus?: {
    eligible: boolean
    mint: string
    minAmount: number
    currentAmount: number | null
    symbol: 'DAEMON'
  }
}
```

### Rules

- Free users receive `plan = 'light'`.
- Paying users receive `accessSource = 'payment'`.
- Holder users receive `accessSource = 'holder'`.
- Holder access can unlock Pro, Operator discounts, or Ultra discounts depending on holdings.
- Local app can cache entitlement status.
- Server must enforce premium assets and hosted services.
- Local-only UI gating is not enough for real protection.

---

## 12. Feature Gating Matrix

| Feature | Light | Pro | Operator | Ultra | Holder Pro |
|---|---:|---:|---:|---:|---:|
| Editor | Yes | Yes | Yes | Yes | Yes |
| Terminal | Yes | Yes | Yes | Yes | Yes |
| Git | Yes | Yes | Yes | Yes | Yes |
| Local projects | Yes | Yes | Yes | Yes | Yes |
| BYOK Claude/Codex | Yes | Yes | Yes | Yes | Yes |
| Basic wallet panel | Yes | Yes | Yes | Yes | Yes |
| DAEMON AI chat | No | Yes | Yes | Yes | Yes, capped |
| Project-aware AI | No | Yes | Yes | Yes | Yes, capped |
| AI terminal/debug help | No | Yes | Yes | Yes | Yes, capped |
| DAEMON Pro Skills | No | Yes | Yes | Yes | Yes |
| Arena access | Limited/view-only | Yes | Yes | Yes | Yes |
| Arena submit/vote | No | Yes | Yes | Yes | Yes |
| Cloud MCP sync | No | Yes | Yes | Yes | Yes |
| Cloud/background agents | No | Limited | Higher | Highest | Limited |
| App Factory | No/basic preview | Basic | Advanced | Highest | Basic |
| Shipline/deploy workflows | No/basic | Basic | Advanced | Highest | Basic |
| Priority API quota | No | Standard | Higher | Highest | Standard |
| Premium templates | No | Yes | More | Full | Yes |
| Team admin controls | No | No | No | No | No |
| Shared workspaces | No | No | No | No | No |

---

## 13. DAEMON AI Positioning

DAEMON AI should not be described as simply “using OpenAI/Claude inside the app.”

It should be positioned as DAEMON’s own agent layer.

### DAEMON AI Should Include

- Project-aware code assistant
- Solana-native development assistant
- Agent orchestration
- Terminal awareness
- File/project context
- Wallet/deployment awareness
- MCP routing
- Model routing across multiple providers
- DAEMON Skills
- Debugging workflows
- App Factory workflows
- Shipline/deploy workflows
- Launch/operator automation

### Long-Term DAEMON AI Direction

Start with orchestration over frontier models. Later add:

- fine-tuned DAEMON models,
- local small models,
- custom Solana coding models,
- private context/indexing,
- DAEMON-owned evals,
- model routing based on task type,
- hosted agent execution.

### Product Copy

> **DAEMON AI**  
> An AI-native development layer built for Solana builders, agent workflows, terminal automation, wallet-aware shipping, and end-to-end project execution.

---

## 14. Payment Methods

Recommended payment approach:

### Phase 1

- USDC via x402 or Solana payment flow
- Holder claim via wallet verification
- Manual/admin grants for early users

### Phase 2

- Credit/debit card via Stripe or similar
- Annual subscriptions
- Team billing
- Invoices for enterprise

### Phase 3

- Usage-based overages
- Add-on credit packs
- Pooled team usage
- Enterprise metered billing

---

## 15. Open-Core / Public Repo Strategy

DAEMON can keep a public/free core, but the valuable paid pieces should move behind private services.

### Public / Free Core

Can remain public:

- editor
- terminal
- git
- local project shell
- local wallet basics
- local agent launcher
- basic MCP config
- docs
- free templates
- free skills

### Private / Paid Layer

Should be protected server-side:

- DAEMON AI hosted usage
- premium skills
- premium templates
- model routing
- cloud agents
- cloud MCP sync
- Arena write actions
- priority API
- App Factory premium generation
- Shipline premium automation
- private prompts
- premium workflows

### Important Rule

> Do not ship private premium assets inside the public desktop client.

If the app only hides premium content with client-side checks, people can bypass it. The actual premium value should come from the backend after entitlement verification.

---

## 16. Recommended Launch Plan

### Phase 0 — Now

- Rename current free version to **DAEMON Light**.
- Add plan labels in the UI.
- Add Pro/holder account panel.
- Add feature gating.
- Keep 5 USDC as beta/legacy/arena-only if needed.

### Phase 1 — DAEMON Pro Launch

- Launch **DAEMON Pro at $20/month**.
- Include DAEMON AI, Pro Skills, Arena, MCP sync, priority API, basic App Factory/Shipline.
- Let 1M+ holders claim DAEMON Pro.
- Use fair-use limits for DAEMON AI.

### Phase 2 — Operator Launch

- Launch **DAEMON Operator at $60/month**.
- Add higher limits, cloud agents, advanced App Factory, advanced Shipline, and larger context.
- Add 5M holder benefits.

### Phase 3 — Ultra + Teams

- Launch **DAEMON Ultra at $200/month**.
- Launch **DAEMON Teams at $49/user/month**.
- Add shared workspaces, pooled usage, admin controls, and enterprise path.

---

## 17. Recommended Public Pricing Copy

```md
# Pricing

## DAEMON Light
Free forever.

Use the local DAEMON workbench with editor, terminal, git, local projects, wallet tools, and bring-your-own-key agents.

## DAEMON Pro — $20/month
Unlock DAEMON AI, Pro Skills, Arena, advanced workflows, cloud sync, and AI-assisted Solana development.

## DAEMON Operator — $60/month
For daily agent users. Get higher DAEMON AI limits, larger context, cloud agents, advanced Shipline/App Factory flows, and priority automation.

## DAEMON Ultra — $200/month
Maximum DAEMON AI usage, priority model access, early features, and advanced operator workflows.

## DAEMON Teams — $49/user/month
Shared DAEMON AI workspaces, pooled usage, team billing, admin controls, and collaborative agent workflows.

## $DAEMON Holder Access
Hold 1,000,000 $DAEMON to claim DAEMON Pro with included monthly AI usage.
Higher holder tiers unlock higher limits, discounts, badges, and early access.
```

---

## 18. Token/Holder Messaging Rules

Keep token language focused on access and community benefits.

### Say This

- “Holder access benefit”
- “Claim DAEMON Pro with eligible holdings”
- “No tokens are transferred”
- “Access refreshes periodically”
- “AI usage is subject to fair-use limits”
- “Higher holder tiers may receive higher limits or discounts”

### Do Not Say This

- “Investment”
- “Yield”
- “Dividend”
- “Equity”
- “Guaranteed return”
- “Passive income”
- “Token value will increase”
- “Unlimited AI forever”

---

## 19. Final Recommendation

The clean plan is:

1. **DAEMON Light** stays free and useful.
2. **DAEMON Pro** becomes the main plan at **$20/month**.
3. **DAEMON Operator** becomes the serious builder plan at **$60/month**.
4. **DAEMON Ultra** becomes the power-user plan at **$200/month**.
5. **DAEMON Teams** launches at **$49/user/month**.
6. **1M+ $DAEMON holders claim DAEMON Pro**, but with fair-use AI limits.
7. **5M+ and 10M+ holders** can get higher limits, discounts, badges, and early access later.
8. Premium value must be enforced through the backend, not only hidden in the client.

The most important pricing decision:

> **Do not anchor DAEMON AI at 5 USDC. Anchor DAEMON Pro at $20/month and use holder access as a meaningful token utility layer.**
