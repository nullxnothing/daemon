import { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useUIStore } from '../../store/ui'
import './Terminal.css'

export function TerminalPanel() {
  const { terminals, addTerminal, removeTerminal, setActiveTerminal } = useUIStore()
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeTerminalId = useUIStore((s) =>
    s.activeProjectId ? s.activeTerminalIdByProject[s.activeProjectId] ?? null : null,
  )
  const visibleTerminals = terminals.filter((tab) => tab.projectId === activeProjectId)

  const handleNewTerminal = useCallback(async () => {
    if (!activeProjectId) return
    const res = await window.daemon.terminal.create({ cwd: activeProjectPath ?? undefined })
    if (res.ok && res.data) {
      addTerminal(activeProjectId, res.data.id, 'Terminal')
    }
  }, [activeProjectId, activeProjectPath, addTerminal])

  const handleCloseTerminal = useCallback(async (id: string) => {
    if (!activeProjectId) return
    await window.daemon.terminal.kill(id)
    removeTerminal(activeProjectId, id)
  }, [activeProjectId, removeTerminal])

  useEffect(() => {
    if (activeProjectId && visibleTerminals.length === 0) {
      handleNewTerminal()
    }
  }, [activeProjectId, visibleTerminals.length, handleNewTerminal])

  return (
    <div className="terminal-panel">
      <div className="terminal-tabs">
        {visibleTerminals.map((tab) => (
          <button
            key={tab.id}
            className={`terminal-tab ${activeTerminalId === tab.id ? 'active' : ''}`}
            onClick={() => activeProjectId && setActiveTerminal(activeProjectId, tab.id)}
          >
            <span className={`terminal-tab-dot ${tab.agentId ? 'agent' : ''}`} />
            <span>{tab.label}</span>
            <span
              className="terminal-tab-close"
              onClick={(e) => { e.stopPropagation(); handleCloseTerminal(tab.id) }}
            >
              &times;
            </span>
          </button>
        ))}
        <button className="terminal-tab-add" onClick={handleNewTerminal}>+</button>
      </div>
      <div className="terminal-views">
        {visibleTerminals.map((tab) => (
          <TerminalView key={tab.id} id={tab.id} isVisible={tab.id === activeTerminalId} />
        ))}
      </div>
    </div>
  )
}

function TerminalView({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragDepthRef = useRef(0)

  const doFit = useCallback(() => {
    const fit = fitRef.current
    const term = xtermRef.current
    if (!fit || !term) return
    if (!containerRef.current) return

    const { clientWidth, clientHeight } = containerRef.current
    if (clientWidth === 0 || clientHeight === 0) return

    try {
      fit.fit()
      window.daemon.terminal.resize(id, term.cols, term.rows)
    } catch {}
  }, [id])

  const debouncedFit = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(doFit, 60)
  }, [doFit])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#090909',
        foreground: '#ebebeb',
        cursor: '#ebebeb',
        selectionBackground: '#2a2a2a',
        black: '#090909',
        brightBlack: '#3d3d3d',
        red: '#8c4a4a',
        brightRed: '#a65c5c',
        green: '#4a8c62',
        brightGreen: '#5ca674',
        yellow: '#8c7a4a',
        brightYellow: '#a6925c',
        blue: '#4a6a8c',
        brightBlue: '#5c82a6',
        magenta: '#7a4a8c',
        brightMagenta: '#925ca6',
        cyan: '#4a8c8c',
        brightCyan: '#5ca6a6',
        white: '#ebebeb',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    // Fit after layout settles
    setTimeout(() => {
      doFit()
      term.focus()
    }, 150)

    // Keystrokes -> PTY
    term.onData((data) => {
      window.daemon.terminal.write(id, data)
    })

    // PTY -> xterm
    const cleanupData = window.daemon.terminal.onData((payload) => {
      if (payload.id === id) {
        term.write(payload.data)
      }
    })

    const cleanupExit = window.daemon.terminal.onExit((payload) => {
      if (payload.id === id) {
        term.write('\r\n[Process exited]\r\n')
      }
    })

    // Resize observer with debounce
    const resizeObserver = new ResizeObserver(debouncedFit)
    resizeObserver.observe(containerRef.current)

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeObserver.disconnect()
      cleanupData()
      cleanupExit()
      term.dispose()
    }
  }, [id, doFit, debouncedFit])

  // Re-fit + focus when tab becomes visible
  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          doFit()
          xtermRef.current?.focus()
        }, 50)
      })
    }
  }, [isVisible, doFit])

  // Click to focus
  const handleClick = () => {
    xtermRef.current?.focus()
  }

  const setDragActive = (active: boolean) => {
    if (!containerRef.current) return
    containerRef.current.classList.toggle('drag-active', active)
  }

  const quotePath = (value: string) => {
    const escaped = value.replace(/"/g, '\\"')
    return `"${escaped}"`
  }

  const writeDroppedPaths = (paths: string[]) => {
    if (paths.length === 0) return
    const payload = paths.map(quotePath).join(' ') + ' '
    window.daemon.terminal.write(id, payload)
    xtermRef.current?.focus()
  }

  const extractDroppedPaths = (event: React.DragEvent<HTMLDivElement>) => {
    const filePaths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value))

    if (filePaths.length > 0) return filePaths

    const text = event.dataTransfer.getData('text/plain').trim()
    return text ? [text] : []
  }

  return (
    <div
      ref={containerRef}
      className="terminal-view"
      style={{ visibility: isVisible ? 'visible' : 'hidden' }}
      onClick={handleClick}
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepthRef.current += 1
        setDragActive(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDragActive(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepthRef.current = 0
        setDragActive(false)
        writeDroppedPaths(extractDroppedPaths(e))
      }}
    />
  )
}
