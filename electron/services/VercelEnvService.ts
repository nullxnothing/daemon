import { getDb } from '../db/db'
import { scanProjectEnvFiles } from './EnvService'

const VERCEL_TOKEN_PATTERN = /^[A-Za-z0-9]{24,}$/
const VERCEL_API_BASE = 'https://api.vercel.com'

interface VercelEnvItem {
  key: string
  value?: string
  target?: string[]
}

interface VercelEnvResponse {
  envs?: VercelEnvItem[]
  pagination?: { next?: number }
  error?: { message?: string }
}

export interface VercelProjectEnvMatch {
  projectId: string
  projectName: string
  key: string
  value: string
}

export interface VercelPullResult {
  syncedAt: number
  entries: VercelProjectEnvMatch[]
  projectErrors: Array<{ projectId: string; projectName: string; error: string }>
}

function resolveVercelToken(projects: Array<{ path: string }>): string | null {
  for (const project of projects) {
    const envFiles = scanProjectEnvFiles(project.path)
    for (const file of envFiles) {
      for (const envVar of file.vars) {
        if (envVar.isComment || envVar.key !== 'VERCEL_TOKEN') continue
        const token = envVar.value.trim()
        if (VERCEL_TOKEN_PATTERN.test(token)) {
          return token
        }
      }
    }
  }

  return null
}

async function fetchProductionEnvsForProject(projectName: string, token: string): Promise<Array<{ key: string; value: string }>> {
  const envs: Array<{ key: string; value: string }> = []
  let next: number | null = null
  let pageGuard = 0

  while (pageGuard < 25) {
    pageGuard += 1
    const url = new URL(`${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(projectName)}/env`)
    url.searchParams.set('target', 'production')
    url.searchParams.set('decrypt', 'true')
    url.searchParams.set('limit', '100')
    if (next !== null) {
      url.searchParams.set('since', String(next))
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Vercel API error ${response.status}`)
    }

    const json = await response.json() as VercelEnvResponse
    const pageEnvs = json.envs ?? []

    for (const item of pageEnvs) {
      const targets = Array.isArray(item.target) ? item.target : []
      if (!targets.includes('production')) continue
      if (typeof item.value !== 'string') continue
      envs.push({ key: item.key, value: item.value })
    }

    const nextToken = json.pagination?.next
    if (typeof nextToken !== 'number') break
    next = nextToken
  }

  return envs
}

export async function pullVercelProductionEnv(): Promise<VercelPullResult> {
  const db = getDb()
  const projects = db.prepare('SELECT id, name, path FROM projects ORDER BY name').all() as Array<{ id: string; name: string; path: string }>
  const token = resolveVercelToken(projects)

  if (!token) {
    throw new Error('No valid VERCEL_TOKEN found in project env files')
  }

  const entries: VercelProjectEnvMatch[] = []
  const projectErrors: Array<{ projectId: string; projectName: string; error: string }> = []

  for (const project of projects) {
    try {
      const projectEntries = await fetchProductionEnvsForProject(project.name, token)
      for (const envEntry of projectEntries) {
        entries.push({
          projectId: project.id,
          projectName: project.name,
          key: envEntry.key,
          value: envEntry.value,
        })
      }
    } catch (error) {
      projectErrors.push({
        projectId: project.id,
        projectName: project.name,
        error: (error as Error).message,
      })
    }
  }

  return {
    syncedAt: Date.now(),
    entries,
    projectErrors,
  }
}
