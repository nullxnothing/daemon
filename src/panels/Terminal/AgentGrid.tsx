import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useUIStore } from '../../store/ui'

interface GridCell {
  id: string | null
  label: string
  visible: boolean
}

type PageCells = GridCell[]

const DEFAULT_CELLS: GridCell[] = [
  { id: null, label: 'Agent 1', visible: true },
  { id: null, label: 'Agent 2', visible: true },
  { id: null, label: 'Agent 3', visible: true },
  { id: null, label: 'Agent 4', visible: true },
]

export function AgentGrid() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const grindPageCount = useUIStore((s) => s.grindPageCount)
  const activeGrindPage = useUIStore((s) => s.activeGrindPage)
  const setActiveGrindPage = useUIStore((s) => s.setActiveGrindPage)
  const addGrindPage = useUIStore((s) => s.addGrindPage)
  const removeGrindPage = useUIStore((s) => s.removeGrindPage)

  const [pages, setPages] = useState<PageCells[]>([DEFAULT_CELLS.map((c) => ({ ...c }))])
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const [dragSource, setDragSource] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // Sync pages array length with store page count
  useEffect(() => {
    setPages((prev) => {
      if (prev.length === grindPageCount) return prev
      if (prev.length < grindPageCount) {
        const newPages = [...prev]
        for (let i = prev.length; i < grindPageCount; i++) {
          const cellNum = i * 4
          newPages.push([
            { id: null, label: `Agent ${cellNum + 1}`, visible: true },
            { id: null, label: `Agent ${cellNum + 2}`, visible: true },
            { id: null, label: `Agent ${cellNum + 3}`, visible: true },
            { id: null, label: `Agent ${cellNum + 4}`, visible: true },
          ])
        }
        return newPages
      }
      return prev.slice(0, grindPageCount)
    })
  }, [grindPageCount])

  const cells = pages[activeGrindPage] ?? []

  const setCells = useCallback((updater: (prev: GridCell[]) => GridCell[]) => {
    setPages((prev) => {
      const next = [...prev]
      next[activeGrindPage] = updater(next[activeGrindPage] ?? [])
      return next
    })
  }, [activeGrindPage])

  const activateCell = useCallback(async (index: number) => {
    if (!activeProjectId) return
    const currentCells = pagesRef.current[activeGrindPage]
    if (!currentCells || !currentCells[index]) return
    const label = currentCells[index].label
    const res = await window.daemon.terminal.create({
      cwd: activeProjectPath ?? undefined,
      startupCommand: 'claude',
    })
    if (res.ok && res.data) {
      const termId = res.data.id
      addTerminal(activeProjectId, termId, label)
      setCells((prev) => {
        const next = [...prev]
        next[index] = { ...next[index], id: termId }
        return next
      })
    }
  }, [activeProjectId, activeProjectPath, addTerminal, activeGrindPage, setCells])

  const handleClose = useCallback(async (index: number) => {
    const cell = cells[index]
    if (cell?.id) {
      await window.daemon.terminal.kill(cell.id)
      if (activeProjectId) {
        useUIStore.getState().removeTerminal(activeProjectId, cell.id)
      }
    }
    setCells((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], id: null, visible: false }
      return next
    })
  }, [cells, activeProjectId, setCells])

  const handleReopen = useCallback((index: number) => {
    setCells((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], visible: true }
      return next
    })
  }, [setCells])

  const handleAddCell = useCallback(() => {
    const totalCells = cells.length
    setCells((prev) => [
      ...prev,
      { id: null, label: `Agent ${totalCells + 1}`, visible: true },
    ])
  }, [cells.length, setCells])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragSource(index)
    e.dataTransfer.effectAllowed = 'move'
    const ghost = document.createElement('div')
    ghost.style.opacity = '0'
    ghost.style.position = 'absolute'
    ghost.style.top = '-9999px'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== index) setDragOver(index)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    const current = e.currentTarget as Node
    if (!related || !current.contains(related)) {
      setDragOver(null)
    }
  }

  const handleDrop = (targetIndex: number) => {
    if (dragSource === null || dragSource === targetIndex) {
      setDragSource(null)
      setDragOver(null)
      return
    }
    setCells((prev) => {
      const next = [...prev]
      const temp = next[dragSource]
      next[dragSource] = next[targetIndex]
      next[targetIndex] = temp
      return next
    })
    setDragSource(null)
    setDragOver(null)
  }

  const handleDragEnd = () => {
    setDragSource(null)
    setDragOver(null)
  }

  const handleRemovePage = useCallback((pageIndex: number) => {
    const pageCells = pages[pageIndex]
    if (pageCells) {
      for (const cell of pageCells) {
        if (cell.id && activeProjectId) {
          window.daemon.terminal.kill(cell.id)
          useUIStore.getState().removeTerminal(activeProjectId, cell.id)
        }
      }
    }
    removeGrindPage(pageIndex)
  }, [pages, activeProjectId, removeGrindPage])

  const visibleCells = cells.filter((c) => c.visible)
  const closedCells = cells.map((c, i) => ({ ...c, originalIndex: i })).filter((c) => !c.visible)
  const gridCols = visibleCells.length <= 1 ? 1 : visibleCells.length <= 4 ? 2 : 3
  const gridRows = Math.ceil(visibleCells.length / gridCols)

  return (
    <div className="agent-grid-wrapper">
      <div className="agent-grid-page-bar">
        <div className="agent-grid-page-tabs">
          {Array.from({ length: grindPageCount }).map((_, i) => (
            <button
              key={i}
              className={`agent-grid-page-tab ${activeGrindPage === i ? 'active' : ''}`}
              onClick={() => setActiveGrindPage(i)}
            >
              <span>Page {i + 1}</span>
              {grindPageCount > 1 && (
                <span
                  className="agent-grid-page-tab-close"
                  onClick={(e) => { e.stopPropagation(); handleRemovePage(i) }}
                >
                  &times;
                </span>
              )}
            </button>
          ))}
          <button className="agent-grid-page-add" onClick={addGrindPage} title="Add page">
            +
          </button>
        </div>
        <button className="agent-grid-add-cell" onClick={handleAddCell} title="Add agent cell">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Cell
        </button>
      </div>

      <div
        className="agent-grid"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        }}
      >
        {cells.map((cell, i) => {
          if (!cell.visible) return null
          const isDragTarget = dragOver === i && dragSource !== i
          return (
            <div
              key={i}
              className={`agent-grid-cell ${isDragTarget ? 'drag-over' : ''} ${dragSource === i ? 'dragging' : ''}`}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(i)}
            >
              <div
                className="agent-grid-cell-header"
                draggable
                onDragStart={(e) => handleDragStart(e, i)}
                onDragEnd={handleDragEnd}
              >
                <span className={`agent-grid-cell-dot ${cell.id ? '' : 'idle'}`} />
                <span className="agent-grid-cell-label">{cell.label}</span>
                {cell.id && (
                  <span className="agent-grid-cell-close" onClick={() => handleClose(i)} title="Close this agent">
                    &times;
                  </span>
                )}
              </div>
              <div className="agent-grid-cell-body">
                {cell.id ? (
                  <AgentGridTerminal id={cell.id} />
                ) : (
                  <div className="agent-grid-cell-activate" onClick={() => activateCell(i)}>
                    <div className="activate-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <span className="activate-label">Activate</span>
                    <span className="activate-hint">Launch an AI coding agent</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {closedCells.length > 0 && (
        <div className="agent-grid-reopen">
          {closedCells.map((cell) => (
            <button
              key={cell.originalIndex}
              className="agent-grid-reopen-btn"
              onClick={() => handleReopen(cell.originalIndex)}
            >
              + {cell.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentGridTerminal({ id }: { id: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const doFit = useCallback(() => {
    const fit = fitRef.current
    const term = xtermRef.current
    if (!fit || !term || !containerRef.current) return
    const { clientWidth, clientHeight } = containerRef.current
    if (clientWidth === 0 || clientHeight === 0) return
    try {
      fit.fit()
      window.daemon.terminal.resize(id, term.cols, term.rows)
    } catch {}
  }, [id])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#0a0a0a',
        foreground: '#ebebeb',
        cursor: '#ebebeb',
        selectionBackground: '#2a2a2a',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    setTimeout(() => doFit(), 150)

    term.onData((data) => {
      window.daemon.terminal.write(id, data)
    })

    const cleanupData = window.daemon.terminal.onData((payload) => {
      if (payload.id === id) term.write(payload.data)
    })

    const cleanupExit = window.daemon.terminal.onExit((payload) => {
      if (payload.id === id) term.write('\r\n[Process exited]\r\n')
    })

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(doFit, 60)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      cleanupData()
      cleanupExit()
      term.dispose()
    }
  }, [id, doFit])

  return <div ref={containerRef} className="agent-grid-terminal" />
}
