import { useCallback, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react'

interface OpenFile {
  path: string
  name: string
  isDirty: boolean
  projectId: string
}

interface EditorTabsProps {
  files: OpenFile[]
  activeFilePath: string | null
  savedFlash: string | null
  onSelectFile: (projectId: string, path: string) => void
  onCloseFile: (projectId: string, path: string) => void
  browserTabOpen: boolean
  browserTabActive: boolean
  onBrowserTabClick: () => void
  dashboardTabOpen: boolean
  dashboardTabActive: boolean
  onDashboardTabClick: () => void
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`editor-tab-browser-icon${active ? ' active' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <polyline points="3 17 9 11 13 15 21 7" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  )
}

function GlobeIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`editor-tab-browser-icon${active ? ' active' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

export function EditorTabs({
  files,
  activeFilePath,
  savedFlash,
  onSelectFile,
  onCloseFile,
  browserTabOpen,
  browserTabActive,
  onBrowserTabClick,
  dashboardTabOpen,
  dashboardTabActive,
  onDashboardTabClick,
}: EditorTabsProps) {
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number; y: number; projectId: string; path: string
  } | null>(null)

  const handleTabContextMenu = useCallback((e: ReactMouseEvent, projectId: string, path: string) => {
    e.preventDefault()
    setTabContextMenu({ x: e.clientX, y: e.clientY, projectId, path })
  }, [])

  useEffect(() => {
    if (!tabContextMenu) return
    const close = () => setTabContextMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tabContextMenu])

  const handleCloseOtherTabs = useCallback((projectId: string, keepPath: string) => {
    const toClose = files.filter((f) => f.projectId === projectId && f.path !== keepPath)
    for (const f of toClose) onCloseFile(f.projectId, f.path)
    setTabContextMenu(null)
  }, [files, onCloseFile])

  const handleCloseAllTabs = useCallback((projectId: string) => {
    const toClose = files.filter((f) => f.projectId === projectId)
    for (const f of toClose) onCloseFile(f.projectId, f.path)
    setTabContextMenu(null)
  }, [files, onCloseFile])

  const handleCloseTabsToRight = useCallback((projectId: string, path: string) => {
    const idx = files.findIndex((f) => f.projectId === projectId && f.path === path)
    if (idx < 0) return
    const toClose = files.slice(idx + 1).filter((f) => f.projectId === projectId)
    for (const f of toClose) onCloseFile(f.projectId, f.path)
    setTabContextMenu(null)
  }, [files, onCloseFile])

  return (
    <>
      <div className="editor-tabs">
        {browserTabOpen && (
          <>
            <button
              className={`editor-tab editor-tab-browser${browserTabActive ? ' active' : ''}`}
              onClick={onBrowserTabClick}
              aria-label="Browser tab"
            >
              <GlobeIcon active={browserTabActive} />
              <span className="editor-tab-name">Browser</span>
            </button>
          </>
        )}
        {dashboardTabOpen && (
          <>
            <button
              className={`editor-tab editor-tab-browser editor-tab-dashboard${dashboardTabActive ? ' active' : ''}`}
              onClick={onDashboardTabClick}
              aria-label="Dashboard tab"
            >
              <ChartIcon active={dashboardTabActive} />
              <span className="editor-tab-name">Dashboard</span>
            </button>
          </>
        )}
        {(browserTabOpen || dashboardTabOpen) && files.length > 0 && (
          <div className="editor-tab-browser-sep" />
        )}
        {files.map((file) => (
          <button
            key={file.path}
            className={`editor-tab ${!browserTabActive && activeFilePath === file.path ? 'active' : ''} ${savedFlash === file.path ? 'saved' : ''}`}
            onClick={() => onSelectFile(file.projectId, file.path)}
            onContextMenu={(e) => handleTabContextMenu(e, file.projectId, file.path)}
          >
            <span className="editor-tab-name">{file.name}</span>
            {file.isDirty ? (
              <span className="editor-tab-dirty" title="Unsaved changes" />
            ) : (
              <span
                className="editor-tab-close"
                role="button"
                tabIndex={0}
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file.projectId, file.path)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    onCloseFile(file.projectId, file.path)
                  }
                }}
              >
                &times;
              </span>
            )}
          </button>
        ))}
      </div>
      {tabContextMenu && (
        <div
          className="tab-context-menu"
          style={{ top: tabContextMenu.y, left: tabContextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="tab-context-item" onClick={() => { onCloseFile(tabContextMenu.projectId, tabContextMenu.path); setTabContextMenu(null) }}>Close</button>
          <button className="tab-context-item" onClick={() => handleCloseOtherTabs(tabContextMenu.projectId, tabContextMenu.path)}>Close Others</button>
          <button className="tab-context-item" onClick={() => handleCloseTabsToRight(tabContextMenu.projectId, tabContextMenu.path)}>Close to Right</button>
          <div className="tab-context-sep" />
          <button className="tab-context-item" onClick={() => handleCloseAllTabs(tabContextMenu.projectId)}>Close All</button>
        </div>
      )}
    </>
  )
}
