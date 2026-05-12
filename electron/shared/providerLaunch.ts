export type ProviderShellId = 'claude' | 'codex'

export function getEmbeddedProviderArgs(providerId: ProviderShellId): string[] {
  switch (providerId) {
    case 'claude':
      return []
    case 'codex':
      return []
    default:
      return []
  }
}

export function getEmbeddedProviderStartupCommand(providerId: ProviderShellId): string {
  switch (providerId) {
    case 'claude':
      return 'claude'
    case 'codex':
      return 'codex'
    default:
      return providerId
  }
}
