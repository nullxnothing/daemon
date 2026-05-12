import { Suspense, useRef, useCallback, useState, useEffect, useMemo, type ComponentType, type LazyExoticComponent } from 'react'
import MonacoEditor, { type OnMount, type BeforeMount, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution'
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution'
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution'
import 'monaco-editor/esm/vs/basic-languages/dockerfile/dockerfile.contribution'
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { usePluginStore } from '../../store/plugins'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import { AskClaudeWidget } from '../../components/AskClaudeWidget'
import { PanelErrorBoundary } from '../../components/ErrorBoundary'
import { EditorWelcome } from './EditorWelcome'
import { EditorTabs } from './EditorTabs'
import { EditorBreadcrumbs } from './EditorBreadcrumbs'
import { MarkdownTidyPreview } from './MarkdownTidyPreview'
import { lazyNamedWithReload } from '../../utils/lazyWithReload'
import { BUILTIN_TOOLS, TOOL_ICONS, TOOL_NAMES } from '../../components/CommandDrawer/CommandDrawer'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import type { LspDiagnosticEvent, LspLocation, LspPosition } from '../../../electron/shared/types'
import './Editor.css'

const BrowserMode = lazyNamedWithReload('browser-mode', () => import('../BrowserMode/BrowserMode'), (module) => module.BrowserMode)
const DashboardCanvas = lazyNamedWithReload('editor-dashboard-canvas', () => import('../Dashboard/DashboardCanvas'), (module) => module.DashboardCanvas)

// Wire up Monaco workers for Vite — required for syntax highlighting, validation, etc.
;(globalThis as Record<string, unknown>).MonacoEnvironment = {
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

const LSP_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascriptreact',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
}

const LSP_MONACO_LANGUAGES = ['typescript', 'javascript', 'python', 'rust']
type MonacoApi = Parameters<BeforeMount>[0]

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_MAP[ext] ?? 'plaintext'
}

function getLspLanguageId(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LSP_LANGUAGE_MAP[ext] ?? null
}

// Persist view state (cursor, scroll, selections) per file path
const viewStateCache = new Map<string, monaco.editor.ICodeEditorViewState>()

let themeIsDefined = false
let lspProvidersRegistered = false

function WorkspacePanelFallback() {
  return <div className="workspace-panel-loading">Loading panel...</div>
}

function getLspBridge() {
  return typeof window === 'undefined' ? null : window.daemon?.lsp ?? null
}

function normalizeEditorPath(filePath: string): string {
  return filePath.replace(/^\/([A-Za-z]:)/, '$1').replace(/\\/g, '/').toLowerCase()
}

function sameEditorPath(left: string, right: string): boolean {
  return normalizeEditorPath(left) === normalizeEditorPath(right)
}

function pathFromMonacoUri(uri: monaco.Uri): string {
  const fsPath = uri.fsPath || decodeURIComponent(uri.path)
  return fsPath.replace(/^\/([A-Za-z]:)/, '$1')
}

function modelForFilePath(filePath: string): monaco.editor.ITextModel | null {
  return monaco.editor.getModels().find((model) => sameEditorPath(pathFromMonacoUri(model.uri), filePath)) ?? null
}

function uriForFilePath(filePath: string): monaco.Uri {
  return modelForFilePath(filePath)?.uri ?? monaco.Uri.parse(`file://${filePath}`)
}

function lspPosition(position: monaco.Position): LspPosition {
  return {
    line: Math.max(0, position.lineNumber - 1),
    character: Math.max(0, position.column - 1),
  }
}

function monacoRange(range: LspLocation['range']): monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function lspSeverity(severity?: number): monaco.MarkerSeverity {
  if (severity === 1) return monaco.MarkerSeverity.Error
  if (severity === 2) return monaco.MarkerSeverity.Warning
  if (severity === 3) return monaco.MarkerSeverity.Info
  return monaco.MarkerSeverity.Hint
}

