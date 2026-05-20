export function describeSolanaToolboxError(error: string | null | undefined, fallback = 'The Solana action failed.'): string {
  const raw = error?.trim()
  if (!raw) return fallback

  const text = raw.replace(/\s+/g, ' ')
  const lower = text.toLowerCase()

  if (lower.includes('no active project') || (lower.includes('project') && lower.includes('required'))) {
    return 'Open or create a project before running this Solana workflow.'
  }

  if (lower.includes('enoent') || lower.includes('not recognized') || lower.includes('command not found')) {
    return 'A required CLI command is missing. Check Solana CLI, Anchor, Cargo, pnpm, or the selected project path.'
  }

  if (lower.includes('permission') || lower.includes('eacces') || lower.includes('access is denied')) {
    return 'DAEMON could not access the project folder or terminal command. Check folder permissions and try again.'
  }

  if (lower.includes('port') && (lower.includes('in use') || lower.includes('eaddrinuse'))) {
    return 'The local validator port is already in use. Stop the existing validator or restart it from DAEMON.'
  }

  if (lower.includes('rpc') || lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return 'DAEMON could not reach the selected Solana RPC. Check the network, RPC provider, and local validator state.'
  }

  if (lower.includes('blockhash') || lower.includes('expired')) {
    return 'The transaction or confirmation window expired. Refresh the command or rerun the latest build/deploy step.'
  }

  if (lower.includes('insufficient funds') || lower.includes('insufficient lamports')) {
    return 'The signer does not have enough SOL for fees, rent, or deployment costs on the selected network.'
  }

  if (lower.includes('anchor') && lower.includes('idl')) {
    return 'Anchor IDL handling failed. Rebuild the project, confirm the program ID, and retry the IDL step.'
  }

  if (text.length > 190) return `${fallback} ${text.slice(0, 187)}...`
  return text
}

export function getSolanaProjectEmptyTitle(activeProjectPath: string | null): string {
  return activeProjectPath ? 'This project does not look like a Solana workspace yet' : 'Open a project to start Solana workflows'
}

export function getSolanaProjectEmptyCopy(activeProjectPath: string | null): string {
  return activeProjectPath
    ? 'DAEMON is ready, but it has not found Anchor.toml, Solana program files, IDLs, or client-side Solana dependencies in this project. Use Start to scaffold or open a Solana project.'
    : 'Solana Toolbox needs a project folder before it can detect Anchor/native programs, check toolchains, start project terminals, or prepare deploy proof.'
}
