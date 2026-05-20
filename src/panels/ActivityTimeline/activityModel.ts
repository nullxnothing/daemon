import type { ActivityArtifact, ActivityEntry } from '../../store/notifications'

export type ActivityFilter = 'all' | 'wallet' | 'runtime' | 'terminal' | 'scaffold' | 'errors'

export const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'scaffold', label: 'Scaffold' },
  { id: 'errors', label: 'Errors' },
]

export type ActivityCategory = Exclude<ActivityFilter, 'all' | 'errors'> | 'system'

export type ActivitySessionGroup = {
  id: string
  title: string
  status: NonNullable<ActivityEntry['sessionStatus']> | 'activity'
  projectName: string | null
  entries: ActivityEntry[]
  latestAt: number
  hasProblems: boolean
  artifacts: ActivityArtifact[]
  issueGroups: ActivityIssueGroup[]
}

export type ActivityIssueGroup = {
  id: string
  fingerprint: string
  title: string
  kind: ActivityEntry['kind']
  context: string | null
  category: ActivityCategory
  entries: ActivityEntry[]
  firstAt: number
  latestAt: number
}

export function classifyActivity(entry: ActivityEntry): ActivityCategory {
  const haystack = `${entry.context ?? ''} ${entry.message}`.toLowerCase()
  if (haystack.includes('wallet') || haystack.includes('swap') || haystack.includes('send') || haystack.includes('signature')) return 'wallet'
  if (haystack.includes('runtime') || haystack.includes('validator') || haystack.includes('preflight') || haystack.includes('toolchain')) return 'runtime'
  if (haystack.includes('terminal') || haystack.includes('shell') || haystack.includes('pty')) return 'terminal'
  if (haystack.includes('scaffold') || haystack.includes('starter') || haystack.includes('project')) return 'scaffold'
  return 'system'
}

export function formatTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(createdAt))
}

export function fingerprintActivityIssue(entry: ActivityEntry): string {
  const category = classifyActivity(entry)
  const context = (entry.context ?? category).toLowerCase().trim()
  const normalizedMessage = entry.message
    .toLowerCase()
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,88}\b/g, '<id>')
    .replace(/[A-Za-z]:[\\/][^\s,;]+/g, '<path>')
    .replace(/https?:\/\/[^\s)]+/g, '<url>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()

  return `${entry.kind}:${category}:${context}:${normalizedMessage}`
}

export function groupActivityIssues(entries: ActivityEntry[]): ActivityIssueGroup[] {
  const buckets = new Map<string, ActivityEntry[]>()

  for (const entry of entries) {
    if (entry.kind !== 'error' && entry.kind !== 'warning') continue
    const fingerprint = fingerprintActivityIssue(entry)
    buckets.set(fingerprint, [...(buckets.get(fingerprint) ?? []), entry])
  }

  return [...buckets.entries()].map(([fingerprint, issueEntries]) => {
    const sorted = [...issueEntries].sort((a, b) => b.createdAt - a.createdAt)
    const oldest = sorted[sorted.length - 1]
    const latest = sorted[0]
    const category = latest ? classifyActivity(latest) : 'system'

    return {
      id: `issue:${fingerprint}`,
      fingerprint,
      title: latest?.message ?? 'Activity issue',
      kind: sorted.some((entry) => entry.kind === 'error') ? 'error' as const : 'warning' as const,
      context: latest?.context ?? null,
      category,
      entries: sorted,
      firstAt: oldest?.createdAt ?? 0,
      latestAt: latest?.createdAt ?? 0,
    }
  }).sort((a, b) => b.latestAt - a.latestAt)
}

export function matchesFilter(entry: ActivityEntry, filter: ActivityFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'errors') return entry.kind === 'error' || entry.kind === 'warning'
  return classifyActivity(entry) === filter
}

export function deriveSessionStatus(entries: ActivityEntry[]): ActivitySessionGroup['status'] {
  const statuses = entries.map((entry) => entry.sessionStatus).filter(Boolean)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('complete')) return 'complete'
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('created')) return 'created'
  return 'activity'
}

