import { useCallback } from 'react'
import { useUIStore } from '../store/ui'

export function useProjects() {
  const setProjects = useUIStore((s) => s.setProjects)
  const setActiveProject = useUIStore((s) => s.setActiveProject)

  const loadProjects = useCallback(async (guard: { cancelled: boolean } = { cancelled: false }) => {
    const res = await window.daemon.projects.list()
    if (guard.cancelled || !res.ok || !res.data) return
    setProjects(res.data)

    if (!useUIStore.getState().activeProjectId && res.data.length > 0) {
      const sorted = [...res.data].sort((a, b) => (b.last_active ?? 0) - (a.last_active ?? 0))
      const last = sorted[0]
      if (last) setActiveProject(last.id, last.path)
    }
  }, [setProjects, setActiveProject])

  const addProject = useCallback(async () => {
    const pathRes = await window.daemon.projects.openDialog()
    if (!pathRes.ok || !pathRes.data) return
    const folderPath = pathRes.data
    const name = folderPath.split(/[/\\]/).pop() ?? 'untitled'
    const res = await window.daemon.projects.create({ name, path: folderPath })
    if (res.ok && res.data) {
      setProjects([res.data, ...useUIStore.getState().projects])
      setActiveProject(res.data.id, res.data.path)
    }
  }, [setActiveProject, setProjects])

  const removeProject = useCallback(async (projectId: string) => {
    const projectTerminals = useUIStore.getState().terminals.filter((t) => t.projectId === projectId)
    await Promise.all(projectTerminals.map((t) => window.daemon.terminal.kill(t.id)))
    await window.daemon.projects.delete(projectId)
    useUIStore.getState().removeProjectState(projectId)
    setProjects(useUIStore.getState().projects.filter((pr) => pr.id !== projectId))
    if (useUIStore.getState().activeProjectId === projectId) {
      setActiveProject(null, null)
    }
  }, [setActiveProject, setProjects])

  return { loadProjects, addProject, removeProject }
}
