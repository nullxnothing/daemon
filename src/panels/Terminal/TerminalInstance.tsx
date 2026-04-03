import { useEffect, useRef, useCallback, useState, memo } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useTerminalInput } from './useTerminalInput'
import { HintsOverlay, HistorySearchOverlay, TerminalSearchOverlay } from './TerminalOverlays'
import { useUIStore } from '../../store/ui'

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

// Matches Unix absolute, Unix relative, Windows absolute, Windows relative paths
// with an optional :line or :line:col suffix. Extension required to reduce false positives.
const FILE_PATH_RE =
  /(?:(?:[A-Za-z]:[\\/]|[\\/])[^\s"'<>|*?\0]+\.\w+|\.{1,2}[\\/][^\s"'<>|*?\0]+\.\w+)(?::\d+(?::\d+)?)?/g

interface TerminalSearchState {
  query: string
  // Matched line indices (into the buffer snapshot taken at search time)
  lines: string[]
  matchPositions: Array<{ lineIndex: number; start: number; end: number }>
  currentIndex: number
}

const EMPTY_SEARCH: TerminalSearchState = {
  query: '',
  lines: [],
  matchPositions: [],
  currentIndex: 0,
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
  const lastCtrlCRef = useRef(0)

  // Keep a live ref to the active project path so link provider callbacks can read
  // the latest value without stale closure issues.
  const activeProjectPathRef = useRef<string | null>(null)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  useEffect(() => {
    activeProjectPathRef.current = activeProjectPath ?? null
  }, [activeProjectPath])

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchState, setSearchState] = useState<TerminalSearchState>(EMPTY_SEARCH)

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

  const handleContextMenu = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const term = xtermRef.current
    const selection = term?.getSelection()

    if (selection) {
      await navigator.clipboard.writeText(selection)
      term?.clearSelection()
    } else {
      await window.daemon.terminal.pasteFromClipboard(id)
    }
    term?.focus()
  }, [id])

  const debouncedFit = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(doFit, 60)
  }, [doFit])

  // --- Buffer search helpers ---

  const readBufferLines = useCallback((): string[] => {
    const term = xtermRef.current
    if (!term) return []
    const buffer = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++) {
      lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    }
    return lines
  }, [])

  const buildSearchState = useCallback((query: string): TerminalSearchState => {
    if (!query) return EMPTY_SEARCH
    const lines = readBufferLines()
    const lower = query.toLowerCase()
    const matchPositions: TerminalSearchState['matchPositions'] = []

    for (let li = 0; li < lines.length; li++) {
      const lineLower = lines[li].toLowerCase()
      let pos = 0
      while (pos < lineLower.length) {
        const idx = lineLower.indexOf(lower, pos)
        if (idx === -1) break
        matchPositions.push({ lineIndex: li, start: idx, end: idx + query.length })
        pos = idx + 1
      }
    }

    return { query, lines, matchPositions, currentIndex: matchPositions.length > 0 ? 0 : -1 }
  }, [readBufferLines])

  const scrollToMatch = useCallback((state: TerminalSearchState, index: number) => {
    const term = xtermRef.current
    if (!term || state.matchPositions.length === 0) return
    const match = state.matchPositions[index]
    if (!match) return
    // xterm scrollToLine scrolls the viewport so the line is visible
    term.scrollToLine(match.lineIndex)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    // Re-run search with existing query when re-opened so results are fresh
    setSearchState((prev) => {
      const next = buildSearchState(prev.query)
      return next
    })
  }, [buildSearchState])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    xtermRef.current?.focus()
  }, [])

  const handleSearchQueryChange = useCallback((q: string) => {
    const next = buildSearchState(q)
    setSearchState(next)
    if (next.matchPositions.length > 0) scrollToMatch(next, 0)
  }, [buildSearchState, scrollToMatch])

  const handleSearchNext = useCallback(() => {
    setSearchState((prev) => {
      if (prev.matchPositions.length === 0) return prev
      const next = (prev.currentIndex + 1) % prev.matchPositions.length
      scrollToMatch(prev, next)
      return { ...prev, currentIndex: next }
    })
  }, [scrollToMatch])

  const handleSearchPrev = useCallback(() => {
    setSearchState((prev) => {
      if (prev.matchPositions.length === 0) return prev
      const next = (prev.currentIndex - 1 + prev.matchPositions.length) % prev.matchPositions.length
      scrollToMatch(prev, next)
      return { ...prev, currentIndex: next }
    })
  }, [scrollToMatch])

  // --- File path click handler ---

  const handleFilePathClick = useCallback(async (rawPath: string) => {
    // Strip trailing :line:col suffix for the fs lookup
    const withoutLineCol = rawPath.replace(/:\d+(?::\d+)?$/, '')

    let resolvedPath = withoutLineCol
    const isRelative = withoutLineCol.startsWith('./') ||
      withoutLineCol.startsWith('../') ||
      withoutLineCol.startsWith('.\\') ||
      withoutLineCol.startsWith('..\\')

    if (isRelative) {
      const base = activeProjectPathRef.current
      if (!base) return
      // Normalize separators then join
      const normalizedBase = base.replace(/\\/g, '/')
      const normalizedRel = withoutLineCol.replace(/\\/g, '/')
      resolvedPath = `${normalizedBase}/${normalizedRel}`
    }

    const projectId = activeProjectId
    if (!projectId) return

    const res = await window.daemon.fs.readFile(resolvedPath)
    if (!res.ok || !res.data) return

    const name = resolvedPath.replace(/\\/g, '/').split('/').pop() ?? resolvedPath
    useUIStore.getState().openFile({
      path: resolvedPath,
      name,
      content: res.data.content,
      projectId,
    })
  }, [activeProjectId])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      theme: XTERM_THEME,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Feature 3: WebLinksAddon with explicit openExternal handler
    term.loadAddon(new WebLinksAddon((_event, url) => {
      window.daemon.shell.openExternal(url)
    }))

    term.open(containerRef.current)
    xtermRef.current = term
    fitRef.current = fitAddon

    // Feature 2: Register file path link provider
    // Uses a closure over handleFilePathClick (stable ref via useCallback + activeProjectId dep).
    // We re-register on each mount — the provider is disposed with the terminal.
    term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const buffer = term.buffer.active
        // xterm link provider uses 1-based line numbers
        const lineIndex = bufferLineNumber - 1
        const line = buffer.getLine(lineIndex)
        if (!line) { callback([]); return }
        const text = line.translateToString(true)

        const links: Array<{ range: { start: { x: number; y: number }; end: { x: number; y: number } }; text: string; activate: (event: MouseEvent, linkText: string) => void }> = []
        FILE_PATH_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = FILE_PATH_RE.exec(text)) !== null) {
          const matchText = m[0]
          const startX = m.index + 1   // xterm columns are 1-based
          const endX = m.index + matchText.length
          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: endX, y: bufferLineNumber },
            },
            text: matchText,
            activate(_event, linkText) {
              handleFilePathClick(linkText)
            },
          })
        }
        callback(links)
      },
    })

    // Intercept app-level shortcuts before xterm consumes them.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return true
      if (e.type !== 'keydown') return true
      const key = e.key.toLowerCase()

      // Ctrl+C — copy if text selected (first press), SIGINT if no selection or double-press
      if (key === 'c' && !e.shiftKey) {
        const hasSelection = !!term.getSelection()
        const now = Date.now()
        const isDoubleTap = now - lastCtrlCRef.current < 500

        if (hasSelection && !isDoubleTap) {
          navigator.clipboard.writeText(term.getSelection())
          term.clearSelection()
          lastCtrlCRef.current = now
          return false
        }
        lastCtrlCRef.current = now
        return true
      }

      // Ctrl+V — paste from clipboard
      if (key === 'v' && !e.shiftKey) {
        navigator.clipboard.readText().then((text) => {
          if (text) window.daemon.terminal.write(id, text)
        })
        return false
      }

      // Feature 1: Ctrl+Shift+F — open terminal output search
      if (e.shiftKey && key === 'f') {
        // Use a microtask to avoid React state update inside xterm event handler
        Promise.resolve().then(() => openSearch())
        return false
      }

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
      xtermRef.current = null
      fitRef.current = null
      try {
        term.dispose()
      } catch {}
    }
  // openSearch and handleFilePathClick are stable (useCallback), safe to include
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doFit, debouncedFit, openSearch, handleFilePathClick])

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
      if (file.size === 0 && !file.type) hasFolder = true
    }

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
          const files = Array.from(e.dataTransfer.files)
          const hasFolder = files.some((f) => f.size === 0 && !f.type)
          if (hasFolder) return
          e.preventDefault()
          writeDroppedPaths(extractDroppedPaths(e))
        }}
      >
        {/* Right-click pastes directly (no context menu) */}
      </div>

      {searchOpen && (
        <TerminalSearchOverlay
          query={searchState.query}
          matchCount={searchState.matchPositions.length}
          currentMatch={searchState.currentIndex}
          onQueryChange={handleSearchQueryChange}
          onNext={handleSearchNext}
          onPrev={handleSearchPrev}
          onClose={closeSearch}
        />
      )}

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