function applyLspDiagnostics(payload: LspDiagnosticEvent) {
  const model = modelForFilePath(payload.filePath)
  if (!model) return

  monaco.editor.setModelMarkers(model, 'daemon-lsp', payload.diagnostics.map((diagnostic) => ({
    ...monacoRange(diagnostic.range),
    severity: lspSeverity(diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source ?? 'LSP',
    code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
  })))
}

function lspContextForModel(model: monaco.editor.ITextModel): { projectPath: string; filePath: string; languageId: string } | null {
  const modelPath = pathFromMonacoUri(model.uri)
  const state = useUIStore.getState()
  const openFile = state.openFiles.find((file) => sameEditorPath(file.path, modelPath))
  const project = openFile ? state.projects.find((item) => item.id === openFile.projectId) : null
  const projectPath = project?.path ?? state.activeProjectPath
  const filePath = openFile?.path ?? modelPath
  const languageId = getLspLanguageId(filePath)

  if (!projectPath || !languageId) return null
  return { projectPath, filePath, languageId }
}

function completionKind(kind?: number): monaco.languages.CompletionItemKind {
  const map: Record<number, monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter,
  }
  return kind ? map[kind] ?? monaco.languages.CompletionItemKind.Text : monaco.languages.CompletionItemKind.Text
}

function registerLspProviders(monacoInstance: MonacoApi) {
  if (lspProvidersRegistered) return
  const lsp = getLspBridge()
  if (!lsp) return
  lspProvidersRegistered = true

  for (const language of LSP_MONACO_LANGUAGES) {
    monacoInstance.languages.registerHoverProvider(language, {
      async provideHover(model, position) {
        const context = lspContextForModel(model)
        if (!context) return null
        const res = await lsp.hover(context.projectPath, context.filePath, context.languageId, lspPosition(position))
        if (!res.ok || !res.data?.contents) return null
        return {
          contents: [{ value: res.data.contents }],
          range: res.data.range ? monacoRange(res.data.range) : undefined,
        }
      },
    })

    monacoInstance.languages.registerDefinitionProvider(language, {
      async provideDefinition(model, position) {
        const context = lspContextForModel(model)
        if (!context) return []
        const res = await lsp.definition(context.projectPath, context.filePath, context.languageId, lspPosition(position))
        if (!res.ok || !res.data) return []
        return res.data.map((location) => ({
          uri: uriForFilePath(location.filePath),
          range: monacoRange(location.range),
        }))
      },
    })

    monacoInstance.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '"', "'", '/', '<', ':'],
      async provideCompletionItems(model, position) {
        const context = lspContextForModel(model)
        if (!context) return { suggestions: [] }
        const res = await lsp.completion(context.projectPath, context.filePath, context.languageId, lspPosition(position))
        if (!res.ok || !res.data?.items) return { suggestions: [] }

        const word = model.getWordUntilPosition(position)
        const range = new monacoInstance.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)

        return {
          suggestions: res.data.items.slice(0, 200).map((item) => ({
            label: item.label,
            kind: completionKind(item.kind),
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText ?? item.label,
            filterText: item.filterText,
            sortText: item.sortText,
            range,
          })),
        }
      },
    })
  }
}

