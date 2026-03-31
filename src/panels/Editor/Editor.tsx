import { useRef, useCallback, useState, useEffect } from 'react'
import MonacoEditor, { type OnMount, type BeforeMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useUIStore } from '../../store/ui'
import { AskClaudeWidget } from '../../components/AskClaudeWidget'
import './Editor.css'

// Wire up Monaco workers for Vite — required for syntax highlighting, validation, etc.
(globalThis as Record<string, unknown>).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

// Use local ESM bundle — no CDN, no AMD loader
loader.config({ monaco })

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', html: 'html', md: 'markdown', py: 'python',
  rs: 'rust', toml: 'toml', yaml: 'yaml', yml: 'yaml', sh: 'shell',
  sql: 'sql', xml: 'xml', svg: 'xml', env: 'plaintext', txt: 'plaintext',
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_MAP[ext] ?? 'plaintext'
}

// Persist view state (cursor, scroll, selections) per file path
const viewStateCache = new Map<string, monaco.editor.ICodeEditorViewState>()

let themeIsDefined = false

export function EditorPanel() {
  const {
    openFiles,
    activeProjectId,
    activeFilePathByProject,
    setActiveFile,
    closeFile,
    updateFileContent,
    markFileSaved,
  } = useUIStore()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const prevFilePathRef = useRef<string | null>(null)
  const activeFilePathRef = useRef<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [askClaudeState, setAskClaudeState] = useState<{
    visible: boolean
    lineNumber: number
    lineContent: string
    position: { top: number; left: number }
  } | null>(null)

  const projectOpenFiles = openFiles.filter((f) => f.projectId === activeProjectId)
  const activeFilePath = activeProjectId ? activeFilePathByProject[activeProjectId] ?? null : null
  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  // Keep ref in sync so the onChange callback always has current path
  activeFilePathRef.current = activeFilePath

  // Swap Monaco model when the active file changes — no remount
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeFile) return

    // Save view state of the file we're leaving
    const prevPath = prevFilePathRef.current
    if (prevPath && prevPath !== activeFile.path) {
      const viewState = editor.saveViewState()
      if (viewState) viewStateCache.set(prevPath, viewState)
    }

    const uri = monaco.Uri.parse(`file://${activeFile.path}`)
    let model = monaco.editor.getModel(uri)

    if (!model) {
      model = monaco.editor.createModel(
        activeFile.content,
        getLanguage(activeFile.path),
        uri,
      )
    }

    if (editor.getModel() !== model) {
      editor.setModel(model)
    }

    // Restore view state (cursor, scroll, selections) if we had one
    const savedViewState = viewStateCache.get(activeFile.path)
    if (savedViewState) {
      editor.restoreViewState(savedViewState)
    }

    editor.focus()
    prevFilePathRef.current = activeFile.path
  }, [activeFile?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external content changes into existing models
  // (e.g. file watcher updated content while tab was in background)
  useEffect(() => {
    for (const file of openFiles) {
      const uri = monaco.Uri.parse(`file://${file.path}`)
      const model = monaco.editor.getModel(uri)
      if (model && model.getValue() !== file.content && !file.isDirty) {
        model.setValue(file.content)
      }
    }
  }, [openFiles])

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    if (themeIsDefined) return
    monacoInstance.editor.defineTheme('daemon-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#090909',
        'editor.foreground': '#ebebeb',
        'editorLineNumber.foreground': '#3d3d3d',
        'editorLineNumber.activeForeground': '#7a7a7a',
        'editor.selectionBackground': '#2a2a2a',
        'editor.lineHighlightBackground': '#101010',
        'editorCursor.foreground': '#ebebeb',
        'editorWidget.background': '#101010',
        'editorWidget.border': '#2a2a2a',
        'input.background': '#151515',
        'input.border': '#2a2a2a',
        'dropdown.background': '#101010',
        'list.hoverBackground': '#1a1a1a',
        'list.activeSelectionBackground': '#222222',
      },
    })
    themeIsDefined = true
  }

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor

    // Set initial model if we already have an active file
    if (activeFile) {
      const uri = monaco.Uri.parse(`file://${activeFile.path}`)
      let model = monaco.editor.getModel(uri)
      if (!model) {
        model = monaco.editor.createModel(
          activeFile.content,
          getLanguage(activeFile.path),
          uri,
        )
      }
      editor.setModel(model)
      prevFilePathRef.current = activeFile.path
    }

    // Handle glyph margin clicks for "Ask Claude"
    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position?.lineNumber
        if (lineNumber) {
          const model = editor.getModel()
          const lineContent = model?.getLineContent(lineNumber) ?? ''
          const editorDomNode = editor.getDomNode()
          if (editorDomNode) {
            const lineTop = editor.getTopForLineNumber(lineNumber)
            const scrollTop = editor.getScrollTop()
            const editorRect = editorDomNode.getBoundingClientRect()
            setAskClaudeState({
              visible: true,
              lineNumber,
              lineContent,
              position: {
                top: editorRect.top + lineTop - scrollTop + 10,
                left: editorRect.left + 60,
              },
            })
          }
        }
      }
    })

    // Ctrl+S / Cmd+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const state = useUIStore.getState()
      const projectId = state.activeProjectId
      const activePath = projectId ? state.activeFilePathByProject[projectId] : null
      const file = state.openFiles.find((f) => f.projectId === projectId && f.path === activePath)
      if (!file) return
      const res = await window.daemon.fs.writeFile(file.path, file.content)
      if (res.ok) {
        markFileSaved(file.path)
        setSavedFlash(file.path)
        setTimeout(() => setSavedFlash(null), 600)
      }
    })
  }

  const handleChange = useCallback((value: string | undefined) => {
    const currentPath = activeFilePathRef.current
    if (currentPath && value !== undefined) {
      updateFileContent(currentPath, value)
    }
  }, [updateFileContent])

  // Dispose models for closed files to avoid memory leaks
  const handleCloseFile = useCallback((projectId: string, path: string) => {
    const file = openFiles.find((f) => f.projectId === projectId && f.path === path)
    if (file?.isDirty && !window.confirm(`Discard unsaved changes to ${file.name}?`)) return

    // Save view state before disposing so it persists if reopened
    const editor = editorRef.current
    if (editor && activeFilePath === path) {
      const viewState = editor.saveViewState()
      if (viewState) viewStateCache.set(path, viewState)
    }

    // Dispose the Monaco model
    const uri = monaco.Uri.parse(`file://${path}`)
    const model = monaco.editor.getModel(uri)
    if (model) model.dispose()

    // Clear cached view state
    viewStateCache.delete(path)

    closeFile(projectId, path)
  }, [openFiles, closeFile, activeFilePath])

  if (!activeProjectId || projectOpenFiles.length === 0) {
    return (
      <div className="editor-empty">
        <span className="editor-empty-title">DAEMON</span>
        <span className="editor-empty-sub">
          {activeProjectId ? 'Open a file from the explorer' : 'Select a project'}
        </span>
      </div>
    )
  }

  return (
    <div className="editor-panel">
      <div className="editor-tabs">
        {projectOpenFiles.map((file) => (
          <button
            key={file.path}
            className={`editor-tab ${activeFilePath === file.path ? 'active' : ''} ${savedFlash === file.path ? 'saved' : ''}`}
            onClick={() => setActiveFile(file.projectId, file.path)}
          >
            <span className="editor-tab-name">
              {file.isDirty ? '\u25CF ' : ''}{file.name}
            </span>
            <span
              className="editor-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                handleCloseFile(file.projectId, file.path)
              }}
            >
              &times;
            </span>
          </button>
        ))}
      </div>
      <div className="editor-content">
        <MonacoEditor
          theme="daemon-dark"
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          onChange={handleChange}
          options={{
            fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            padding: { top: 8 },
            renderLineHighlight: 'line',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
            wordWrap: 'off',
            tabSize: 2,
            glyphMargin: true,
          }}
        />
      </div>
      {askClaudeState?.visible && activeFile && (
        <AskClaudeWidget
          lineNumber={askClaudeState.lineNumber}
          lineContent={askClaudeState.lineContent}
          filePath={activeFile.path}
          position={askClaudeState.position}
          onClose={() => setAskClaudeState(null)}
        />
      )}
    </div>
  )
}
