import { useCallback } from 'react'
import { daemon } from '../lib/daemonBridge'
import { useUIStore } from '../store/ui'
import { usePluginStore } from '../store/plugins'
import { useNotificationsStore } from '../store/notifications'

export function useProjects() {
  const setProjects = useUIStore((s) => s.setProjects)
  const setActiveProject = useUIStore((s) => s.setActiveProject)

  const loadProjects = useCallback(async (guard: { cancelled: boolean } = { cancelled: false }) => {
    const res = await daemon.projects.list()
    if (guard.cancelled || !res.ok || !res.data) return
    setProjects(res.data)

    if (!useUIStore.getState().activeProjectId && res.data.length > 0) {
      const sorted = [...res.data].sort((a, b) => (b.last_active ?? 0) - (a.last_active ?? 0))
      const last = sorted[0]
      if (last) setActiveProject(last.id, last.path)
    }
  }, [setProjects, setActiveProject])

  const addProject = useCallback(async () => {
    const pathRes = await daemon.projects.openDialog()
    if (!pathRes.ok || !pathRes.data) return
    const folderPath = pathRes.data
    const name = folderPath.split(/[/\\]/).pop() ?? 'untitled'
    const res = await daemon.projects.create({ name, path: folderPath })
    if (res.ok && res.data) {
      const project = res.data
      setProjects([project, ...useUIStore.getState().projects])
      setActiveProject(project.id, project.path)
      // Day-one nudge: projects:create seeded a starter knowledge base. If it found
      // anything, invite the user to review it so the project never feels "empty".
      void daemon.memory.list(project.id, { status: 'suggested' }).then((seeded) => {
        const count = seeded.ok && seeded.data ? seeded.data.length : 0
        if (count === 0) return
        useNotificationsStore.getState().pushToast({
          kind: 'info',
          context: 'Memory',
          message: `DAEMON learned ${count} thing${count === 1 ? '' : 's'} about ${project.name} — review what it knows`,
          ttlMs: 12_000,
          action: { label: 'Review', onClick: () => usePluginStore.getState().setActivePlugin('memory') },
        })
      })
    }
  }, [setActiveProject, setProjects])

  const removeProject = useCallback(async (projectId: string) => {
    const projectTerminals = useUIStore.getState().terminals.filter((t) => t.projectId === projectId)
    await Promise.all(projectTerminals.map((t) => daemon.terminal.kill(t.id)))
    await daemon.projects.delete(projectId)
    useUIStore.getState().removeProjectState(projectId)
    setProjects(useUIStore.getState().projects.filter((pr) => pr.id !== projectId))
    if (useUIStore.getState().activeProjectId === projectId) {
      setActiveProject(null, null)
    }
  }, [setActiveProject, setProjects])

  return { loadProjects, addProject, removeProject }
}
