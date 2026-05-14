# DAEMON Landing Page, Docs, and Subscription Plan

**Branch:** `feature/daemon-landing-page`  
**Base branch:** `v4`  
**Status:** Planning  
**Purpose:** Update DAEMON's public-facing website/docs and in-app subscription surfaces around v4, DAEMON AI Cloud, holder access, and paid tiers.

## 1. Outcome

Create a clear public product path for DAEMON:

- A landing page that explains DAEMON as an AI-native Solana development environment.
- Website/docs copy that matches the v4 app and DAEMON AI Cloud direction.
- Subscription tier messaging for Light, Pro, Operator, Ultra, Teams, and Enterprise.
- Holder-access messaging that is useful without implying unlimited AI usage.
- In-app subscription surfaces that match the public pricing/docs.
- A clean release path once production cloud, JWT lanes, and persistent storage are confirmed.

## 2. Current Repo Signals

Useful existing pieces:

- `DAEMON_AI_PRICING_AND_HOLDER_PLAN.md` already defines the recommended tier model.
- `DAEMON_AI_ARCHITECTURE_AND_BUILD_PLAN.md` already defines DAEMON AI Cloud positioning.
- `src/panels/ProPanel/ProPanel.tsx` already has Holder Pro live and Holder Operator/Ultra planned.
- `electron/services/EntitlementService.ts` already contains Light/Pro/Operator/Ultra lane logic.
- `src/panels/DocsPanel/` already has an in-app docs system that can be updated.
- `src/panels/plugins/Subscriptions/Subscriptions.tsx` is still a placeholder and should become the subscription management surface.
- `DAEMON_AI_CLOUD_DEPLOYMENT.md`, `README.md`, and `Whatsnew.md` already mention v4 cloud readiness and release gates.

Gaps:

- No clear website/landing-page app folder was found in the repo.
- Production DAEMON AI cloud URL is still undecided.
- Real Pro/Ultra JWT live validation is still blocked.
- Persistent cloud storage is not externally confirmed by the current readiness endpoint.
- Subscription management UI is not implemented beyond the Pro panel.

## 3. Landing Page Information Architecture

Recommended first-page structure:

1. **Hero**
   - Product name: DAEMON.
   - Positioning: AI-native development environment for Solana builders.
   - Primary CTA: Download DAEMON.
   - Secondary CTA: View docs or pricing.
   - First viewport should show the actual app, not abstract art.

2. **What DAEMON Is**
   - Desktop workbench.
   - Code editor, terminal, git, wallet, deploy, agents, MCP, Solana tools.
   - Not a VS Code fork and not just a chat wrapper.

3. **DAEMON AI**
   - Hosted DAEMON AI Cloud for paid users and eligible holders.
   - BYOK mode for free/local users.
   - Project-aware chat, patch mode, agent mode, Solana-native workflows.

4. **Builder Workflows**
   - Start project.
   - Inspect and edit code.
   - Run terminal/tests.
   - Use wallet and Solana tooling.
   - Deploy.
   - Use agents and DAEMON AI to iterate.

5. **Integrations**
   - Zauth for 402/provider management.
   - Helius/Solana tooling.
   - Phantom/wallet flows.
   - Vercel/Railway deployment.
   - MCP and skills.

6. **Pricing**
   - Light: Free.
   - Pro: $20/month.
   - Operator: $60/month.
   - Ultra: $200/month.
   - Teams: $49/user/month.
   - Enterprise: Custom.

7. **Holder Access**
   - 1M+ DAEMON holders can claim Pro.
   - 5M+ and 10M+ tiers can unlock higher limits or discounts later.
   - AI usage remains fair-use metered.
   - No token transfer for claim.

8. **Docs and Release Notes**
   - Installation.
   - DAEMON AI Cloud.
   - Subscription and holder access.
   - Zauth/402 integration.
   - v4 release readiness.

## 4. Tier Copy

Use this as the shared source for website, docs, and in-app subscription UI.

| Tier | Price | Best For | Positioning |
|---|---:|---|---|
| Light | Free | Local builders | Free local DAEMON workbench with BYOK agents and core tools. |
| Pro | $20/month | Individual builders | DAEMON AI, Pro Skills, Arena, standard hosted usage, and advanced workflows. |
| Operator | $60/month | Daily agent users | Higher AI limits, larger context, more agent runs, and advanced ship/deploy flows. |
| Ultra | $200/month | Power users | Maximum individual usage, priority model access, early features, and advanced automation. |
| Teams | $49/user/month | Studios and teams | Shared workspaces, pooled usage, team billing, admin controls, and collaboration. |
| Enterprise | Custom | Larger orgs | Private deployments, custom limits, support, compliance, and invoicing. |

