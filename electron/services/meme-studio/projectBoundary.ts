import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../../db/db'

function normalize(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export async function registeredProjectRoot(projectPath: string): Promise<string> {
  if (typeof projectPath !== 'string' || !projectPath.trim()) throw new Error('Project path is required')
  const requested = await fs.realpath(path.resolve(projectPath)).catch(() => null)
  if (!requested) throw new Error('Project path does not exist')
  const rows = getDb().prepare('SELECT path FROM projects').all() as Array<{ path: string }>
  for (const row of rows) {
    const root = await fs.realpath(path.resolve(row.path)).catch(() => null)
    if (root && normalize(root) === normalize(requested)) return root
  }
  throw new Error('Project is not registered in DAEMON Lite')
}

export function safeProjectPath(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Project file escaped workspace boundary')
  return target
}
