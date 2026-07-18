import { useCallback, useEffect, useRef, useState } from 'react'
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { X } from '@phosphor-icons/react'
import { useLiteWorkbenchStore } from './liteWorkbenchStore'
import styles from './LiteWorkbench.module.css'

;(globalThis as Record<string, unknown>).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}
loader.config({ monaco })

const LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json',
  rs: 'rust', toml: 'ini', yaml: 'yaml', yml: 'yaml', css: 'css', html: 'html', md: 'markdown',
}

function languageFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGES[extension] ?? 'plaintext'
}

export function LiteEditor() {
  const openFiles = useLiteWorkbenchStore((state) => state.openFiles)
  const activeFilePath = useLiteWorkbenchStore((state) => state.activeFilePath)
  const setActiveFile = useLiteWorkbenchStore((state) => state.setActiveFile)
  const updateFile = useLiteWorkbenchStore((state) => state.updateFile)
  const markSaved = useLiteWorkbenchStore((state) => state.markSaved)
  const closeFile = useLiteWorkbenchStore((state) => state.closeFile)
  const activeFile = openFiles.find((file) => file.path === activeFilePath) ?? null
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message: string }>({ kind: 'idle', message: '' })

  const saveLiveEditor = useCallback(async () => {
    const editor = editorRef.current
    const state = useLiteWorkbenchStore.getState()
    const filePath = state.activeFilePath
    if (!editor || !filePath) return
    const content = editor.getValue()
    state.updateFile(filePath, content)
    setSaveState({ kind: 'saving', message: 'Saving…' })
    try {
      const response = await window.daemon.fs.writeFile(filePath, content)
      if (!response.ok) throw new Error(response.error ?? 'Save failed')
      useLiteWorkbenchStore.getState().markSaved(filePath, content)
      setSaveState({ kind: 'saved', message: 'Saved' })
    } catch (error) {
      setSaveState({ kind: 'error', message: error instanceof Error ? error.message : 'Save failed' })
    }
  }, [])

  const handleMount: OnMount = useCallback((editor, monacoApi) => {
    editorRef.current = editor
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, saveLiveEditor)
  }, [saveLiveEditor])

  if (!activeFile) {
    return <div className={styles.editorEmpty}><strong>DAEMON Workbench</strong><span>Open a file from Explorer. Your project stays local.</span></div>
  }

  return (
    <section className={styles.editor} aria-label="Code editor">
      <div className={styles.tabs}>
        {openFiles.map((file) => {
          const isDirty = file.content !== file.savedContent
          return (
            <div key={file.path} className={`${styles.tabGroup}${file.path === activeFile.path ? ` ${styles.tabGroupActive}` : ''}`}>
              <button type="button" className={styles.tab} onClick={() => setActiveFile(file.path)}>{file.name}{isDirty ? ' •' : ''}</button>
              <button type="button" className={styles.tabClose} aria-label={`Close ${file.name}`} onClick={() => {
                if (isDirty && !window.confirm(`Discard unsaved changes to ${file.name}?`)) return
                closeFile(file.path)
              }}><X size={11} /></button>
            </div>
          )
        })}
        <span className={styles.saveStatus} role={saveState.kind === 'error' ? 'alert' : 'status'}>{saveState.message}</span>
        <button type="button" className={styles.saveButton} disabled={saveState.kind === 'saving' || activeFile.content === activeFile.savedContent} onClick={() => void saveLiveEditor()}>Save</button>
      </div>
      <MonacoEditor
        path={activeFile.path.replace(/\\/g, '/')}
        language={languageFor(activeFile.path)}
        value={activeFile.content}
        onChange={(value) => updateFile(activeFile.path, value ?? '')}
        onMount={handleMount}
        theme="vs-dark"
        loading={<div className={styles.editorLoading}>Loading editor…</div>}
        options={{ automaticLayout: true, fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12 } }}
      />
    </section>
  )
}
