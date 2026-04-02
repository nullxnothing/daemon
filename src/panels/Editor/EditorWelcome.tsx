import { useRef, useState, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import daemonLogo from '../../assets/daemon-icon.png'

interface EditorWelcomeProps {
  activeProjectId: string | null
}

export function EditorWelcome({ activeProjectId }: EditorWelcomeProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const [isEmptyDragOver, setIsEmptyDragOver] = useState(false)
  const emptyDragDepthRef = useRef(0)

  const handleEmptyDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    emptyDragDepthRef.current = 0
    setIsEmptyDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path
      if (!filePath) continue

      const folderName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Terminal'
      const res = await window.daemon.terminal.create({ cwd: filePath, userInitiated: true })
      if (res.ok && res.data && activeProjectId) {
        addTerminal(activeProjectId, res.data.id, folderName)
      }
    }
  }, [activeProjectId, addTerminal])

  const handleOpenFileExplorer = useCallback(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }))
  }, [])

  const handleLaunchAgent = useCallback(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true, bubbles: true }))
  }, [])

  return (
    <div
      className={`editor-empty ${isEmptyDragOver ? 'drag-over' : ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        emptyDragDepthRef.current += 1
        setIsEmptyDragOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        emptyDragDepthRef.current = Math.max(0, emptyDragDepthRef.current - 1)
        if (emptyDragDepthRef.current === 0) setIsEmptyDragOver(false)
      }}
      onDrop={handleEmptyDrop}
    >
      <div className="editor-empty-glow" />
      <img src={daemonLogo} alt="" className="editor-empty-logo" draggable={false} />
      <span className="editor-empty-title">DAEMON</span>
      <span className="editor-empty-tagline">AI-native development environment</span>

      {isEmptyDragOver ? (
        <span className="editor-empty-drop-hint">Drop folder to open terminal</span>
      ) : activeProjectId ? (
        <>
          <div className="editor-empty-actions">
            <button className="editor-empty-btn" onClick={handleOpenFileExplorer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              Open File
              <span className="editor-empty-shortcut">Ctrl+P</span>
            </button>
            <button className="editor-empty-btn" onClick={handleLaunchAgent}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Launch Agent
              <span className="editor-empty-shortcut">Ctrl+Shift+A</span>
            </button>
            <button className="editor-empty-btn" onClick={() => {
              useUIStore.getState().setActivePanel('settings')
              useUIStore.getState().setCenterMode('canvas')
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Settings
              <span className="editor-empty-shortcut">Ctrl+,</span>
            </button>
          </div>

          <div className="editor-empty-shortcuts">
            <div className="editor-empty-shortcut-row">
              <span className="editor-empty-shortcut-key">Ctrl+Shift+P</span>
              <span className="editor-empty-shortcut-label">Command Palette</span>
            </div>
            <div className="editor-empty-shortcut-row">
              <span className="editor-empty-shortcut-key">Ctrl+`</span>
              <span className="editor-empty-shortcut-label">Toggle Terminal</span>
            </div>
            <div className="editor-empty-shortcut-row">
              <span className="editor-empty-shortcut-key">Ctrl+Shift+G</span>
              <span className="editor-empty-shortcut-label">Grind Mode</span>
            </div>
          </div>
        </>
      ) : (
        <span className="editor-empty-tagline">Select a project to begin</span>
      )}
    </div>
  )
}
