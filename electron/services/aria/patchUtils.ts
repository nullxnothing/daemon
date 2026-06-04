/**
 * Helpers for the ARIA operator's plan + patch-proposal flow: map model lanes to
 * the local Claude shorthand the agent loop understands, and derive the file
 * list / +/− line counts from a unified diff for the renderer patch card.
 */
import crypto from 'node:crypto'
import type {
  AriaPatchProposalLite,
  AriaPlanStep,
  DaemonAiModelLane,
  DaemonAiPatchRiskLevel,
} from '../../shared/types'

/**
 * ARIA runs Claude locally (BYOK), so the cloud lane taxonomy collapses to three
 * Claude tiers. Fast → haiku, reasoning/premium → opus, everything else → sonnet.
 */
export function laneToClaudeModel(lane: DaemonAiModelLane | undefined): string {
  switch (lane) {
    case 'fast':
      return 'haiku'
    case 'reasoning':
    case 'premium':
      return 'opus'
    case 'auto':
    case 'standard':
    default:
      return 'sonnet'
  }
}

/** Build ordered plan steps (status 'pending') from a list of step titles. */
export function buildPlanSteps(titles: string[]): AriaPlanStep[] {
  return titles
    .map((title) => String(title ?? '').trim())
    .filter(Boolean)
    .map((title, index) => ({ index: index + 1, title, status: 'pending' as const }))
}

/** Count added/removed lines and collect touched files from a unified diff. */
export function summarizeUnifiedDiff(diff: string): { files: string[]; additions: number; deletions: number } {
  const files = new Set<string>()
  let additions = 0
  let deletions = 0

  for (const line of diff.split('\n')) {
    // File headers: prefer the "+++ b/path" target; fall back to "diff --git".
    if (line.startsWith('+++ ')) {
      const file = line.slice(4).replace(/^b\//, '').trim()
      if (file && file !== '/dev/null') files.add(file)
      continue
    }
    if (line.startsWith('diff --git')) {
      const match = /b\/(\S+)\s*$/.exec(line)
      if (match) files.add(match[1])
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }

  return { files: [...files], additions, deletions }
}

/** Heuristic risk: more touched files / larger diffs read as higher risk. */
function inferRisk(files: string[], additions: number, deletions: number): DaemonAiPatchRiskLevel {
  const churn = additions + deletions
  if (files.length > 4 || churn > 200) return 'high'
  if (files.length > 1 || churn > 40) return 'medium'
  return 'low'
}

/** Assemble the renderer-facing patch proposal from raw model output. */
export function buildPatchProposal(input: { title?: unknown; summary?: unknown; unifiedDiff?: unknown }): AriaPatchProposalLite {
  const unifiedDiff = String(input.unifiedDiff ?? '')
  const { files, additions, deletions } = summarizeUnifiedDiff(unifiedDiff)
  return {
    id: crypto.randomUUID(),
    title: String(input.title ?? 'Proposed change').slice(0, 120),
    summary: input.summary ? String(input.summary) : null,
    files,
    unifiedDiff,
    additions,
    deletions,
    riskLevel: inferRisk(files, additions, deletions),
    status: 'proposed',
  }
}
