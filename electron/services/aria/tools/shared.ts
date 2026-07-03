/**
 * Shared helpers for the ARIA tool domain modules.
 */
import path from 'node:path'
import fs from 'node:fs'
import * as SettingsService from '../../SettingsService'

/** Secret-bearing files that read tools must never surface, even inside the project root.
 *  These reads auto-run (risk 'read'), including for external bridge agents supplying their own
 *  cwd, so a .env or keypair leak would be silent. Matched on the basename, case-insensitive. */
const SECRET_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,        // .env, .env.local, .env.production, ...
  /\.pem$/i,
  /\.key$/i,
  /(^|[._-])secret/i,
  /^id_(rsa|ed25519|ecdsa|dsa)/i,
  /keypair.*\.json$/i,
  /wallet.*\.json$/i,
]

function isSecretFile(abs: string): boolean {
  const base = path.basename(abs)
  return SECRET_FILE_PATTERNS.some((re) => re.test(base))
}

/**
 * Resolve a project-relative path, rejecting anything that escapes the root or names a secret
 * file. Containment is enforced against the REAL path (fs.realpath) so an in-project symlink
 * pointing outside the root can't escape; secret-file basenames (.env, keypairs, *.key) are
 * always denied regardless of location.
 */
export function resolveScopedPath(rel: string, projectRoot: string | null): string {
  if (!projectRoot) throw new Error('No active project — open a project first.')
  const abs = path.resolve(projectRoot, rel)
  const root = path.resolve(projectRoot)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('Path escapes the active project root.')
  }
  if (isSecretFile(abs)) {
    throw new Error('Refusing to read a secret-bearing file (.env, keypair, or key material).')
  }
  // Realpath both sides so a symlink inside the root can't point outside it. Fall back to the
  // lexical check when the target doesn't exist yet (e.g. a not-yet-created file).
  try {
    const realAbs = fs.realpathSync(abs)
    const realRoot = fs.realpathSync(root)
    if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) {
      throw new Error('Path escapes the active project root (via symlink).')
    }
    if (isSecretFile(realAbs)) {
      throw new Error('Refusing to read a secret-bearing file (.env, keypair, or key material).')
    }
  } catch (err) {
    // ENOENT is fine (path may not exist yet); rethrow a containment/secret rejection.
    if (err instanceof Error && /escapes|secret-bearing/.test(err.message)) throw err
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