export function EditorPanel() {
  // Derive a stable fingerprint from open files to avoid re-renders on content-only changes.
  // The fingerprint captures tab metadata (path, name, isDirty) but NOT content.
  // Returns empty string when no files are open — a stable primitive that won't loop.
  const tabFingerprint = useUIStore((s) => {
    const files = s.openFiles
    if (files.length === 0) return ''
    return files.map((f) => `${f.projectId}|${f.path}|${f.name}|${f.isDirty}`).join('\n')
  })
  // Recompute tab objects only when the fingerprint changes
  const openFileTabs = useMemo(() => {
    if (!tabFingerprint) return []
    return useUIStore.getState().openFiles.map((f) => ({ path: f.path, name: f.name, isDirty: f.isDirty, projectId: f.projectId }))
  }, [tabFingerprint])
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeFilePathByProject = useUIStore((s) => s.activeFilePathByProject)
  const setActiveFile = useUIStore((s) => s.setActiveFile)
  const closeFile = useUIStore((s) => s.closeFile)
  const updateFileContent = useUIStore((s) => s.updateFileContent)
  const markFileSaved = useUIStore((s) => s.markFileSaved)
  const browserTabOpen = useUIStore((s) => s.browserTabOpen)
  const browserTabActive = useUIStore((s) => s.browserTabActive)
  const setBrowserTabActive = useUIStore((s) => s.setBrowserTabActive)
  const workspaceToolTabs = useUIStore((s) => s.workspaceToolTabs)
  const activeWorkspaceToolId = useUIStore((s) => s.activeWorkspaceToolId)
  const setActiveWorkspaceTool = useUIStore((s) => s.setActiveWorkspaceTool)
  const closeWorkspaceTool = useUIStore((s) => s.closeWorkspaceTool)
  const dashboardTabOpen = useUIStore((s) => s.dashboardTabOpen)
  const dashboardTabActive = useUIStore((s) => s.dashboardTabActive)
  const setDashboardTabActive = useUIStore((s) => s.setDashboardTabActive)
  const plugins = usePluginStore((s) => s.plugins)
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

  const projectOpenFiles = useMemo(
    () => openFileTabs.filter((f) => f.projectId === activeProjectId),
    [openFileTabs, activeProjectId]
  )
  const activeFilePath = activeProjectId ? activeFilePathByProject[activeProjectId] ?? null : null
  const activeFile = useMemo(
    () => useUIStore.getState().openFiles.find((f) => f.path === activeFilePath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilePath, openFileTabs]
  )
  const breadcrumbs = useMemo(
    () => activeFile && activeProjectPath ? buildBreadcrumbs(activeProjectPath, activeFile.path) : [],
    [activeFile?.path, activeProjectPath]
  )
  const isActiveFileMarkdown = isMarkdownFile(activeFile?.path)
  const workspaceToolRegistry = useMemo(() => {
    const toolMap = new Map<string, { name: string; component: LazyExoticComponent<ComponentType>; Icon: ComponentType<{ size?: number }> }>()
    for (const tool of BUILTIN_TOOLS) {
      toolMap.set(tool.id, {
        name: tool.name,
        component: tool.component,
        Icon: TOOL_ICONS[tool.id] ?? tool.icon,
      })
    }
    for (const plugin of plugins) {
      if (!plugin.enabled) continue
      const manifest = PLUGIN_REGISTRY[plugin.id]
      if (!manifest) continue
      toolMap.set(plugin.id, {
        name: manifest.name,
        component: manifest.component,
        Icon: manifest.icon,
      })
    }
    return toolMap
  }, [plugins])
  const workspaceToolTabMeta = useMemo(
    () => workspaceToolTabs
      .map((id) => {
        const tool = workspaceToolRegistry.get(id)
        if (!tool) return null
        return {
          id,
          name: TOOL_NAMES[id] ?? tool.name,
          Icon: tool.Icon,
        }
      })
      .filter((tool): tool is { id: string; name: string; Icon: ComponentType<{ size?: number }> } => tool !== null),
    [workspaceToolRegistry, workspaceToolTabs]
  )
  const activeWorkspaceTool = activeWorkspaceToolId ? workspaceToolRegistry.get(activeWorkspaceToolId) ?? null : null

  // Keep ref in sync so the onChange callback always has current path
  activeFilePathRef.current = activeFilePath
  const activeProjectPathRef = useRef<string | null>(null)
  const lspChangeTimerRef = useRef<number | null>(null)
  const [lspStatus, setLspStatus] = useState<{ label: string; detail: string; active: boolean } | null>(null)

  activeProjectPathRef.current = activeProjectPath

  useEffect(() => {
    setMarkdownTidyPreview(null)
    setTidyError(null)
  }, [activeFile?.path])

  useEffect(() => {
    const lsp = getLspBridge()
    if (!lsp) return
    return lsp.onDiagnostics((payload) => {
      applyLspDiagnostics(payload)
    })
  }, [])

  useEffect(() => {
    const lsp = getLspBridge()
    if (!lsp || !activeFile || !activeProjectPath || isImageFile(activeFile.path)) {
      setLspStatus(null)
      return
    }

    const languageId = getLspLanguageId(activeFile.path)
    if (!languageId) {
      setLspStatus(null)
      const model = modelForFilePath(activeFile.path)
      if (model) monaco.editor.setModelMarkers(model, 'daemon-lsp', [])
      return
    }

    let cancelled = false
    const input = {
      projectPath: activeProjectPath,
      filePath: activeFile.path,
      languageId,
      text: activeFile.content,
    }

    setLspStatus({ label: 'LSP', detail: 'Queued language server', active: true })
    const openTimer = window.setTimeout(() => {
      if (cancelled) return
      setLspStatus({ label: 'LSP', detail: 'Starting language server', active: true })
      lsp.openDocument(input).then((res) => {
        if (cancelled) return
        if (res.ok && res.data?.supported && res.data.status) {
          setLspStatus({ label: res.data.status.label, detail: 'Language server active', active: true })
        } else {
          setLspStatus({ label: 'LSP', detail: res.ok ? res.data?.error ?? 'Language server unavailable' : res.error ?? 'Language server unavailable', active: false })
        }
      }).catch((error) => {
        if (!cancelled) setLspStatus({ label: 'LSP', detail: (error as Error).message, active: false })
      })

      lsp.diagnostics(activeFile.path).then((res) => {
        if (!cancelled && res.ok && res.data) applyLspDiagnostics(res.data)
      }).catch(() => {})
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(openTimer)
      if (lspChangeTimerRef.current !== null) {
        window.clearTimeout(lspChangeTimerRef.current)
        lspChangeTimerRef.current = null
      }
      void lsp.closeDocument({
        projectPath: activeProjectPath,
        filePath: activeFile.path,
        languageId,
      })
    }
  }, [activeFile?.path, activeProjectPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prune viewStateCache entries for files no longer open in any project.
  // Runs on project switch to prevent unbounded cache growth.
  useEffect(() => {
    const openPaths = new Set(useUIStore.getState().openFiles.map((f) => f.path))
    for (const cachedPath of viewStateCache.keys()) {
      if (!openPaths.has(cachedPath)) {
        viewStateCache.delete(cachedPath)
      }
    }
  }, [activeProjectId])

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

  // Sync external content changes into existing models.
  // Read content from getState() so this effect doesn't subscribe to content updates.
  // Trigger is the slim tab list (isDirty flag changes are visible there).
  const cleanTabPaths = useMemo(
    () => openFileTabs.filter((f) => !f.isDirty).map((f) => f.path),
    [openFileTabs]
  )
  useEffect(() => {
    const allFiles = useUIStore.getState().openFiles
    for (const path of cleanTabPaths) {
      const file = allFiles.find((f) => f.path === path)
      if (!file) continue
      const uri = monaco.Uri.parse(`file://${file.path}`)
      const model = monaco.editor.getModel(uri)
      if (model && model.getValue() !== file.content) {
        model.setValue(file.content)
      }
    }
  }, [cleanTabPaths]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerLspProviders(monacoInstance)
    if (themeIsDefined) return
    monacoInstance.editor.defineTheme('daemon-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      // Monaco API requires hex values — keep in sync with tokens.css
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
      const projectPath = activeProjectPathRef.current
      const languageId = getLspLanguageId(currentPath)
      const lsp = getLspBridge()
      if (projectPath && languageId && lsp) {
        if (lspChangeTimerRef.current !== null) {
          window.clearTimeout(lspChangeTimerRef.current)
        }
        lspChangeTimerRef.current = window.setTimeout(() => {
          void lsp.changeDocument({
            projectPath,
            filePath: currentPath,
            languageId,
            text: value,
          })
          lspChangeTimerRef.current = null
        }, 350)
      }
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
        useNotificationsStore.getState().pushInfo('Document is already tidy.', 'Markdown')
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
  const handleCloseFile = useCallback(async (projectId: string, path: string) => {
    const file = useUIStore.getState().openFiles.find((f) => f.projectId === projectId && f.path === path)
    if (file?.isDirty) {
      const ok = await confirm({
        title: `Discard unsaved changes to ${file.name}?`,
        body: 'Your unsaved edits will be lost.',
        danger: true,
        confirmLabel: 'Discard',
      })
      if (!ok) return
    }

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
  }, [closeFile, activeFilePath])

  const handleSelectFileTab = useCallback((projectId: string, path: string) => {
    setBrowserTabActive(false)
    setDashboardTabActive(false)
    setActiveFile(projectId, path)
  }, [setBrowserTabActive, setDashboardTabActive, setActiveFile])

  const handleBrowserTabClick = useCallback(() => {
    setBrowserTabActive(true)
    setDashboardTabActive(false)
    setActiveWorkspaceTool(null)
  }, [setBrowserTabActive, setDashboardTabActive])

  const handleDashboardTabClick = useCallback(() => {
    setDashboardTabActive(true)
    setBrowserTabActive(false)
    setActiveWorkspaceTool(null)
  }, [setDashboardTabActive, setBrowserTabActive])

  const hasAnyPinnedTab = browserTabOpen || dashboardTabOpen || workspaceToolTabs.length > 0

  // Show welcome when no project and no pinned tabs open
  if (!activeProjectId && !hasAnyPinnedTab) {
    return <EditorWelcome activeProjectId={activeProjectId} />
  }

  // If a pinned tab is the only content (no project), render a minimal shell
  if (!activeProjectId && hasAnyPinnedTab) {
    return (
      <div className="editor-panel">
        <EditorTabs
          toolTabs={workspaceToolTabMeta}
          activeToolId={activeWorkspaceToolId}
          onSelectTool={setActiveWorkspaceTool}
          onCloseTool={closeWorkspaceTool}
          files={[]}
          activeFilePath={null}
          savedFlash={null}
          onSelectFile={handleSelectFileTab}
          onCloseFile={handleCloseFile}
          browserTabOpen={browserTabOpen}
          browserTabActive={browserTabActive}
          onBrowserTabClick={handleBrowserTabClick}
          dashboardTabOpen={dashboardTabOpen}
          dashboardTabActive={dashboardTabActive}
          onDashboardTabClick={handleDashboardTabClick}
        />
        <div className="editor-content editor-tool-content">
          <Suspense fallback={<WorkspacePanelFallback />}>
            {activeWorkspaceTool ? (
              <PanelErrorBoundary fallbackLabel={`${activeWorkspaceTool.name} crashed — reopen the tab to reload`}>
                <activeWorkspaceTool.component />
              </PanelErrorBoundary>
            ) : dashboardTabActive ? (
              <DashboardCanvas />
            ) : (
              <PanelErrorBoundary fallbackLabel="Browser crashed — press Ctrl+Shift+B to reload">
                <BrowserMode />
              </PanelErrorBoundary>
            )}
          </Suspense>
        </div>
      </div>
    )
  }

  if (projectOpenFiles.length === 0 && !hasAnyPinnedTab) {
    return <EditorWelcome activeProjectId={activeProjectId} />
  }

  return (
    <div className="editor-panel">
      <EditorTabs
        toolTabs={workspaceToolTabMeta}
        activeToolId={activeWorkspaceToolId}
        onSelectTool={setActiveWorkspaceTool}
        onCloseTool={closeWorkspaceTool}
        files={projectOpenFiles}
        activeFilePath={activeFilePath}
        savedFlash={savedFlash}
        onSelectFile={handleSelectFileTab}
        onCloseFile={handleCloseFile}
        browserTabOpen={browserTabOpen}
        browserTabActive={browserTabActive}
        onBrowserTabClick={handleBrowserTabClick}
        dashboardTabOpen={dashboardTabOpen}
        dashboardTabActive={dashboardTabActive}
        onDashboardTabClick={handleDashboardTabClick}
      />
      {activeWorkspaceTool ? (
        <div className="editor-content editor-tool-content">
          <Suspense fallback={<WorkspacePanelFallback />}>
            <PanelErrorBoundary fallbackLabel={`${activeWorkspaceTool.name} crashed — reopen the tab to reload`}>
              <activeWorkspaceTool.component />
            </PanelErrorBoundary>
          </Suspense>
        </div>
      ) : dashboardTabActive ? (
        <div className="editor-content">
          <Suspense fallback={<WorkspacePanelFallback />}>
            <DashboardCanvas />
          </Suspense>
        </div>
      ) : browserTabActive ? (
        <div className="editor-content">
          <Suspense fallback={<WorkspacePanelFallback />}>
            <PanelErrorBoundary fallbackLabel="Browser crashed — press Ctrl+Shift+B to reload">
              <BrowserMode />
            </PanelErrorBoundary>
          </Suspense>
        </div>
      ) : (
        <>
          <EditorBreadcrumbs
            breadcrumbs={breadcrumbs}
            isMarkdown={isActiveFileMarkdown}
            isTidying={isTidyingMarkdown}
            tidyError={tidyError}
            showTidyButton={!markdownTidyPreview && !!activeFile}
            lspStatus={lspStatus}
            onTidy={() => void handleTidyMarkdown()}
          />
          <div className="editor-content">
            {isImageFile(activeFile?.path) ? (
              <ImagePreview filePath={activeFile!.path} />
            ) : markdownTidyPreview && activeFile ? (
              <MarkdownTidyPreview
                original={markdownTidyPreview.original}
                tidied={markdownTidyPreview.tidied}
                language={getLanguage(activeFile.path)}
                tidyError={tidyError}
                isApplying={isApplyingMarkdownTidy}
                onApply={() => void handleApplyMarkdownTidy()}
                onDiscard={handleDiscardMarkdownTidy}
              />
            ) : activeFile ? (
              <PanelErrorBoundary fallbackLabel="Editor crashed — open a file to reload">
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
              </PanelErrorBoundary>
            ) : (
              <EditorWelcome activeProjectId={activeProjectId} />
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
        </>
      )}
    </div>
  )
}

function isMarkdownFile(filePath?: string | null): boolean {
  if (!filePath) return false
  return /\.(md|mdx)$/i.test(filePath)
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'])

function isImageFile(filePath?: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function ImagePreview({ filePath }: { filePath: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath

  useEffect(() => {
    setDataUrl(null)
    setError(null)
    window.daemon.fs.readImageBase64(filePath).then((res) => {
      if (res.ok && res.data) {
        setDataUrl(res.data.dataUrl)
        setFileSize(res.data.size)
      } else {
        setError(res.error ?? 'Failed to load image')
      }
    })
  }, [filePath])

  return (
    <div className="image-preview">
      <div className="image-preview-container">
        {dataUrl ? (
          <img src={dataUrl} alt={fileName} className="image-preview-img" draggable={false} />
        ) : error ? (
          <div className="image-preview-error">{error}</div>
        ) : (
          <div className="image-preview-loading">Loading...</div>
        )}
      </div>
      <div className="image-preview-info">
        <span className="image-preview-name">{fileName}</span>
        {fileSize > 0 && <span className="image-preview-size">{formatFileSize(fileSize)}</span>}
        <button
          className="image-preview-edit"
          onClick={() => useUIStore.getState().openWorkspaceTool('image-editor')}
        >
          Edit in miniPaint
        </button>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
