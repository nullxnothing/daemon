/**
 * Spawn-spec builder for CLI tools that are .cmd/.bat shims on Windows
 * (npm global installs). Node 20.12+/22 refuses to spawn those without a
 * shell (spawn EINVAL, CVE-2024-27980), so they must route through cmd.exe
 * with every argument quoted by us — cmd would otherwise reparse prompt
 * text containing &, |, %, or quotes.
 */

export interface CliSpawnSpec {
  command: string
  args: string[]
  shell: boolean
}

/**
 * Quote an argument for a Windows cmd.exe shell invocation: wrap in double
 * quotes, escape embedded double quotes, and neutralize the %VAR% expansion
 * cmd performs even inside quotes (a lone % can't be escaped, so we break
 * the pair with "^").
 */
export function quoteWinArg(arg: string): string {
  const escaped = arg.replace(/"/g, '\\"').replace(/%/g, '%^')
  return `"${escaped}"`
}

export function needsWinShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)
}

export function buildCliSpawn(command: string, args: string[]): CliSpawnSpec {
  if (!needsWinShell(command)) return { command, args, shell: false }
  return { command: quoteWinArg(command), args: args.map(quoteWinArg), shell: true }
}
