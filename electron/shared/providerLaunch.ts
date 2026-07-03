import path from 'node:path'

export type ProviderShellId = 'claude' | 'codex' | 'spettro' | 'aria'

const SPETTRO_WINDOWS_STARTUP = [
  '$spettro = @("$env:USERPROFILE\\spettro\\bin\\spettro.exe", "$env:USERPROFILE\\Projects\\spettro\\bin\\spettro.exe")',
  'Where-Object { Test-Path -LiteralPath $_ }',
  'Select-Object -First 1',
].join(' | ')

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quotePosixLiteral(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function getAriaStartupCommand(): string {
  const root = process.env.APP_ROOT
  if (!root) return 'aria'
  const scriptPath = path.join(root, 'scripts', 'aria.mjs')
  return process.platform === 'win32'
    ? `node ${quotePowerShellLiteral(scriptPath)}`
    : `node ${quotePosixLiteral(scriptPath)}`
}

export function getEmbeddedProviderArgs(providerId: ProviderShellId): string[] {
  switch (providerId) {
    case 'claude':
      return []
    case 'codex':
      return []
    case 'spettro':
      return []
    case 'aria':
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
    case 'aria':
      return getAriaStartupCommand()
    default:
      return providerId
  }
}