export function groupActivity(entries: ActivityEntry[]): ActivitySessionGroup[] {
  const bySession = new Map<string, ActivityEntry[]>()
  const standalone: ActivityEntry[] = []

  for (const entry of entries) {
    if (entry.sessionId) {
      bySession.set(entry.sessionId, [...(bySession.get(entry.sessionId) ?? []), entry])
    } else {
      standalone.push(entry)
    }
  }

  const groups: ActivitySessionGroup[] = []
  for (const [sessionId, sessionEntries] of bySession) {
    const sorted = [...sessionEntries].sort((a, b) => b.createdAt - a.createdAt)
    const first = sorted[sorted.length - 1]
    const projectName = sorted.find((entry) => entry.projectName)?.projectName ?? null
    groups.push({
      id: sessionId,
      title: first?.message ?? 'Execution session',
      status: deriveSessionStatus(sorted),
      projectName,
      entries: sorted,
      latestAt: sorted[0]?.createdAt ?? 0,
      hasProblems: sorted.some((entry) => entry.kind === 'error' || entry.kind === 'warning'),
      artifacts: collectArtifacts(sorted),
      issueGroups: groupActivityIssues(sorted),
    })
  }

  const standaloneIssues = groupActivityIssues(standalone)
  const groupedIssueIds = new Set(standaloneIssues.flatMap((issue) => issue.entries.map((entry) => entry.id)))

  for (const issue of standaloneIssues) {
    groups.push({
      id: issue.id,
      title: issue.title,
      status: issue.kind === 'error' ? 'failed' : 'blocked',
      projectName: issue.entries.find((entry) => entry.projectName)?.projectName ?? null,
      entries: issue.entries,
      latestAt: issue.latestAt,
      hasProblems: true,
      artifacts: collectArtifacts(issue.entries),
      issueGroups: [issue],
    })
  }

  for (const entry of standalone) {
    if (groupedIssueIds.has(entry.id)) continue
    groups.push({
      id: entry.id,
      title: entry.message,
      status: 'activity',
      projectName: entry.projectName ?? null,
      entries: [entry],
      latestAt: entry.createdAt,
      hasProblems: entry.kind === 'error' || entry.kind === 'warning',
      artifacts: collectArtifacts([entry]),
      issueGroups: groupActivityIssues([entry]),
    })
  }

  return groups.sort((a, b) => b.latestAt - a.latestAt)
}

export function getActivityCounts(activity: ActivityEntry[]): Record<ActivityFilter, number> {
  const next: Record<ActivityFilter, number> = {
    all: activity.length,
    wallet: 0,
    runtime: 0,
    terminal: 0,
    scaffold: 0,
    errors: 0,
  }

  for (const entry of activity) {
    const category = classifyActivity(entry)
    if (category in next) next[category as ActivityFilter] += 1
    if (entry.kind === 'error' || entry.kind === 'warning') next.errors += 1
  }

  return next
}

export function buildSessionReport(group: ActivitySessionGroup): string {
  const ordered = [...group.entries].sort((a, b) => a.createdAt - b.createdAt)
  const categories = new Set(ordered.map(classifyActivity))
  const problems = ordered.filter((entry) => entry.kind === 'error' || entry.kind === 'warning')
  const txEvents = ordered.filter((entry) => classifyActivity(entry) === 'wallet')
  const runtimeEvents = ordered.filter((entry) => classifyActivity(entry) === 'runtime')
  const terminalEvents = ordered.filter((entry) => classifyActivity(entry) === 'terminal')
  const scaffoldEvents = ordered.filter((entry) => classifyActivity(entry) === 'scaffold')
  const last = ordered[ordered.length - 1]

  const lines = [
    `DAEMON Session Report: ${group.projectName ?? 'workspace execution'}`,
    `Status: ${group.status}`,
    `Objective: ${group.title}`,
    `Scope: ${[...categories].join(', ') || 'activity'}`,
    '',
    'What happened:',
    ...ordered.slice(0, 6).map((entry) => `- ${entry.context ?? classifyActivity(entry)}: ${entry.message}`),
  ]

  if (ordered.length > 6) lines.push(`- ${ordered.length - 6} additional event${ordered.length - 6 === 1 ? '' : 's'} recorded.`)
  if (scaffoldEvents.length > 0) lines.push('', `Scaffold: ${scaffoldEvents[scaffoldEvents.length - 1].message}`)
  if (terminalEvents.length > 0) lines.push(`Terminal: ${terminalEvents.length} terminal event${terminalEvents.length === 1 ? '' : 's'} recorded.`)
  if (runtimeEvents.length > 0) lines.push(`Runtime/deploy: ${runtimeEvents[runtimeEvents.length - 1].message}`)
  if (txEvents.length > 0) lines.push(`Wallet/tx: ${txEvents[txEvents.length - 1].message}`)
  if (group.artifacts.length > 0) {
    lines.push('', 'Launch artifacts:')
    lines.push(...group.artifacts.map((artifact) => `- ${artifact.label}: ${artifact.value}${artifact.href ? ` (${artifact.href})` : ''}`))
  }
  if (problems.length > 0) {
    lines.push('', 'Needs attention:')
    lines.push(...problems.slice(-3).map((entry) => `- ${entry.message}`))
  }
  lines.push('', `Next action: ${deriveNextAction(group, problems, last)}`)

  return lines.join('\n')
}

