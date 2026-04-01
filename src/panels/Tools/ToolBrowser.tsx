import { useEffect, useState, useCallback } from 'react'
import { useToolsStore } from '../../store/tools'
import { useUIStore } from '../../store/ui'
import { ToolCard } from './ToolCard'
import { ToolCreateDialog } from './ToolCreateDialog'
import './ToolBrowser.css'

const CATEGORIES = ['all', 'solana', 'web3', 'dev', 'general']

export function ToolBrowser() {
  const { tools, loaded, load, filter, setFilter, setActiveTool, runningToolIds } = useToolsStore()
  const openFile = useUIStore((s) => s.openFile)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  // Map built-in tool IDs to their panel routes
  const BUILTIN_PANELS: Record<string, Parameters<typeof setActivePanel>[0]> = {
    'builtin-wallet-recovery': 'recovery',
  }

  const handleRun = useCallback(async (toolId: string) => {
    // Built-in tools navigate to their dedicated panel
    const builtinPanel = BUILTIN_PANELS[toolId]
    if (builtinPanel) {
      setActivePanel(builtinPanel)
      return
    }

    const res = await window.daemon.tools.runCommand(toolId)
    if (!res.ok || !res.data) return

    const { command, args, cwd } = res.data
    const fullCommand = [command, ...args].join(' ')
    const termRes = await window.daemon.terminal.create({ cwd, startupCommand: fullCommand })
    if (termRes.ok && termRes.data && activeProjectId) {
      const tool = tools.find((t) => t.id === toolId)
      useUIStore.getState().addTerminal(activeProjectId, termRes.data.id, tool?.name ?? 'Tool')
      await window.daemon.tools.markRunning(toolId, termRes.data.id, termRes.data.pid)
      useToolsStore.getState().addRunning(toolId)
      setActivePanel('claude')
    }
  }, [activeProjectId, tools, setActivePanel])

  const handleEdit = useCallback(async (toolId: string) => {
    const res = await window.daemon.tools.get(toolId)
    if (!res.ok || !res.data || !activeProjectId) return

    const tool = res.data
    const sep = tool.tool_path.includes('\\') ? '\\' : '/'
    const filePath = tool.tool_path + sep + tool.entrypoint
    const fileRes = await window.daemon.fs.readFile(filePath)
    if (fileRes.ok && fileRes.data) {
      openFile({ path: filePath, name: tool.entrypoint, content: fileRes.data.content, projectId: activeProjectId })
      setActivePanel('claude')
    }
  }, [activeProjectId, openFile, setActivePanel])

  const handleOpenFolder = useCallback(async (toolId: string) => {
    await window.daemon.tools.openFolder(toolId)
  }, [])

  const handleDelete = useCallback(async (toolId: string) => {
    await window.daemon.tools.delete(toolId, false)
    load()
  }, [load])

  const handleImport = useCallback(async () => {
    const res = await window.daemon.tools.import()
    if (res.ok) load()
  }, [load])

  const filtered = tools.filter((t) => {
    if (filter.category && filter.category !== 'all' && t.category !== filter.category) return false
    if (filter.search && !t.name.toLowerCase().includes(filter.search.toLowerCase())) return false
    return true
  })

  return (
    <div className="tool-browser">
      <div className="tool-browser-header">
        <h2 className="tool-browser-title">Tools</h2>
        <div className="tool-browser-actions">
          <button className="tool-btn" onClick={handleImport}>Import</button>
          <button className="tool-btn primary" onClick={() => setShowCreate(true)}>New Tool</button>
        </div>
      </div>

      <div className="tool-browser-filters">
        <input
          className="tool-search"
          placeholder="Search tools..."
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value })}
        />
        <div className="tool-categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`tool-category-btn ${(filter.category ?? 'all') === cat ? 'active' : ''}`}
              onClick={() => setFilter({ category: cat === 'all' ? null : cat })}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="tool-browser-empty">Loading tools...</div>
      ) : filtered.length === 0 ? (
        <div className="tool-browser-empty">
          {tools.length === 0 ? (
            <>
              <div className="tool-browser-empty-title">No tools yet</div>
              <div className="tool-browser-empty-desc">Create a custom tool or import an existing folder.</div>
              <div className="tool-browser-empty-actions">
                <button className="tool-btn" onClick={handleImport}>Import Folder</button>
                <button className="tool-btn primary" onClick={() => setShowCreate(true)}>Create Tool</button>
              </div>
            </>
          ) : (
            'No tools match your filter.'
          )}
        </div>
      ) : (
        <div className="tool-grid">
          {filtered.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              isRunning={runningToolIds.has(tool.id)}
              onRun={() => handleRun(tool.id)}
              onEdit={() => handleEdit(tool.id)}
              onOpenFolder={() => handleOpenFolder(tool.id)}
              onDelete={() => handleDelete(tool.id)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <ToolCreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
