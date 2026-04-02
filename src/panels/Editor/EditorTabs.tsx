import { useCallback, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react'

interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  projectId: string
}

interface EditorTabsProps {
  files: OpenFile[]
  activeFilePath: string | null
  savedFlash: string | null
  onSelectFile: (projectId: string, path: string) => void
  onCloseFile: (projectId: string, path: string) => void
}

export function EditorTabs({ files, activeFilePath, savedFlash, onSelectFile, onCloseFile }: EditorTabsProps) {
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
        {files.map((file) => (
          <button
            key={file.path}
            className={`editor-tab ${activeFilePath === file.path ? 'active' : ''} ${savedFlash === file.path ? 'saved' : ''}`}
            onClick={() => onSelectFile(file.projectId, file.path)}
            onContextMenu={(e) => handleTabContextMenu(e, file.projectId, file.path)}
          >
            <span className="editor-tab-name">{file.name}</span>
            {file.isDirty ? (
              <span className="editor-tab-dirty" title="Unsaved changes" />
            ) : (
              <button
                className="editor-tab-close"
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file.projectId, file.path)
                }}
              >
                &times;
              </button>
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
