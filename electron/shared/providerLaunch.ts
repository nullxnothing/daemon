export type ProviderShellId = 'claude' | 'codex'

export function getEmbeddedProviderArgs(providerId: ProviderShellId): string[] {
  switch (providerId) {
    case 'claude':
      return ['-c']
    case 'codex':
      return ['--no-alt-screen']
    default:
      return []
  }
}

export function getEmbeddedProviderStartupCommand(providerId: ProviderShellId): string {
  switch (providerId) {
    case 'claude':
      return 'claude -c'
    case 'codex':
      return 'codex --no-alt-screen'
    default:
      return providerId
  }
}
