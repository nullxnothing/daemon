import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Plus, X } from '@phosphor-icons/react'
import { useLiteWorkbenchStore } from './liteWorkbenchStore'
import styles from './LiteWorkbench.module.css'

function TerminalViewport({ id, isVisible }: { id: string; isVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const terminal = new Terminal({ convertEol: true, cursorBlink: true, fontSize: 12, screenReaderMode: true, theme: { background: '#0c0e0d', foreground: '#d7d8d4' } })
    const fit = new FitAddon()
    terminalRef.current = terminal
    fitRef.current = fit
    terminal.loadAddon(fit)
    terminal.open(container)
    fit.fit()
    window.daemon.terminal.ready(id, terminal.cols, terminal.rows)
    const input = terminal.onData((data) => window.daemon.terminal.write(id, data))
    const output = window.daemon.terminal.onData((payload) => { if (payload.id === id) terminal.write(payload.data) })
    let resizeFrame = 0
    let lastSize = `${terminal.cols}x${terminal.rows}`
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        fit.fit()
        const nextSize = `${terminal.cols}x${terminal.rows}`
        if (nextSize === lastSize) return
        lastSize = nextSize
        window.daemon.terminal.resize(id, terminal.cols, terminal.rows)
      })
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(resizeFrame)
      output()
      input.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (!isVisible) return
    const frame = requestAnimationFrame(() => {
      fitRef.current?.fit()
      const terminal = terminalRef.current
      if (terminal) {
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
        window.daemon.terminal.resize(id, terminal.cols, terminal.rows)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [isVisible])

  return <div ref={containerRef} className={styles.terminalViewport} aria-label="Interactive project terminal" />
}

export function LiteTerminal({ isVisible = true }: { isVisible?: boolean }) {
  const project = useLiteWorkbenchStore((state) => state.activeProject)
  const terminalIds = useLiteWorkbenchStore((state) => state.terminalIds)
  const activeTerminalId = useLiteWorkbenchStore((state) => state.activeTerminalId)
  const addTerminal = useLiteWorkbenchStore((state) => state.addTerminal)
  const removeTerminal = useLiteWorkbenchStore((state) => state.removeTerminal)
  const setActiveTerminal = useLiteWorkbenchStore((state) => state.setActiveTerminal)
  const [terminalError, setTerminalError] = useState<string | null>(null)
  const [exitCodes, setExitCodes] = useState<Record<string, number>>({})

  useEffect(() => window.daemon.terminal.onExit(({ id, exitCode }) => setExitCodes((current) => ({ ...current, [id]: exitCode }))), [])

  const createTerminal = async (startupCommand?: string) => {
    if (!project) return
    setTerminalError(null)
    const response = await window.daemon.terminal.create({ cwd: project.path, startupCommand, userInitiated: !startupCommand })
    if (response.ok && response.data) addTerminal(response.data.id)
    else setTerminalError(response.error ?? 'Could not create the project terminal.')
  }

  const closeTerminal = async (id: string) => {
    const response = await window.daemon.terminal.kill(id)
    if (!response.ok) {
      setTerminalError(response.error ?? 'Could not close the terminal.')
      return
    }
    removeTerminal(id)
    setExitCodes((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  return (
    <section className={styles.terminal} aria-label="Terminal">
      <header className={styles.terminalHeader}>
        <span>Terminal</span>
        <div className={styles.terminalTabs}>
          {terminalIds.map((id, index) => (
            <div key={id} className={styles.terminalTabGroup}>
              <button type="button" className={id === activeTerminalId ? styles.terminalTabActive : styles.terminalTab} onClick={() => setActiveTerminal(id)}>pwsh {index + 1}{id in exitCodes ? ` · exited ${exitCodes[id]}` : ''}</button>
              <button type="button" className={styles.tabClose} aria-label={`Close terminal ${index + 1}`} onClick={() => void closeTerminal(id)}><X size={10} /></button>
            </div>
          ))}
          <button type="button" className={styles.iconButton} aria-label="New terminal" disabled={!project} onClick={() => void createTerminal()}><Plus size={13} /></button>
        </div>
      </header>
      {terminalError ? <div className={styles.errorState} role="alert">{terminalError}</div> : null}
      {activeTerminalId && activeTerminalId in exitCodes ? <div className={exitCodes[activeTerminalId] === 0 ? styles.terminalStatus : styles.errorState} role={exitCodes[activeTerminalId] === 0 ? 'status' : 'alert'}>Exited with code {exitCodes[activeTerminalId]}</div> : null}
      {terminalIds.map((id) => (
        <div key={id} className={id === activeTerminalId ? styles.terminalPaneActive : styles.terminalPaneHidden}>
          <TerminalViewport id={id} isVisible={isVisible && id === activeTerminalId} />
        </div>
      ))}
      {terminalIds.length === 0 ? <div className={styles.terminalEmpty}>{project ? 'Open a project terminal.' : 'Open a project first.'}</div> : null}
    </section>
  )
}
