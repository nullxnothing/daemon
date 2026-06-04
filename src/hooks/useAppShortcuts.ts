import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { useUIStore } from '../store/ui'
import { useWorkflowShellStore } from '../store/workflowShell'
import { useWorkspaceProfileStore } from '../store/workspaceProfile'

interface UseAppShortcutsOptions {
  setPaletteMode: Dispatch<SetStateAction<'commands' | 'files' | null>>
  setShowAgentLauncher: Dispatch<SetStateAction<boolean>>
  setShowExplorer: Dispatch<SetStateAction<boolean>>
  setShowRightPanel: Dispatch<SetStateAction<boolean>>
  setShowTerminal: Dispatch<SetStateAction<boolean>>
  setShowShortcuts: Dispatch<SetStateAction<boolean>>
}

// True when focus is in a text-entry context, where '?' should type a literal.
function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useAppShortcuts({
  setPaletteMode,
  setShowAgentLauncher,
  setShowExplorer,
  setShowRightPanel,
  setShowTerminal,
  setShowShortcuts,
}: UseAppShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shortcuts overlay: '?' (Shift+/), only outside text fields.
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingContext(e.target)) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
        return
      }
      // Command Palette: Ctrl+Shift+P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setPaletteMode((v) => (v === 'commands' ? null : 'commands'))
        return
      }
      // Quick Open: Ctrl+P or Ctrl+K (titlebar search)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault()
        setPaletteMode((v) => (v === 'files' ? null : 'files'))
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setShowAgentLauncher((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        window.daemon.window.reload()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setShowRightPanel((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        const current = useUIStore.getState().centerMode
        useUIStore.getState().setCenterMode(current === 'grind' ? 'canvas' : 'grind')
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault()
        if (!useWorkspaceProfileStore.getState().isToolVisible('browser')) return
        useUIStore.getState().toggleBrowserTab()
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        if (!useWorkspaceProfileStore.getState().isToolVisible('dashboard')) return
        useUIStore.getState().toggleDashboardTab()
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'e') {
        e.preventDefault()
        setShowExplorer((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        setShowTerminal((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        const state = useUIStore.getState()
        const projectId = state.activeProjectId
        if (!projectId) return
        const activePath = state.activeFilePathByProject[projectId]
        if (activePath) {
          state.closeFile(projectId, activePath)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        useUIStore.getState().openWorkspaceTool('settings')
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        useWorkflowShellStore.getState().toggleDrawer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setPaletteMode, setShowAgentLauncher, setShowExplorer, setShowRightPanel, setShowTerminal, setShowShortcuts])
}
