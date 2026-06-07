/**
 * Shared helpers for the ARIA tool domain modules.
 */
import path from 'node:path'
import * as SettingsService from '../../SettingsService'

/** Resolve a project-relative path, rejecting anything that escapes the root. */
export function resolveScopedPath(rel: string, projectRoot: string | null): string {
  if (!projectRoot) throw new Error('No active project — open a project first.')
  const abs = path.resolve(projectRoot, rel)
  const root = path.resolve(projectRoot)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Path escapes the active project root.')
  }
  return abs
}

/** True when the wallet infrastructure is pointed at mainnet. */
export function isMainnet(): boolean {
  return SettingsService.getWalletInfrastructureSettings().cluster === 'mainnet-beta'
}

/** Prefix a tool summary with a [MAINNET] marker when on mainnet, so the
 *  approval card and tool_result make the network unmistakable. */
export function clusterMark(summary: string): string {
  return isMainnet() ? `[MAINNET] ${summary}` : summary
}
