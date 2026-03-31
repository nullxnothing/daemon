import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import './FileExplorer.css'

interface ContextMenu {
  x: number
  y: number
  entry: FileEntry | null
  parentPath: string
}

export function FileExplorer() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ parentPath: string; type: 'file' | 'dir' } | null>(null)

  const loadDir = useCallback(async (dirPath: string) => {
    const res = await window.daemon.fs.readDir(dirPath, 2)
    if (res.ok && res.data) setEntries(res.data)
  }, [])

  const reload = useCallback(() => {
    if (activeProjectPath) loadDir(activeProjectPath)
  }, [activeProjectPath, loadDir])

  useEffect(() => { reload() }, [reload])

  // Close context menu on click outside
  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry | null, parentPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, entry, parentPath })
  }

  const handleNewFile = () => {
    if (!contextMenu) return
    const parent = contextMenu.entry?.isDirectory ? contextMenu.entry.path : contextMenu.parentPath
    setCreating({ parentPath: parent, type: 'file' })
    setContextMenu(null)
  }

  const handleNewFolder = () => {
    if (!contextMenu) return
    const parent = contextMenu.entry?.isDirectory ? contextMenu.entry.path : contextMenu.parentPath
    setCreating({ parentPath: parent, type: 'dir' })
    setContextMenu(null)
  }

  const handleDelete = async () => {
    if (!contextMenu?.entry) return
    await window.daemon.fs.delete(contextMenu.entry.path)
    setContextMenu(null)
    reload()
  }

  const handleRename = () => {
    if (!contextMenu?.entry) return
    setRenaming(contextMenu.entry.path)
    setContextMenu(null)
  }

  const handleReveal = async () => {
    if (!contextMenu?.entry) return
    await window.daemon.fs.reveal(contextMenu.entry.path)
    setContextMenu(null)
  }

  const handleCopyPath = async () => {
    if (!contextMenu?.entry) return
    await window.daemon.fs.copyPath(contextMenu.entry.path)
    setContextMenu(null)
  }

  const handleOpenTerminalHere = async () => {
    if (!activeProjectId || !contextMenu) return
    const cwd = contextMenu.entry?.isDirectory ? contextMenu.entry.path : contextMenu.parentPath
    const res = await window.daemon.terminal.create({ cwd })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, pathLabel(cwd))
      setActivePanel('claude')
    }
    setContextMenu(null)
  }

  if (!activeProjectPath) {
    return <div className="file-explorer-empty">No project selected</div>
  }

  return (
    <div
      className="file-explorer"
      onContextMenu={(e) => handleContextMenu(e, null, activeProjectPath)}
    >
      {entries.map((entry) => (
        <FileNode
          key={entry.path}
          entry={entry}
          projectId={activeProjectId}
          depth={0}
          onContextMenu={handleContextMenu}
          renaming={renaming}
          setRenaming={setRenaming}
          reload={reload}
        />
      ))}
      {creating && (
        <CreateInput
          parentPath={creating.parentPath}
          type={creating.type}
          onDone={() => { setCreating(null); reload() }}
        />
      )}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu-item" onClick={handleNewFile}>New File</div>
          <div className="context-menu-item" onClick={handleNewFolder}>New Folder</div>
          {contextMenu.entry && (
            <>
              <div className="context-menu-sep" />
              <div className="context-menu-item" onClick={handleOpenTerminalHere}>Open in Terminal</div>
              <div className="context-menu-item" onClick={handleCopyPath}>Copy Path</div>
              <div className="context-menu-item" onClick={handleReveal}>Reveal in Explorer</div>
              <div className="context-menu-item" onClick={handleRename}>Rename</div>
              <div className="context-menu-item danger" onClick={handleDelete}>Delete</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FileNode({ entry, projectId, depth, onContextMenu, renaming, setRenaming, reload }: {
  entry: FileEntry
  projectId: string | null
  depth: number
  onContextMenu: (e: React.MouseEvent, entry: FileEntry, parentPath: string) => void
  renaming: string | null
  setRenaming: (path: string | null) => void
  reload: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(entry.children ?? null)
  const openFile = useUIStore((s) => s.openFile)
  const renameRef = useRef<HTMLInputElement>(null)

  const parentPath = entry.path.replace(/[\\/][^\\/]+$/, '')

  const handleClick = async () => {
    if (entry.isDirectory) {
      if (!isExpanded && !children) {
        const res = await window.daemon.fs.readDir(entry.path, 1)
        if (res.ok && res.data) setChildren(res.data)
      }
      setIsExpanded(!isExpanded)
    } else {
      const res = await window.daemon.fs.readFile(entry.path)
      if (res.ok && res.data) {
        if (projectId) {
          openFile({ path: entry.path, name: entry.name, content: res.data.content, projectId })
        }
      }
    }
  }

  const handleRenameSubmit = async (newName: string) => {
    if (newName && newName !== entry.name) {
      // Use the same separator as the original path
      const sep = entry.path.includes('\\') ? '\\' : '/'
      const newPath = parentPath + sep + newName
      await window.daemon.fs.rename(entry.path, newPath)
      reload()
    }
    setRenaming(null)
  }

  const isRenaming = renaming === entry.path

  return (
    <>
      <div
        className={`file-node ${entry.isDirectory ? 'directory' : 'file'}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={isRenaming ? undefined : handleClick}
        onContextMenu={(e) => onContextMenu(e, entry, parentPath)}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', entry.path)
          e.dataTransfer.effectAllowed = 'copy'
        }}
      >
        <span className="file-node-chevron" aria-hidden="true">
          {entry.isDirectory ? (isExpanded ? '▾' : '▸') : ''}
        </span>
        <span className="file-node-icon" aria-hidden="true">
          <FileTypeIcon entry={entry} expanded={isExpanded} />
        </span>
        {isRenaming ? (
          <input
            ref={renameRef}
            className="file-rename-input"
            defaultValue={entry.name}
            autoFocus
            onBlur={(e) => handleRenameSubmit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit((e.target as HTMLInputElement).value)
              if (e.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <span className="file-node-name">{entry.name}</span>
        )}
      </div>
      {isExpanded && children?.map((child) => (
        <FileNode
          key={child.path}
          entry={child}
          projectId={projectId}
          depth={depth + 1}
          onContextMenu={onContextMenu}
          renaming={renaming}
          setRenaming={setRenaming}
          reload={reload}
        />
      ))}
    </>
  )
}

function FileTypeIcon({ entry, expanded }: { entry: FileEntry; expanded: boolean }) {
  if (entry.isDirectory) {
    const variant = classifyFolder(entry.name)
    return (
      <svg className={`file-svg folder ${expanded ? 'open' : ''} ${variant}`} viewBox="0 0 18 16" fill="none">
        <path d="M2.25 4C2.25 3.03 3.03 2.25 4 2.25H7.1L8.85 4H14C14.97 4 15.75 4.78 15.75 5.75V11.5C15.75 12.47 14.97 13.25 14 13.25H4C3.03 13.25 2.25 12.47 2.25 11.5V4Z" className="file-fill-primary"/>
        <path d="M2.85 5.15H15.15" className="file-stroke"/>
      </svg>
    )
  }

  const type = classifyFile(entry.name)

  return (
    <svg className={`file-svg file ${type.className}`} viewBox="0 0 16 18" fill="none">
      <path d="M3 1.5H9.2L13 5.3V15.25C13 16.22 12.22 17 11.25 17H3C2.03 17 1.25 16.22 1.25 15.25V3.25C1.25 2.28 2.03 1.5 3 1.5Z" className="file-fill-primary"/>
      <path d="M9.2 1.5V4.55C9.2 5.08 9.62 5.5 10.15 5.5H13" className="file-fold"/>
      <path d={type.glyph} className="file-glyph"/>
    </svg>
  )
}

function classifyFile(name: string): { className: string; glyph: string } {
  const lower = name.toLowerCase()
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : ''

  if (lower === 'package.json') return { className: 'node', glyph: 'M4.2 10.2H6.2M4.2 12.2H8.4M4.2 8.2H9.8' }
  if (lower === 'tsconfig.json') return { className: 'ts', glyph: 'M3.9 8.1H9.8M6.8 8.1V13.1M10.8 9.1C10.8 8.55 11.25 8.1 11.8 8.1H12.1C12.65 8.1 13.1 8.55 13.1 9.1C13.1 10.4 10.8 10.25 10.8 11.6C10.8 12.15 11.25 12.6 11.8 12.6H12.1C12.65 12.6 13.1 12.15 13.1 11.6' }
  if (['ts', 'tsx'].includes(extension)) return { className: 'ts', glyph: 'M3.8 8.1H9.7M6.7 8.1V13.1M10.6 8.1H12.8L10.6 13.1H12.8' }
  if (['js', 'jsx', 'mjs', 'cjs'].includes(extension)) return { className: 'js', glyph: 'M4.2 8.1H8.6V13.1M11 8.1H12.3C12.96 8.1 13.5 8.64 13.5 9.3V11.9C13.5 12.56 12.96 13.1 12.3 13.1H11' }
  if (['json'].includes(extension)) return { className: 'json', glyph: 'M5.2 7.8C4.6 8.15 4.25 8.85 4.25 9.6C4.25 10.35 4.6 11.05 5.2 11.4M10.8 7.8C11.4 8.15 11.75 8.85 11.75 9.6C11.75 10.35 11.4 11.05 10.8 11.4M8 7.6V11.6' }
  if (['md', 'mdx'].includes(extension) || lower === 'readme') return { className: 'md', glyph: 'M3.8 12.8V7.8L5.8 10.1L8 7.8L10.2 10.1L12.2 7.8V12.8' }
  if (['css', 'scss', 'sass', 'less'].includes(extension)) return { className: 'css', glyph: 'M4.5 8.1H11.8M4.5 10.6H10.2M4.5 13.1H9' }
  if (['html', 'htm'].includes(extension)) return { className: 'html', glyph: 'M5.7 8.2L3.9 9.9L5.7 11.6M10.3 8.2L12.1 9.9L10.3 11.6M8.9 7.5L7.1 12.3' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'icns'].includes(extension)) return { className: 'image', glyph: 'M4.1 12.6L6.5 10.1L8.2 11.8L10.6 9.4L12.9 11.7M6 7.5H6.05' }
  if (['yml', 'yaml'].includes(extension)) return { className: 'yaml', glyph: 'M4.5 8.1L6.8 10.6L9.1 8.1M6.8 10.6V13.1M11.2 8.1V13.1M11.2 10.6H13.2' }
  if (['env'].includes(extension) || lower.startsWith('.env')) return { className: 'env', glyph: 'M4.2 8.1H9.8M4.2 10.6H8.7M4.2 13.1H10.8' }
  if (['sh', 'ps1', 'bash', 'zsh'].includes(extension)) return { className: 'shell', glyph: 'M4 8.6L6.2 10.5L4 12.4M7.9 12.4H12.4' }
  return { className: 'default', glyph: 'M4.1 8.2H11.9M4.1 10.6H11.9M4.1 13H9.4' }
}

function classifyFolder(name: string): string {
  const lower = name.toLowerCase()
  if (['src', 'app', 'components'].includes(lower)) return 'accent-blue'
  if (['public', 'assets', 'images', 'styles'].includes(lower)) return 'accent-amber'
  if (['scripts', 'build', 'dist', 'electron'].includes(lower)) return 'accent-green'
  if (lower.startsWith('.')) return 'accent-muted'
  return 'accent-neutral'
}

function CreateInput({ parentPath, type, onDone }: {
  parentPath: string
  type: 'file' | 'dir'
  onDone: () => void
}) {
  const handleSubmit = async (name: string) => {
    if (!name) { onDone(); return }
    const sep = parentPath.includes('\\') ? '\\' : '/'
    const fullPath = parentPath + sep + name
    if (type === 'file') {
      await window.daemon.fs.createFile(fullPath)
    } else {
      await window.daemon.fs.createDir(fullPath)
    }
    onDone()
  }

  return (
    <div className="file-create-input" style={{ paddingLeft: 26 }}>
      <input
        className="file-rename-input"
        placeholder={type === 'file' ? 'filename' : 'folder name'}
        autoFocus
        onBlur={(e) => handleSubmit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit((e.target as HTMLInputElement).value)
          if (e.key === 'Escape') onDone()
        }}
      />
    </div>
  )
}

function pathLabel(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() || 'Terminal'
}
