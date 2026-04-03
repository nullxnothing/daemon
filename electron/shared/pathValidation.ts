import path from 'node:path'
import { getDb } from '../db/db'

// Cache project paths to avoid a SQLite round-trip on every fs operation.
// Invalidated explicitly via invalidatePathCache() or after PATH_CACHE_TTL_MS.
const PATH_CACHE_TTL_MS = 5_000
let pathCache: Array<{ path: string }> | null = null
let pathCacheExpiry = 0

function getProjectPaths(): Array<{ path: string }> {
  if (pathCache && Date.now() < pathCacheExpiry) return pathCache
  pathCache = getDb().prepare('SELECT path FROM projects').all() as Array<{ path: string }>
  pathCacheExpiry = Date.now() + PATH_CACHE_TTL_MS
  return pathCache
}

export function invalidatePathCache(): void {
  pathCache = null
}

/**
 * Check if a target path is inside any registered project directory.
 * Normalizes separators for cross-platform compatibility.
 */
export function isPathSafe(targetPath: string): boolean {
  const projects = getProjectPaths()
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
  const projects = getProjectPaths()
  const normalized = projectPath.replace(/\\/g, '/')
  return projects.some((p) => p.path.replace(/\\/g, '/') === normalized)
}

/**
 * Assert that a cwd is non-empty and within a registered project.
 * Throws on invalid paths -- use in IPC handlers that accept a working directory.
 */
export function validateCwd(cwd: string): void {
  if (!cwd || !isPathSafe(cwd)) throw new Error('Path not within a registered project')
}

/**
 * General-purpose check: is targetPath inside basePath?
 * Prevents path traversal by resolving both paths first.
 */
export function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolved = path.resolve(targetPath)
  const base = path.resolve(basePath)
  return resolved.startsWith(base + path.sep) || resolved === base
}
