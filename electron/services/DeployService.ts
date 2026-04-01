import * as SecureKeyService from './SecureKeyService'
import { getDb } from '../db/db'
import { API_ENDPOINTS } from '../config/constants'
import type {
  DeployPlatform,
  DeployAuthStatus,
  ProjectInfra,
  VercelLink,
  RailwayLink,
  DeploymentEntry,
  DeployStatus,
} from '../shared/types'

const VERCEL_TOKEN_KEY = 'deploy:vercel-token'
const RAILWAY_TOKEN_KEY = 'deploy:railway-token'

function tokenKey(platform: DeployPlatform): string {
  return platform === 'vercel' ? VERCEL_TOKEN_KEY : RAILWAY_TOKEN_KEY
}

// --- Token Management ---

export function storeToken(platform: DeployPlatform, token: string): void {
  SecureKeyService.storeKey(tokenKey(platform), token)
}

export function getToken(platform: DeployPlatform): string | null {
  return SecureKeyService.getKey(tokenKey(platform))
}

export function deleteToken(platform: DeployPlatform): void {
  SecureKeyService.deleteKey(tokenKey(platform))
}

export function getAuthStatus(): DeployAuthStatus {
  return {
    vercel: { authenticated: !!getToken('vercel'), user: null },
    railway: { authenticated: !!getToken('railway'), user: null },
  }
}

// --- Vercel API ---

async function vercelFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${API_ENDPOINTS.VERCEL_API}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Vercel API ${res.status}: ${body}`)
    }
    return res
  } finally {
    clearTimeout(timeout)
  }
}

export async function validateVercelToken(token: string): Promise<{ name: string; email: string }> {
  const res = await vercelFetch('/v2/user', token)
  const json = await res.json() as { user: { name: string; email: string } }
  return { name: json.user.name, email: json.user.email }
}

export async function listVercelProjects(token: string, teamId?: string | null): Promise<unknown[]> {
  const params = new URLSearchParams({ limit: '50' })
  if (teamId) params.set('teamId', teamId)
  const res = await vercelFetch(`/v9/projects?${params}`, token)
  const json = await res.json() as { projects: unknown[] }
  return json.projects
}

export async function listVercelDeployments(
  token: string,
  projectId: string,
  teamId?: string | null,
  limit = 20
): Promise<DeploymentEntry[]> {
  const params = new URLSearchParams({ projectId, limit: String(limit) })
  if (teamId) params.set('teamId', teamId)
  const res = await vercelFetch(`/v6/deployments?${params}`, token)
  const json = await res.json() as { deployments: Array<{
    uid: string; state: string; url: string | null;
    meta?: { githubCommitRef?: string; githubCommitSha?: string; githubCommitMessage?: string };
    created: number
  }> }

  return json.deployments.map((d) => ({
    id: d.uid,
    platform: 'vercel' as const,
    status: mapVercelStatus(d.state),
    url: d.url ? `https://${d.url}` : null,
    branch: d.meta?.githubCommitRef ?? null,
    commitSha: d.meta?.githubCommitSha ?? null,
    commitMessage: d.meta?.githubCommitMessage ?? null,
    createdAt: d.created,
  }))
}

function mapVercelStatus(state: string): DeploymentEntry['status'] {
  const map: Record<string, DeploymentEntry['status']> = {
    BUILDING: 'BUILDING', READY: 'READY', ERROR: 'ERROR',
    CANCELED: 'CANCELED', QUEUED: 'QUEUED', INITIALIZING: 'BUILDING',
  }
  return map[state] ?? 'BUILDING'
}

export async function triggerVercelRedeploy(
  token: string,
  projectId: string,
  teamId?: string | null,
  target = 'production'
): Promise<{ id: string; url: string | null }> {
  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  const qs = params.toString() ? `?${params}` : ''
  const res = await vercelFetch(`/v13/deployments${qs}`, token, {
    method: 'POST',
    body: JSON.stringify({ name: projectId, target, gitSource: { type: 'github', repoId: projectId } }),
  })
  const json = await res.json() as { id: string; url: string | null }
  return { id: json.id, url: json.url ? `https://${json.url}` : null }
}

