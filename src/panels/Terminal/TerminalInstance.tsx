import { useEffect, useRef, useCallback, useState, memo } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalInput } from './useTerminalInput'
import { HintsOverlay, HistorySearchOverlay } from './TerminalOverlays'

const XTERM_THEME = {
  background: '#0a0a0a',
  foreground: '#ebebeb',
  cursor: '#ebebeb',
  selectionBackground: '#2a2a2a',
  black: '#0a0a0a',
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
}

interface TerminalInstanceProps {
  id: string
  isVisible: boolean
}

export const TerminalInstance = memo(function TerminalInstance({ id, isVisible }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragDepthRef = useRef(0)
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false, x: 0, y: 0,
  })

  const input = useTerminalInput(id)

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

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev))
  }, [])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ isOpen: true, x: event.clientX - rect.left, y: event.clientY - rect.top })
  }, [])

  const handlePasteFromContextMenu = useCallback(async () => {
    await window.daemon.terminal.pasteFromClipboard(id)
    closeContextMenu()
    xtermRef.current?.focus()
  }, [closeContextMenu, id])

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
      theme: XTERM_THEME,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    // Intercept app-level shortcuts before xterm consumes them.
    // Returning false tells xterm to suppress the event and not write to pty.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return true
      const key = e.key.toLowerCase()
      // Ctrl+P / Ctrl+Shift+P — file search / command palette
      if (key === 'p') return false
      // Ctrl+Shift+A — agent launcher
      if (e.shiftKey && key === 'a') return false
      // Ctrl+Shift+R — reload
      if (e.shiftKey && key === 'r') return false
      // Ctrl+Shift+G — grind mode
      if (e.shiftKey && key === 'g') return false
      // Ctrl+Shift+B — browser mode
      if (e.shiftKey && key === 'b') return false
      // Ctrl+` — toggle terminal
      if (e.key === '`') return false
      // Ctrl+B — toggle right panel
      if (!e.shiftKey && key === 'b') return false
      // Ctrl+W — close tab
      if (!e.shiftKey && key === 'w') return false
      // Ctrl+, — settings
      if (e.key === ',') return false
      // Ctrl+K — drawer
      if (!e.shiftKey && key === 'k') return false
      return true
    })

    doFit()
    term.focus()

    term.onData((data) => {
      if (!input.handleKeystroke(data)) {
        window.daemon.terminal.write(id, data)
      }
    })

    const cleanupData = window.daemon.terminal.onData((payload) => {
      if (payload.id === id) term.write(payload.data)
    })

    const cleanupExit = window.daemon.terminal.onExit((payload) => {
      if (payload.id === id) term.write('\r\n[Process exited]\r\n')
    })

    const resizeObserver = new ResizeObserver(debouncedFit)
    resizeObserver.observe(containerRef.current)

    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeObserver.disconnect()
      cleanupData()
      cleanupExit()
      // Null refs before dispose so any in-flight doFit/debouncedFit callbacks
      // become no-ops instead of accessing the disposed terminal's render service.
      xtermRef.current = null
      fitRef.current = null
      try {
        term.dispose()
      } catch {
        // Dispose can throw if the terminal was already partially torn down
        // (e.g. xterm viewport accessing renderService.dimensions on null).
      }
    }
  }, [id, doFit, debouncedFit])

  useEffect(() => {
    if (!contextMenu.isOpen) return
    const handlePointerDown = () => closeContextMenu()
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeContextMenu() }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [closeContextMenu, contextMenu.isOpen])

  useEffect(() => {
    if (isVisible) {
      requestAnimationFrame(() => { doFit(); xtermRef.current?.focus() })
    }
  }, [isVisible, doFit])

  const setDragActive = (active: boolean) => {
    containerRef.current?.classList.toggle('drag-active', active)
  }

  const quotePath = (value: string) => `"${value.replace(/"/g, '\\"')}"`

  const writeDroppedPaths = (paths: string[]) => {
    if (paths.length === 0) return
    window.daemon.terminal.write(id, paths.map(quotePath).join(' ') + ' ')
    xtermRef.current?.focus()
  }

  const extractDroppedPaths = (event: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer.files)
    const filePaths: string[] = []
    let hasFolder = false

    for (const file of files) {
      const fp = (file as File & { path?: string }).path
      if (!fp) continue
      filePaths.push(fp)
      // Folders have size 0 and no type in Electron's File API
      if (file.size === 0 && !file.type) hasFolder = true
    }

    // If a folder was dropped, let the parent Terminal panel handle it
    // (creates a new terminal tab at that path)
    if (hasFolder) return []

    if (filePaths.length > 0) return filePaths
    const text = event.dataTransfer.getData('text/plain').trim()
    return text ? [text] : []
  }

  return (
    <div className="terminal-view-wrap">
      <div
        ref={containerRef}
        className="terminal-view"
        style={{ visibility: isVisible ? 'visible' : 'hidden' }}
        onClick={() => xtermRef.current?.focus()}
        onContextMenu={handleContextMenu}
        onDragEnter={(e) => { e.preventDefault(); dragDepthRef.current += 1; setDragActive(true) }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
        onDragLeave={() => { dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (dragDepthRef.current === 0) setDragActive(false) }}
        onDrop={(e) => {
          dragDepthRef.current = 0
          setDragActive(false)
          // Check if any dropped item is a folder (size 0, no type)
          const files = Array.from(e.dataTransfer.files)
          const hasFolder = files.some((f) => f.size === 0 && !f.type)
          if (hasFolder) {
            // Let the parent Terminal panel handle folder drops (creates new terminal tab)
            return
          }
          e.preventDefault()
          writeDroppedPaths(extractDroppedPaths(e))
        }}
      >
        {contextMenu.isOpen && (
          <div
            className="terminal-context-menu"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button className="terminal-context-menu-item" onClick={() => void handlePasteFromContextMenu()}>
              Paste
            </button>
          </div>
        )}
      </div>

      {input.completionHints.length > 0 && !input.historySearchOpen && (
        <HintsOverlay
          hints={input.completionHints}
          onAcceptHint={input.acceptHint}
          onDismiss={input.dismissHints}
        />
      )}

      {input.historySearchOpen && (
        <HistorySearchOverlay
          query={input.historySearchQuery}
          matches={input.historyMatches}
          selectionIndex={input.historySelectionIndex}
          onSelectAndApply={(index) => {
            input.setHistorySelectionIndex(index)
            input.applyHistorySelection()
            input.setHistorySearchOpen(false)
            input.setHistorySearchQuery('')
          }}
        />
      )}
    </div>
  )
})
