import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Command } from './commands'
import { FocusTrap } from '../FocusTrap'
import './CommandPalette.css'

interface FileItem {
  name: string
  path: string
}

interface Props {
  mode: 'commands' | 'files'
  commands: Command[]
  files: FileItem[]
  projectRoot?: string | null
  onClose: () => void
  onSelectFile: (path: string) => void
}

export function CommandPalette({ mode, commands, files, projectRoot, onClose, onSelectFile }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Global Escape listener — dismisses palette even when focus is outside the input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown, true)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true)
  }, [onClose])

  const filteredCommands = useMemo(() => {
    if (mode !== 'commands') return []
    const q = query.toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [mode, commands, query])

  const filteredFiles = useMemo(() => {
    if (mode !== 'files') return []
    const q = query.toLowerCase()
    if (!q) return files
    return files.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
  }, [mode, files, query])

  const itemCount = mode === 'commands' ? filteredCommands.length : filteredFiles.length

  // Reset selection when query or results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, itemCount])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const selected = list.querySelector('[data-selected="true"]') as HTMLElement | null
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const executeSelected = useCallback(() => {
    if (mode === 'commands') {
      const cmd = filteredCommands[selectedIndex]
      if (cmd) {
        onClose()
        cmd.action()
      }
    } else {
      const file = filteredFiles[selectedIndex]
      if (file) {
        onClose()
        onSelectFile(file.path)
      }
    }
  }, [mode, filteredCommands, filteredFiles, selectedIndex, onClose, onSelectFile])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1 < itemCount ? i + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 >= 0 ? i - 1 : Math.max(itemCount - 1, 0)))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        executeSelected()
      }
    },
    [onClose, itemCount, executeSelected],
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  // Group commands by category for display
  const groupedCommands = useMemo(() => {
    if (mode !== 'commands') return []
    const groups: { category: string; items: Array<{ command: Command; globalIndex: number }> }[] = []
    const categoryMap = new Map<string, Array<{ command: Command; globalIndex: number }>>()

    filteredCommands.forEach((cmd, idx) => {
      const cat = cmd.category ?? 'Other'
      if (!categoryMap.has(cat)) categoryMap.set(cat, [])
      categoryMap.get(cat)!.push({ command: cmd, globalIndex: idx })
    })

    for (const [category, items] of categoryMap) {
      groups.push({ category, items })
    }

    return groups
  }, [mode, filteredCommands])

  return (
    <div className="palette-overlay" onClick={handleOverlayClick}>
      <FocusTrap>
      <div className="palette-box" onKeyDown={handleKeyDown} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={mode === 'commands' ? 'Type a command...' : 'Search files...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="palette-list" ref={listRef}>
          {mode === 'commands' && (
            <>
              {groupedCommands.length === 0 && <div className="palette-empty">No matching commands</div>}
              {groupedCommands.map((group) => (
                <div key={group.category}>
                  <div className="palette-category">{group.category}</div>
                  {group.items.map(({ command, globalIndex }) => (
                    <div
                      key={command.id}
                      className="palette-item"
                      data-selected={globalIndex === selectedIndex}
                      onClick={() => {
                        onClose()
                        command.action()
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <span className="palette-item-label">{command.label}</span>
                      {command.shortcut && (
                        <span className="palette-item-shortcut">{command.shortcut}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {mode === 'files' && (
            <>
              {filteredFiles.length === 0 && <div className="palette-empty">No matching files</div>}
              {filteredFiles.map((file, idx) => {
                const displayPath = projectRoot ? stripProjectRoot(projectRoot, file.path) : file.path
                return (
                  <div
                    key={file.path}
                    className="palette-item"
                    data-selected={idx === selectedIndex}
                    onClick={() => {
                      onClose()
                      onSelectFile(file.path)
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="palette-item-label">{file.name}</span>
                    <span className="palette-item-shortcut palette-item-path">{displayPath}</span>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
      </FocusTrap>
    </div>
  )
}

function stripProjectRoot(root: string, fullPath: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedFull = fullPath.replace(/\\/g, '/')
  if (normalizedFull.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
    return normalizedFull.slice(normalizedRoot.length + 1)
  }
  return fullPath
}