export async function listVercelEnvVars(
  token: string,
  projectId: string,
  teamId?: string | null
): Promise<unknown[]> {
  const params = new URLSearchParams()
  if (teamId) params.set('teamId', teamId)
  const qs = params.toString() ? `?${params}` : ''
  const res = await vercelFetch(`/v10/projects/${projectId}/env${qs}`, token)
  const json = await res.json() as { envs: unknown[] }
  return json.envs
}

// --- Railway API ---

async function railwayQuery<T = unknown>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(API_ENDPOINTS.RAILWAY_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Railway API ${res.status}: ${body}`)
    }
    const json = await res.json() as { data: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) throw new Error(json.errors[0].message)
    return json.data
  } finally {
    clearTimeout(timeout)
  }
}

export async function validateRailwayToken(token: string): Promise<{ name: string; email: string }> {
  const data = await railwayQuery<{ me: { name: string; email: string } }>(
    `query { me { name email } }`, {}, token
  )
  return { name: data.me.name, email: data.me.email }
}

export async function listRailwayProjects(token: string): Promise<unknown[]> {
  const data = await railwayQuery<{ me: { projects: { edges: Array<{ node: unknown }> } } }>(
    `query {
      me {
        projects(first: 50) {
          edges {
            node {
              id name
              services { edges { node { id name } } }
              environments { edges { node { id name } } }
            }
          }
        }
      }
    }`, {}, token
  )
  return data.me.projects.edges.map((e) => e.node)
}

export async function listRailwayDeployments(
  token: string,
  projectId: string,
  serviceId: string,
  environmentId: string,
  limit = 20
): Promise<DeploymentEntry[]> {
  const data = await railwayQuery<{
    deployments: { edges: Array<{ node: {
      id: string; status: string; staticUrl: string | null;
      meta?: { branch?: string; commitHash?: string; commitMessage?: string };
      createdAt: string
    } }> }
  }>(
    `query($input: DeploymentListInput!) {
      deployments(input: $input, first: $limit) {
        edges { node { id status staticUrl meta createdAt } }
      }
    }`,
    { input: { projectId, serviceId, environmentId }, limit }, token
  )
  return data.deployments.edges.map((e) => {
    const d = e.node
    return {
      id: d.id,
      platform: 'railway' as const,
      status: mapRailwayStatus(d.status),
      url: d.staticUrl ? `https://${d.staticUrl}` : null,
      branch: d.meta?.branch ?? null,
      commitSha: d.meta?.commitHash ?? null,
      commitMessage: d.meta?.commitMessage ?? null,
      createdAt: new Date(d.createdAt).getTime(),
    }
  })
}

function mapRailwayStatus(status: string): DeploymentEntry['status'] {
  const map: Record<string, DeploymentEntry['status']> = {
    BUILDING: 'BUILDING', DEPLOYING: 'BUILDING', SUCCESS: 'READY',
    FAILED: 'ERROR', CRASHED: 'ERROR', REMOVED: 'CANCELED', QUEUED: 'QUEUED',
  }
  return map[status] ?? 'BUILDING'
}

export async function triggerRailwayDeploy(
  token: string,
  serviceId: string,
  environmentId: string
): Promise<boolean> {
  await railwayQuery(
    `mutation($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
    }`,
    { serviceId, environmentId }, token
  )
  return true
}

export async function listRailwayVariables(
  token: string,
  projectId: string,
  environmentId: string,
  serviceId?: string
): Promise<Record<string, string>> {
  const data = await railwayQuery<{ variables: Record<string, string> }>(
    `query($projectId: String!, $environmentId: String!, $serviceId: String) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
    }`,
    { projectId, environmentId, serviceId: serviceId ?? null }, token
  )
  return data.variables
}

// --- Git Remote Parsing ---

export function parseGitRemote(url: string): { platform: string; owner: string; repo: string } | null {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return { platform: sshMatch[1], owner: sshMatch[2], repo: sshMatch[3] }
  }
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return { platform: httpsMatch[1], owner: httpsMatch[2], repo: httpsMatch[3] }
  }
  return null
}

