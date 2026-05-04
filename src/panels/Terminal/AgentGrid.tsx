import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useNotificationsStore } from '../../store/notifications'

type ProviderId = 'claude' | 'codex'

// Stable sentinel so the selector returns the same reference when no pages exist,
// avoiding a useSyncExternalStore infinite re-render loop.
const EMPTY_PAGES: import('../../store/ui').GridCell[][] = []

export function AgentGrid() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const grindPageCount = useUIStore((s) => s.grindPageCount)
  const activeGrindPage = useUIStore((s) => s.activeGrindPage)
  const setActiveGrindPage = useUIStore((s) => s.setActiveGrindPage)
  const addGrindPage = useUIStore((s) => s.addGrindPage)
  const removeGrindPage = useUIStore((s) => s.removeGrindPage)
  const initGrindPages = useUIStore((s) => s.initGrindPages)
  const setGrindCell = useUIStore((s) => s.setGrindCell)
  const addGrindCellToPage = useUIStore((s) => s.addGrindCellToPage)
  const setGrindPageCells = useUIStore((s) => s.setGrindPageCells)
  const removeGrindPageCells = useUIStore((s) => s.removeGrindPageCells)

  const pages = useUIStore((s) => s.grindPages[activeProjectId ?? '']) ?? EMPTY_PAGES

  const [dragSource, setDragSource] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [cellError, setCellError] = useState<Record<number, { code: string; message: string }>>({})

  // Initialize grind pages for this project on mount
  useEffect(() => {
    if (activeProjectId) {
      initGrindPages(activeProjectId)
    }
  }, [activeProjectId, initGrindPages])

  // Sync pages array length with store page count
  useEffect(() => {
    if (!activeProjectId) return
    const currentPages = useUIStore.getState().grindPages[activeProjectId]
    if (!currentPages) return

    if (currentPages.length < grindPageCount) {
      for (let i = currentPages.length; i < grindPageCount; i++) {
        const cellNum = i * 4
        setGrindPageCells(activeProjectId, i, [
          { id: null, label: `Agent ${cellNum + 1}`, visible: true },
          { id: null, label: `Agent ${cellNum + 2}`, visible: true },
          { id: null, label: `Agent ${cellNum + 3}`, visible: true },
          { id: null, label: `Agent ${cellNum + 4}`, visible: true },
        ])
      }
    }
  }, [grindPageCount, activeProjectId, setGrindPageCells])

  const cells = pages[activeGrindPage] ?? []

  const activateCell = useCallback(async (index: number, providerOverride?: ProviderId) => {
    if (!activeProjectId) return
    const currentPages = useUIStore.getState().grindPages[activeProjectId]
    if (!currentPages || !currentPages[activeGrindPage]) return
    const currentCells = currentPages[activeGrindPage]
    const cell = currentCells[index]
    if (!cell) return

    const providerId = providerOverride ?? cell.providerId
    if (!providerId) return // empty cell shows picker inline

    setCellError((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })

    let res: Awaited<ReturnType<typeof window.daemon.terminal.spawnProvider>>
    try {
      res = await window.daemon.terminal.spawnProvider({
        providerId,
        projectId: activeProjectId,
        cwd: activeProjectPath ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to launch service'
      setCellError((prev) => ({ ...prev, [index]: { code: 'IPC_ERROR', message } }))
      return
    }

    if (res.ok && res.data) {
      const termId = res.data.id
      const label = providerId === 'claude' ? 'Claude' : 'Codex'
      addTerminal(activeProjectId, termId, label)
      setGrindCell(activeProjectId, activeGrindPage, index, {
        id: termId,
        providerId,
        label,
      })
    } else {
      const raw = res.error ?? 'Failed to launch service'
      const m = raw.match(/^([A-Z_]+):\s*(.*)$/)
      const code = m ? m[1] : 'UNKNOWN'
      const message = m ? m[2] : raw
      setCellError((prev) => ({ ...prev, [index]: { code, message } }))
    }
  }, [activeProjectId, activeProjectPath, addTerminal, activeGrindPage, setGrindCell])

  const handlePickService = useCallback((cellIndex: number, providerId: ProviderId) => {
    if (!activeProjectId) return
    setGrindCell(activeProjectId, activeGrindPage, cellIndex, { providerId })
    activateCell(cellIndex, providerId)
  }, [activeProjectId, activeGrindPage, setGrindCell, activateCell])

  const handleClose = useCallback(async (index: number) => {
    if (!activeProjectId) return
    const cell = cells[index]
    if (cell?.id) {
      await window.daemon.terminal.kill(cell.id)
      useUIStore.getState().removeTerminal(activeProjectId, cell.id)
    }
    setGrindCell(activeProjectId, activeGrindPage, index, { id: null, visible: false })
  }, [cells, activeProjectId, activeGrindPage, setGrindCell])

  const handleReopen = useCallback((index: number) => {
    if (!activeProjectId) return
    setGrindCell(activeProjectId, activeGrindPage, index, { visible: true })
  }, [activeProjectId, activeGrindPage, setGrindCell])

  const handleAddCell = useCallback(() => {
    if (!activeProjectId) return
    addGrindCellToPage(activeProjectId, activeGrindPage)
  }, [activeProjectId, activeGrindPage, addGrindCellToPage])

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
    if (!activeProjectId || dragSource === null || dragSource === targetIndex) {
      setDragSource(null)
      setDragOver(null)
      return
    }
    const swapped = [...cells]
    const temp = swapped[dragSource]
    swapped[dragSource] = swapped[targetIndex]
    swapped[targetIndex] = temp
    setGrindPageCells(activeProjectId, activeGrindPage, swapped)
    setDragSource(null)
    setDragOver(null)
  }

  const handleDragEnd = () => {
    setDragSource(null)
    setDragOver(null)
  }

  const handleRemovePage = useCallback(async (pageIndex: number) => {
    if (!activeProjectId) return
    const pageCells = pages[pageIndex]
    if (pageCells) {
      const killPromises: Promise<unknown>[] = []
      for (const cell of pageCells) {
        if (cell.id) {
          killPromises.push(window.daemon.terminal.kill(cell.id))
          useUIStore.getState().removeTerminal(activeProjectId, cell.id)
        }
      }
      await Promise.all(killPromises)
    }
    removeGrindPageCells(activeProjectId, pageIndex)
    removeGrindPage(pageIndex)
  }, [pages, activeProjectId, removeGrindPage, removeGrindPageCells])

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
                  <div className="agent-grid-cell-activate">
                    {cellError[i] ? (
                      <CellErrorView
                        error={cellError[i]}
                        onRetry={() => activateCell(i)}
                        onPick={() => {
                          setGrindCell(activeProjectId!, activeGrindPage, i, { providerId: null })
                          setCellError((prev) => { const n = { ...prev }; delete n[i]; return n })
                        }}
                      />
                    ) : cells[i]?.providerId ? (
                      <div
                        onClick={() => activateCell(i)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      >
                        <img
                          src={cells[i].providerId === 'claude' ? './claude-logo.png' : './codex-logo.png'}
                          alt={cells[i].providerId ?? ''}
                          style={{ width: 36, height: 36 }}
                        />
                        <span className="activate-label">
                          {cells[i].providerId === 'claude' ? 'Claude' : 'Codex'}
                        </span>
                        <span className="activate-hint">Click to launch</span>
                      </div>
                    ) : (
                      <ServicePicker
                        onPick={(providerId) => handlePickService(i, providerId)}
                      />
                    )}
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

function CellErrorView({
  error,
  onRetry,
  onPick,
}: {
  error: { code: string; message: string }
  onRetry: () => void
  onPick: () => void
}) {
  const titleByCode: Record<string, string> = {
    NO_PROVIDER_AUTH: 'Not signed in',
    NOT_AUTHENTICATED: 'Provider unauthenticated',
    CLI_NOT_INSTALLED: 'CLI missing',
    NO_AGENT: 'No agents yet',
    UNKNOWN: 'Failed to launch',
  }
  const title = titleByCode[error.code] ?? error.code.replace(/_/g, ' ')

  // Define CTA actions per error code
  let cta = 'Retry'
  let action: () => void = onRetry

  if (error.code === 'NO_PROVIDER_AUTH') {
    cta = 'Open Settings'
    action = () => useUIStore.getState().openWorkspaceTool('settings')
  } else if (error.code === 'NOT_AUTHENTICATED') {
    cta = 'Open Settings'
    action = () => useUIStore.getState().openWorkspaceTool('settings')
  } else if (error.code === 'CLI_NOT_INSTALLED') {
    cta = 'Install CLI'
    action = async () => {
      try {
        const res = await window.daemon.codex.installCli()
        if (res.ok) {
          useNotificationsStore.getState().pushSuccess('Codex CLI installed.', 'Codex')
          onRetry()
        } else {
          useNotificationsStore.getState().pushError(res.error ?? 'Install failed', 'Codex')
        }
      } catch (err) {
        useNotificationsStore.getState().pushError(err, 'Codex')
      }
    }
  } else if (error.code === 'NO_AGENT') {
    cta = 'Pick a service'
    action = onPick
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 12, textAlign: 'center' }}>
      <span className="activate-label" style={{ color: 'var(--red)' }}>{title}</span>
      <span className="activate-hint" style={{ maxWidth: 240 }}>{error.message}</span>
      <button
        onClick={(e) => { e.stopPropagation(); action() }}
        style={{
          marginTop: 4, padding: '4px 10px', fontSize: 11,
          background: 'var(--s3)', color: 'var(--t1)',
          border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
        }}
      >
        {cta}
      </button>
    </div>
  )
}

