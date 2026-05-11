import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import type { GitFile, GitCommit } from '../../electron/shared/types'

const STALE_MS = 2_000

interface GitProjectState {
  branch: string | null
  branches: string[]
  files: GitFile[]
  commits: GitCommit[]
  stashCount: number
  latestStashMessage: string | null
  error: string | null
  lastFetch: number
}

const EMPTY: GitProjectState = {
  branch: null,
  branches: [],
  files: [],
  commits: [],
  stashCount: 0,
  latestStashMessage: null,
  error: null,
  lastFetch: 0,
}

interface GitStoreState {
  byProject: Record<string, GitProjectState>
  inflight: Record<string, Promise<void> | undefined>
  /** Always fetches. */
  refresh: (projectPath: string) => Promise<void>
  /** Skips fetch if state was refreshed within STALE_MS. */
  refreshIfStale: (projectPath: string) => Promise<void>
  /** Clears cached state for a project (call on project deletion). */
  invalidate: (projectPath: string) => void
  /** Marks all cached projects stale so the next refreshIfStale fetches. */
  invalidateAll: () => void
}

function selectProject(state: GitStoreState, projectPath: string | null | undefined): GitProjectState {
  if (!projectPath) return EMPTY
  return state.byProject[projectPath] ?? EMPTY
}

export const useGitStore = create<GitStoreState>((set, get) => ({
  byProject: {},
  inflight: {},

  refresh: async (projectPath: string) => {
    if (!projectPath) return
    const existing = get().inflight[projectPath]
    if (existing) return existing

    const promise = (async () => {
      try {
        const [brRes, statusRes, logRes, stashRes] = await Promise.all([
          daemon.git.branches(projectPath),
          daemon.git.status(projectPath),
          daemon.git.log(projectPath),
          daemon.git.stashList(projectPath),
        ])

        const prev = get().byProject[projectPath] ?? EMPTY
        const next: GitProjectState = { ...prev, lastFetch: Date.now() }

        if (brRes.ok && brRes.data) {
          next.branch = brRes.data.current
          next.branches = brRes.data.branches
        }
        if (statusRes.ok && statusRes.data) {
          next.files = statusRes.data
          next.error = null
        } else {
          next.error = statusRes.error ?? 'Git operation failed'
        }
        if (logRes.ok && logRes.data) next.commits = logRes.data
        if (stashRes.ok && stashRes.data) {
          next.stashCount = stashRes.data.length
          next.latestStashMessage = stashRes.data[0]?.message ?? null
        }

        set((state) => ({ byProject: { ...state.byProject, [projectPath]: next } }))
      } finally {
        set((state) => {
          const { [projectPath]: _, ...rest } = state.inflight
          return { inflight: rest }
        })
      }
    })()

    set((state) => ({ inflight: { ...state.inflight, [projectPath]: promise } }))
    return promise
  },

  refreshIfStale: async (projectPath: string) => {
    if (!projectPath) return
    const project = get().byProject[projectPath]
    if (project && Date.now() - project.lastFetch < STALE_MS) return
    await get().refresh(projectPath)
  },

  invalidate: (projectPath: string) => {
    set((state) => {
      const { [projectPath]: _, ...rest } = state.byProject
      return { byProject: rest }
    })
  },

  invalidateAll: () => {
    set((state) => {
      const next: Record<string, GitProjectState> = {}
      for (const [key, value] of Object.entries(state.byProject)) {
        next[key] = { ...value, lastFetch: 0 }
      }
      return { byProject: next }
    })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    useGitStore.getState().invalidateAll()
  })
}

/** Hook returning the cached state for a project, or EMPTY when unknown. */
export function useGitProject(projectPath: string | null | undefined): GitProjectState {
  return useGitStore((state) => selectProject(state, projectPath))
}
