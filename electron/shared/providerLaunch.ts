export type ProviderShellId = 'claude' | 'codex' | 'spettro'

const SPETTRO_WINDOWS_STARTUP = [
  '$spettro = @("$env:USERPROFILE\\spettro\\bin\\spettro.exe", "$env:USERPROFILE\\Projects\\spettro\\bin\\spettro.exe")',
  'Where-Object { Test-Path -LiteralPath $_ }',
  'Select-Object -First 1',
].join(' | ')

export function getEmbeddedProviderArgs(providerId: ProviderShellId): string[] {
  switch (providerId) {
    case 'claude':
      return []
    case 'codex':
      return []
    case 'spettro':
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
    case 'spettro':
      return process.platform === 'win32'
        ? `${SPETTRO_WINDOWS_STARTUP}; if ($spettro) { & $spettro } else { spettro }`
        : 'spettro'
    default:
      return providerId
  }
}