function ServicePicker({
  onPick,
  onCancel,
}: {
  onPick: (providerId: ProviderId) => void
  onCancel?: () => void
}) {
  const services: { id: ProviderId; label: string; logo: string }[] = [
    { id: 'claude', label: 'Claude', logo: './claude-logo.png' },
    { id: 'codex', label: 'Codex', logo: './codex-logo.png' },
  ]

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: 16, width: '100%', maxWidth: 280, alignItems: 'center',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--t4)', textTransform: 'uppercase', letterSpacing: 1 }}>
        Pick Service
      </div>
      <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'center' }}>
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            className="service-pick-btn"
            style={{
              flex: 1, maxWidth: 110,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '14px 10px',
              background: 'var(--s2)',
              color: 'var(--t1)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--s3)'
              e.currentTarget.style.borderColor = 'var(--s5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--s2)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <img src={s.logo} alt={s.label} style={{ width: 40, height: 40, objectFit: 'contain' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</span>
          </button>
        ))}
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          style={{
            marginTop: 4, padding: '4px 12px', fontSize: 10,
            background: 'transparent', color: 'var(--t3)',
            border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
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
      // xterm.js API requires hex values -- keep in sync with tokens.css
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

    // Defer initial fit to after CSS layout settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doFit()
      })
    })

    term.onData((data) => {
      window.daemon.terminal.write(id, data)
    })

    const cleanupData = window.daemon.terminal.onData((payload) => {
      if (payload.id === id) term.write(payload.data)
    })

    const cleanupExit = window.daemon.terminal.onExit((payload) => {
      if (payload.id === id) term.write('\r\n[Process exited]\r\n')
    })

    // Tell main process the renderer is attached so it flushes buffered pty output
    window.daemon.terminal.ready(id)

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(doFit, 60)
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
      cleanupData()
      cleanupExit()
      try { term.dispose() } catch {}
    }
  }, [id, doFit])

  return <div ref={containerRef} className="agent-grid-terminal" />
}
