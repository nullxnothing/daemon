import { useRef, useCallback, useState, useEffect } from 'react'
import MonacoEditor, { type OnMount, type BeforeMount, loader } from '@monaco-editor/react'
import { DiffEditor } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useUIStore } from '../../store/ui'
import { AskClaudeWidget } from '../../components/AskClaudeWidget'
import { PluginErrorBoundary } from '../../components/ErrorBoundary'
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
  const openFiles = useUIStore((s) => s.openFiles)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeFilePathByProject = useUIStore((s) => s.activeFilePathByProject)
  const setActiveFile = useUIStore((s) => s.setActiveFile)
  const closeFile = useUIStore((s) => s.closeFile)
  const updateFileContent = useUIStore((s) => s.updateFileContent)
  const markFileSaved = useUIStore((s) => s.markFileSaved)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const prevFilePathRef = useRef<string | null>(null)
  const activeFilePathRef = useRef<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)
  const [isTidyingMarkdown, setIsTidyingMarkdown] = useState(false)
  const [isApplyingMarkdownTidy, setIsApplyingMarkdownTidy] = useState(false)
  const [tidyError, setTidyError] = useState<string | null>(null)
  const [markdownTidyPreview, setMarkdownTidyPreview] = useState<{ original: string; tidied: string } | null>(null)
  const [askClaudeState, setAskClaudeState] = useState<{
    visible: boolean
    lineNumber: number
    lineContent: string
    position: { top: number; left: number }
  } | null>(null)

  const projectOpenFiles = openFiles.filter((f) => f.projectId === activeProjectId)
  const activeFilePath = activeProjectId ? activeFilePathByProject[activeProjectId] ?? null : null
  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const breadcrumbs = activeFile && activeProjectPath
    ? buildBreadcrumbs(activeProjectPath, activeFile.path)
    : []
  const isActiveFileMarkdown = isMarkdownFile(activeFile?.path)

  // Keep ref in sync so the onChange callback always has current path
  activeFilePathRef.current = activeFilePath

  useEffect(() => {
    setMarkdownTidyPreview(null)
    setTidyError(null)
  }, [activeFile?.path])

  // Swap Monaco model when the active file changes — no remount
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !activeFile) return

    // Guard: if the editor instance has been disposed (e.g. after a project
    // switch that unmounted/remounted the MonacoEditor component), bail out.
    // editorRef.current will be cleared in the mount cleanup below.
    try {
      editor.getModel()
    } catch {
      editorRef.current = null
      return
    }

    // Save view state of the file we're leaving
    const prevPath = prevFilePathRef.current
    if (prevPath && prevPath !== activeFile.path) {
      try {
        const viewState = editor.saveViewState()
        if (viewState) viewStateCache.set(prevPath, viewState)
      } catch {
        // editor was disposed between the guard above and here — give up
        editorRef.current = null
        return
      }
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

    try {
      if (editor.getModel() !== model) {
        editor.setModel(model)
      }

      // Restore view state (cursor, scroll, selections) if we had one
      const savedViewState = viewStateCache.get(activeFile.path)
      if (savedViewState) {
        editor.restoreViewState(savedViewState)
      }

      editor.focus()
    } catch {
      // Editor disposed mid-operation — clear stale ref so the next mount
      // (handleEditorMount) sets a fresh one.
      editorRef.current = null
      return
    }

    prevFilePathRef.current = activeFile.path
  }, [activeFile?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external content changes into existing models
  // (e.g. file watcher updated content while tab was in background)
  // Only non-dirty files are eligible — dirty files have unsaved user edits
  const externalFiles = openFiles.filter((f) => !f.isDirty)
  useEffect(() => {
    for (const file of externalFiles) {
      const uri = monaco.Uri.parse(`file://${file.path}`)
      const model = monaco.editor.getModel(uri)
      if (model && model.getValue() !== file.content) {
        model.setValue(file.content)
      }
    }
  }, [externalFiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    if (themeIsDefined) return
    monacoInstance.editor.defineTheme('daemon-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0a0a',
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

  // Clear editorRef on unmount so stale disposed references don't leak
  // into the next mount's useEffect callbacks.
  useEffect(() => {
    return () => {
      editorRef.current = null
    }
  }, [])

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

  const handleTidyMarkdown = useCallback(async () => {
    if (!activeFile || !isMarkdownFile(activeFile.path) || isTidyingMarkdown) return

    setTidyError(null)
    setIsTidyingMarkdown(true)
    try {
      const tidyRes = await window.daemon.claude.tidyMarkdown(activeFile.path, activeFile.content)
      if (!tidyRes.ok || !tidyRes.data) {
        setTidyError(tidyRes.error ?? 'Failed to tidy markdown')
        return
      }

      if (tidyRes.data === activeFile.content) {
        setTidyError('No tidy changes suggested.')
        return
      }

      setMarkdownTidyPreview({
        original: activeFile.content,
        tidied: tidyRes.data,
      })
    } finally {
      setIsTidyingMarkdown(false)
    }
  }, [activeFile, isTidyingMarkdown])

  const handleApplyMarkdownTidy = useCallback(async () => {
    if (!activeFile || !markdownTidyPreview || isApplyingMarkdownTidy) return

    setTidyError(null)
    setIsApplyingMarkdownTidy(true)
    try {
      const saveRes = await window.daemon.fs.writeFile(activeFile.path, markdownTidyPreview.tidied)
      if (!saveRes.ok) {
        setTidyError(saveRes.error ?? 'Failed to save tidied markdown')
        return
      }

      const editor = editorRef.current
      const model = editor?.getModel()
      if (model) {
        model.setValue(markdownTidyPreview.tidied)
      }
      updateFileContent(activeFile.path, markdownTidyPreview.tidied)

      markFileSaved(activeFile.path)
      setSavedFlash(activeFile.path)
      setTimeout(() => setSavedFlash(null), 600)
      setMarkdownTidyPreview(null)
    } finally {
      setIsApplyingMarkdownTidy(false)
    }
  }, [activeFile, markdownTidyPreview, isApplyingMarkdownTidy, updateFileContent, markFileSaved])

  const handleDiscardMarkdownTidy = useCallback(() => {
    setTidyError(null)
    setMarkdownTidyPreview(null)
  }, [])

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
          {activeProjectId ? 'Open a file, launch an agent, or start from a template' : 'Select a project'}
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
            <button
              className="editor-tab-close"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                handleCloseFile(file.projectId, file.path)
              }}
            >
              &times;
            </button>
          </button>
        ))}
      </div>
      <div className="editor-breadcrumbs" role="navigation" aria-label="File breadcrumbs">
        <div className="editor-breadcrumbs-left">
          {breadcrumbs.length > 0 ? breadcrumbs.map((segment, index) => (
            <span key={`${segment.label}-${segment.path}`} className="editor-breadcrumb-item-wrap">
              <button
                className={`editor-breadcrumb-item ${segment.isFile ? 'is-file' : ''}`}
                onClick={() => void window.daemon.fs.reveal(segment.path)}
                title={segment.path}
              >
                {segment.label}
              </button>
              {index < breadcrumbs.length - 1 && <span className="editor-breadcrumb-sep">/</span>}
            </span>
          )) : (
            <span className="editor-breadcrumb-empty">No active file</span>
          )}
        </div>
        {isActiveFileMarkdown && activeFile && (
          <div className="editor-breadcrumbs-actions">
            {tidyError && <span className="editor-tidy-error">{tidyError}</span>}
            {!markdownTidyPreview && (
              <button
                className="editor-tidy-btn"
                onClick={() => void handleTidyMarkdown()}
                disabled={isTidyingMarkdown}
                title="Tidy this Markdown with Claude"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v4m0 14v-4m9-5h-4M3 12h4m12.36-5.36l-2.83 2.83M7.46 16.54l-2.83 2.83m14.73 0l-2.83-2.83M7.46 7.46L4.64 4.64"/>
                </svg>
                {isTidyingMarkdown ? 'Tidying...' : 'Tidy'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="editor-content">
        {markdownTidyPreview && activeFile ? (
          <div className="editor-tidy-preview">
            <div className="editor-tidy-preview-header">
              <div className="editor-tidy-preview-title">Preview tidy changes</div>
              <div className="editor-tidy-preview-actions">
                <button
                  className="editor-tidy-preview-btn subtle"
                  onClick={handleDiscardMarkdownTidy}
                  disabled={isApplyingMarkdownTidy}
                >
                  Keep Original
                </button>
                <button
                  className="editor-tidy-preview-btn primary"
                  onClick={() => void handleApplyMarkdownTidy()}
                  disabled={isApplyingMarkdownTidy}
                >
                  {isApplyingMarkdownTidy ? 'Applying…' : 'Accept & Apply'}
                </button>
              </div>
            </div>
            {tidyError && <div className="editor-tidy-preview-error">{tidyError}</div>}
            <div className="editor-tidy-preview-diff">
              <DiffEditor
                original={markdownTidyPreview.original}
                modified={markdownTidyPreview.tidied}
                language={getLanguage(activeFile.path)}
                theme="daemon-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                  fontSize: 13,
                  lineHeight: 20,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        ) : (
          <PluginErrorBoundary fallbackLabel="Editor crashed — open a file to reload">
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
                wordWrap: 'on',
                tabSize: 2,
                glyphMargin: true,
              }}
            />
          </PluginErrorBoundary>
        )}
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

function isMarkdownFile(filePath?: string | null): boolean {
  if (!filePath) return false
  return /\.(md|mdx)$/i.test(filePath)
}

function buildBreadcrumbs(projectPath: string, filePath: string): Array<{ label: string; path: string; isFile: boolean }> {
  const projectParts = splitPath(projectPath)
  const fileParts = splitPath(filePath)

  let commonIndex = 0
  while (
    commonIndex < projectParts.length
    && commonIndex < fileParts.length
    && projectParts[commonIndex].toLowerCase() === fileParts[commonIndex].toLowerCase()
  ) {
    commonIndex += 1
  }

  const relativeParts = fileParts.slice(commonIndex)
  const segments: Array<{ label: string; path: string; isFile: boolean }> = []

  for (let index = 0; index < relativeParts.length; index += 1) {
    const absoluteParts = [...fileParts.slice(0, commonIndex), ...relativeParts.slice(0, index + 1)]
    const absolutePath = joinPathLike(filePath, absoluteParts)
    segments.push({
      label: relativeParts[index],
      path: absolutePath,
      isFile: index === relativeParts.length - 1,
    })
  }

  return segments
}

function splitPath(targetPath: string): string[] {
  return targetPath.replace(/\\/g, '/').split('/').filter(Boolean)
}

function joinPathLike(originalPath: string, parts: string[]): string {
  const separator = originalPath.includes('\\') ? '\\' : '/'
  const hasDrive = /^[A-Za-z]:/.test(originalPath)
  const joined = parts.join(separator)
  if (hasDrive) return joined
  return `${separator}${joined}`
}
