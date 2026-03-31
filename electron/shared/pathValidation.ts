import path from 'node:path'
import { getDb } from '../db/db'

/**
 * Check if a target path is inside any registered project directory.
 * Normalizes separators for cross-platform compatibility.
 */
export function isPathSafe(targetPath: string): boolean {
  const db = getDb()
  const projects = db.prepare('SELECT path FROM projects').all() as Array<{ path: string }>
  try {
    const normalized = path.resolve(targetPath)
    return projects.some((p) => {
      const projectPath = path.resolve(p.path)
      return normalized === projectPath || normalized.startsWith(projectPath + path.sep)
    })
  } catch {
    return false
  }
}

/**
 * Check if a path is a known .env file inside a registered project.
 */
export function isEnvPathSafe(filePath: string, allowedNames: Set<string>): boolean {
  const fileName = path.basename(filePath)
  if (!allowedNames.has(fileName)) return false
  return isPathSafe(filePath)
}

/**
 * Check if a path exactly matches a registered project root.
 */
export function isProjectPathSafe(projectPath: string): boolean {
  const db = getDb()
  const projects = db.prepare('SELECT path FROM projects').all() as Array<{ path: string }>
  const normalized = projectPath.replace(/\\/g, '/')
  return projects.some((p) => p.path.replace(/\\/g, '/') === normalized)
}
