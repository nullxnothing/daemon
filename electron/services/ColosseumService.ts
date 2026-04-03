import * as SecureKey from './SecureKeyService'

const API_BASE = 'https://copilot.colosseum.com/api/v1'

function getPat(): string | null {
  return SecureKey.getKey('COLOSSEUM_COPILOT_PAT') || process.env.COLOSSEUM_COPILOT_PAT || null
}

async function apiCall(method: string, path: string, body?: unknown) {
  const pat = getPat()
  if (!pat) throw new Error('Colosseum PAT not configured. Get one at arena.colosseum.org/copilot')
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as Record<string, string>).error || `Colosseum API error: ${res.status}`)
  }
  return res.json()
}

export async function checkStatus() {
  return apiCall('GET', '/status')
}

export async function searchProjects(query: string, limit = 8, filters?: Record<string, unknown>) {
  return apiCall('POST', '/search/projects', { query, limit, filters })
}

export async function searchArchives(query: string, limit = 5) {
  return apiCall('POST', '/search/archives', { query, limit })
}

export async function getProjectBySlug(slug: string) {
  return apiCall('GET', `/projects/by-slug/${encodeURIComponent(slug)}`)
}

export async function getFilters() {
  return apiCall('GET', '/filters')
}

export async function analyzeHackathon(hackathonSlug: string, dimension: string) {
  return apiCall('POST', '/analyze', { hackathonSlug, dimension })
}

export function isConfigured(): boolean {
  return !!getPat()
}