## 5. Subscription Management Surface

Replace `src/panels/plugins/Subscriptions/Subscriptions.tsx` placeholder with a real operational panel:

- Current plan summary.
- Usage and monthly credits.
- Hosted model lane access:
  - Standard lane: Pro+.
  - Reasoning lane: Operator+.
  - Premium lane: Ultra.
- Billing/renewal status.
- Holder claim status.
- Upgrade/downgrade actions as disabled/planned until payment rails are live.
- Link to Pro panel for wallet-based holder claim.
- Link to DAEMON AI Cloud docs.

Keep payment/claim actions honest:

- Do not imply Operator/Ultra holder lanes are live until real JWTs and backend entitlements are confirmed.
- Mark planned tiers as planned if backend billing is not ready.
- Keep holder messaging focused on access utility, not financial upside.

## 6. Docs Updates

Update the in-app docs under `src/panels/DocsPanel/`:

- Add a **DAEMON AI Cloud** page.
- Add a **Pricing and Subscriptions** page.
- Add a **Holder Access** page.
- Add a **Zauth 402 Integration** page.
- Refresh Introduction copy so v4 describes DAEMON AI, subscriptions, and integrations accurately.

Update markdown docs:

- `README.md`: concise public product positioning, download, docs, pricing/holder link.
- `DAEMON_AI_CLOUD_DEPLOYMENT.md`: production URL, live JWT smoke, storage confirmation.
- `Whatsnew.md`: convert RC notes to final v4 only after live gates pass.
- `DAEMON_AI_PRICING_AND_HOLDER_PLAN.md`: keep as strategy source, not user-facing copy.

## 7. Implementation Workstreams

1. **Branch and inventory**
   - Create `feature/daemon-landing-page`.
   - Inventory website/docs/subscription surfaces.
   - Preserve current dirty v4 worktree.

2. **Landing page decision**
   - If there is an external website repo, update that repo.
   - If this repo owns the website, add a small site app/folder.
   - If no public website is in scope yet, build a polished in-app landing/docs page first.

3. **Docs pass**
   - Add docs navigation entries.
   - Add DAEMON AI Cloud, pricing, holder access, and Zauth docs.
   - Align copy with the pricing plan.

4. **Subscriptions panel**
   - Replace placeholder with tier cards and current entitlement state.
   - Pull from `useProStore` and existing entitlement types.
   - Show lane access and holder status.
   - Keep non-live payment actions clearly marked.

5. **Pro/Ultra lane validation**
   - Add or extend live smoke coverage so real Pro, Operator, and Ultra JWTs can prove lane access.
   - Keep unit coverage for entitlement math.

6. **Cloud production readiness**
   - Choose production `DAEMON_AI_API_BASE`.
   - Confirm persistent disk/db path.
   - Confirm `/health/ready`.
   - Run live smoke with real JWTs.

7. **Release**
   - Bump `4.0.0-rc.0` to final only after gates pass.
   - Commit branch cleanly.
   - Tag v4.
   - Publish after final smoke.

## 8. Open Decisions

- Is the public website in this DAEMON repo, or a separate repo?
- What is the final production DAEMON AI Cloud URL?
- Which payment rail launches first: USDC/x402, Stripe, holder-only, or manual grants?
- Should Operator and Ultra be visible on launch as active plans, or shown as planned/coming soon?
- What exact DAEMON token mint should public holder docs reference?
- Should Zauth be described as an official 402 provider layer now, or as an integration under evaluation?

## 9. Immediate Next Steps

Recommended next sequence:

1. Confirm whether the website lives in this repo or another repo.
2. Build the Subscriptions panel first because it is currently a placeholder and can reuse existing entitlement state.
3. Add docs pages for DAEMON AI Cloud, Pricing, Holder Access, and Zauth.
4. Decide public landing-page target and copy.
5. Extend live smoke tests for Pro/Operator/Ultra JWT lanes.
6. Finalize production cloud URL and persistent storage confirmation.