export function collectArtifacts(entries: ActivityEntry[]): ActivityArtifact[] {
  const artifacts: ActivityArtifact[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    for (const artifact of [...(entry.artifacts ?? []), ...extractArtifacts(entry)]) {
      const key = `${artifact.type}:${artifact.value}`
      if (seen.has(key)) continue
      seen.add(key)
      artifacts.push(artifact)
    }
  }

  return artifacts.slice(0, 12)
}

export function extractArtifacts(entry: ActivityEntry): ActivityArtifact[] {
  const haystack = `${entry.context ?? ''} ${entry.message}`
  const artifacts: ActivityArtifact[] = []
  const signatures = haystack.match(/\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/g) ?? []
  const urls = haystack.match(/https?:\/\/[^\s)]+/g) ?? []
  const windowsPaths = haystack.match(/[A-Za-z]:[\\/][^\s,;]+/g) ?? []
  const programIds = haystack.match(/program(?: id)?[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
  const wallet = haystack.match(/wallet[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)

  for (const signature of signatures.slice(0, 4)) {
    artifacts.push({
      type: 'transaction',
      label: 'Tx signature',
      value: signature,
      href: `https://solscan.io/tx/${signature}`,
    })
  }

  for (const url of urls.slice(0, 4)) {
    const isExplorer = isSolanaExplorerUrl(url)
    artifacts.push({
      type: isExplorer ? 'explorer' : 'other',
      label: isExplorer ? 'Explorer' : 'Link',
      value: url,
      href: url,
    })
  }

  for (const path of windowsPaths.slice(0, 2)) {
    artifacts.push({ type: 'project', label: 'Project path', value: path })
  }

  if (programIds?.[1]) {
    artifacts.push({
      type: 'program',
      label: 'Program ID',
      value: programIds[1],
      href: `https://explorer.solana.com/address/${programIds[1]}`,
    })
  }

  if (wallet?.[1]) {
    artifacts.push({
      type: 'wallet',
      label: 'Wallet',
      value: wallet[1],
      href: `https://explorer.solana.com/address/${wallet[1]}`,
    })
  }

  if (classifyActivity(entry) === 'runtime' && /deploy|launched|confirmed/i.test(entry.message)) {
    artifacts.push({ type: 'deploy', label: 'Deploy event', value: entry.message })
  }

  return artifacts
}

export function compactArtifactValue(value: string): string {
  if (value.length <= 34) return value
  return `${value.slice(0, 16)}...${value.slice(-10)}`
}

function isSolanaExplorerUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'explorer.solana.com' || host === 'solscan.io' || host.endsWith('.solscan.io')
  } catch {
    return false
  }
}

function deriveNextAction(group: ActivitySessionGroup, problems: ActivityEntry[], last?: ActivityEntry): string {
  if (group.status === 'failed') return 'Open the failed event, fix the blocker, then rerun the session from the same project context.'
  if (group.status === 'blocked' || problems.length > 0) return 'Resolve the warnings/errors above, then rerun preflight before executing wallet or deploy steps.'
  if (group.status === 'running') return 'Continue monitoring the terminal/runtime output and mark the session complete once build/deploy verification passes.'
  if (group.status === 'complete') return 'Share this report as the handoff artifact and archive the session.'
  if (last && classifyActivity(last) === 'scaffold') return 'Open the generated project, run install/build checks, then attach terminal output to this session.'
  return 'Continue from the latest recorded event and capture the next terminal, wallet, or deploy action in DAEMON.'
}
