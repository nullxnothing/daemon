export type TerminalLaunchRecent = {
  kind: 'agent' | 'command'
  key: string
  label: string
  command?: string
  timestamp: number
}

const TERMINAL_LAUNCH_RECENTS_KEY = 'daemon.terminal.launchRecents'
const MAX_TERMINAL_LAUNCH_RECENTS = 8

export function readTerminalLaunchRecents(): TerminalLaunchRecent[] {
  try {
    const raw = window.localStorage.getItem(TERMINAL_LAUNCH_RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && (item.kind === 'agent' || item.kind === 'command') && typeof item.key === 'string' && typeof item.label === 'string')
      .map((item) => ({
        kind: item.kind as 'agent' | 'command',
        key: item.key as string,
        label: item.label as string,
        command: typeof item.command === 'string' ? item.command : undefined,
        timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_TERMINAL_LAUNCH_RECENTS)
  } catch {
    return []
  }
}

export function writeTerminalLaunchRecents(recents: TerminalLaunchRecent[]) {
  try {
    window.localStorage.setItem(TERMINAL_LAUNCH_RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_TERMINAL_LAUNCH_RECENTS)))
  } catch {
    // Ignore storage errors
  }
}

export function addToRecents(
  prev: TerminalLaunchRecent[],
  recent: Omit<TerminalLaunchRecent, 'timestamp'>,
): TerminalLaunchRecent[] {
  const next: TerminalLaunchRecent[] = [
    { ...recent, timestamp: Date.now() },
    ...prev.filter((item) => !(item.kind === recent.kind && item.key === recent.key)),
  ].slice(0, MAX_TERMINAL_LAUNCH_RECENTS)
  writeTerminalLaunchRecents(next)
  return next
}
