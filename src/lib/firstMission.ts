/**
 * First-mission constants + local funnel helpers.
 *
 * The funnel is local-only instrumentation (an app_settings blob mirrored into
 * the activity log). Marks are fire-and-forget: first-touch and mission gating
 * are enforced in the main process, so callers never need to check state first.
 */
import { daemon } from './daemonBridge'

export type FirstrunFunnelStep =
  | 'app_first_launch'
  | 'wizard_opened'
  | 'profile_done'
  | 'claude_cli_ok'
  | 'claude_auth_ok'
  | 'claude_skipped'
  | 'project_ready'
  | 'demo_workspace_created'
  | 'primer_done'
  | 'mission_started'
  | 'mission_read_complete'
  | 'approval_shown'
  | 'approval_approved'
  | 'approval_rejected'
  | 'mission_narrated'
  | 'wizard_exited_early'

/** Scripted opening turn for the console. The numbered imperative + explicit
 *  tool allowlist is the prompt-compliance mitigation: reads first, then exactly
 *  one write (remember_fact) so the approval gate demo is deterministic. */
export const FIRST_MISSION_PROMPT = `First mission. Do exactly this, in order, and nothing else.
1. Call read_project_status and read_wallet. Then give me a readout of exactly four short lines: project and branch; cluster (say plainly whether this is devnet or mainnet); wallet signer status; one thing you noticed in the project tree.
2. Then call remember_fact with title "First mission" and a one-line value recording that the operator completed the first mission readout today, including the project name.
3. Do not call any other write or run tool. Do not call run_engine_action.
4. After my approval decision, tell me in two lines: what ran automatically (the reads), and what waited for my decision (the write). If I rejected it, say the fact was not saved and that rejection is always free.`

/** Stamp a funnel step. Never throws, never blocks the UI. */
export function markFunnelStep(step: FirstrunFunnelStep): void {
  try {
    void daemon.settings.markFunnelStep(step).catch(() => {})
  } catch { /* bridge unavailable (tests) — instrumentation is advisory */ }
}

/** Read the funnel record; null when unavailable. */
export async function getFunnel(): Promise<Partial<Record<string, number>> | null> {
  try {
    const res = await daemon.settings.getFunnel()
    return res.ok && res.data ? res.data : null
  } catch {
    return null
  }
}

/** True until the user has made their first approval decision — drives the
 *  "Run the first mission" chip in the console empty state. */
export async function isFirstMissionPending(): Promise<boolean> {
  const funnel = await getFunnel()
  if (!funnel) return false
  return funnel.approval_approved === undefined && funnel.approval_rejected === undefined
}
