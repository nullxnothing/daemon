import { getSession, getAllSessionIds } from '../ipc/terminal'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Gracefully exit a provider CLI in a PTY and resume with the given command.
 * Sends Ctrl+C twice (for confirmation prompts), clears input, then runs resumeCommand.
 */
export async function restartProviderInPty(
  terminalId: string,
  resumeCommand: string,
  providerId?: string,
): Promise<void> {
  const session = getSession(terminalId)
  if (!session) throw new Error('Session not found')
  if (!session.agentId) return

  // If providerId is specified, skip sessions from other providers
  if (providerId && session.providerId && session.providerId !== providerId) return

  session.pty.write('\x03')
  await wait(2000)

  session.pty.write('\x03')
  await wait(1000)

  session.pty.write('\r')
  await wait(300)
  session.pty.write(`${resumeCommand}\r`)
}

/**
 * Restart all sessions (optionally filtered by providerId) with the given resume command.
 */
export async function restartAllProviderSessions(
  resumeCommand: string,
  providerId?: string,
): Promise<{ restarted: number; total: number }> {
  const allIds = getAllSessionIds()
  const targetIds = providerId
    ? allIds.filter((id) => {
        const session = getSession(id)
        return !providerId || session?.providerId === providerId
      })
    : allIds

  const results = await Promise.allSettled(
    targetIds.map((id) => restartProviderInPty(id, resumeCommand, providerId))
  )
  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  return { restarted: succeeded, total: targetIds.length }
}