export async function autoDetectProject(
  projectPath: string,
  token: string,
  platform: DeployPlatform
): Promise<{ vercel?: unknown[]; railway?: unknown[] }> {
  const simpleGit = (await import('simple-git')).default
  const git = simpleGit(projectPath)

  let remoteUrl: string | null = null
  try {
    const remotes = await git.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin')
    remoteUrl = origin?.refs?.fetch ?? null
  } catch { /* not a git repo */ }

  const parsed = remoteUrl ? parseGitRemote(remoteUrl) : null

  if (platform === 'vercel') {
    const projects = await listVercelProjects(token)
    if (!parsed) return { vercel: projects }
    const repoName = `${parsed.owner}/${parsed.repo}`
    const filtered = (projects as Array<{ link?: { repo?: string } }>).filter(
      (p) => p.link?.repo === repoName || p.link?.repo === parsed.repo
    )
    return { vercel: filtered.length > 0 ? filtered : projects }
  }

  const projects = await listRailwayProjects(token)
  return { railway: projects }
}

// --- Project Linking ---

export function getProjectInfra(daemonProjectId: string): ProjectInfra {
  const db = getDb()
  const row = db.prepare('SELECT infra FROM projects WHERE id = ?').get(daemonProjectId) as
    { infra: string } | undefined
  if (!row) return {}
  try { return JSON.parse(row.infra) as ProjectInfra } catch { return {} }
}

export function linkProject(
  daemonProjectId: string,
  platform: DeployPlatform,
  linkData: VercelLink | RailwayLink
): void {
  const db = getDb()
  const infra = getProjectInfra(daemonProjectId)
  if (platform === 'vercel') {
    infra.vercel = linkData as VercelLink
  } else {
    infra.railway = linkData as RailwayLink
  }
  db.prepare('UPDATE projects SET infra = ? WHERE id = ?').run(JSON.stringify(infra), daemonProjectId)
}

export function unlinkProject(daemonProjectId: string, platform: DeployPlatform): void {
  const db = getDb()
  const infra = getProjectInfra(daemonProjectId)
  delete infra[platform]
  db.prepare('UPDATE projects SET infra = ? WHERE id = ?').run(JSON.stringify(infra), daemonProjectId)
}

export async function getDeployStatus(daemonProjectId: string): Promise<DeployStatus[]> {
  const infra = getProjectInfra(daemonProjectId)
  const statuses: DeployStatus[] = []

  if (infra.vercel) {
    const token = getToken('vercel')
    let latest: DeploymentEntry | null = null
    if (token) {
      try {
        const deployments = await listVercelDeployments(token, infra.vercel.projectId, infra.vercel.teamId, 1)
        latest = deployments[0] ?? null
      } catch { /* token may be expired */ }
    }
    statuses.push({
      platform: 'vercel',
      linked: true,
      projectName: infra.vercel.projectName,
      productionUrl: infra.vercel.productionUrl,
      latestStatus: latest?.status ?? null,
      latestUrl: latest?.url ?? null,
      latestBranch: latest?.branch ?? null,
      latestCreatedAt: latest?.createdAt ?? null,
    })
  }

  if (infra.railway) {
    const token = getToken('railway')
    let latest: DeploymentEntry | null = null
    if (token) {
      try {
        const deployments = await listRailwayDeployments(
          token, infra.railway.projectId, infra.railway.serviceId, infra.railway.environmentId, 1
        )
        latest = deployments[0] ?? null
      } catch { /* token may be expired */ }
    }
    statuses.push({
      platform: 'railway',
      linked: true,
      projectName: infra.railway.projectName,
      productionUrl: infra.railway.productionUrl,
      latestStatus: latest?.status ?? null,
      latestUrl: latest?.url ?? null,
      latestBranch: latest?.branch ?? null,
      latestCreatedAt: latest?.createdAt ?? null,
    })
  }

  return statuses
}
