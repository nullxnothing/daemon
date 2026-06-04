import { useEffect, useState } from 'react'
import type { LspDiagnostic, LspDiagnosticEvent } from '../../../electron/shared/types'

export interface DiagnosticsByFile {
  filePath: string
  diagnostics: LspDiagnostic[]
}

/** Subscribe to LSP diagnostics and keep an aggregated, per-file map. */
export function useDiagnostics(): { files: DiagnosticsByFile[]; total: number } {
  const [byFile, setByFile] = useState<Record<string, LspDiagnostic[]>>({})

  useEffect(() => {
    const off = window.daemon?.lsp?.onDiagnostics?.((payload: LspDiagnosticEvent) => {
      setByFile((prev) => {
        const next = { ...prev }
        if (payload.diagnostics.length === 0) delete next[payload.filePath]
        else next[payload.filePath] = payload.diagnostics
        return next
      })
    })
    return () => { off?.() }
  }, [])

  const files = Object.entries(byFile)
    .map(([filePath, diagnostics]) => ({ filePath, diagnostics }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath))
  const total = files.reduce((sum, f) => sum + f.diagnostics.length, 0)
  return { files, total }
}

function severityLabel(severity?: number): string {
  switch (severity) {
    case 1: return 'error'
    case 2: return 'warning'
    case 3: return 'info'
    default: return 'hint'
  }
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

export function TerminalProblems({ files }: { files: DiagnosticsByFile[] }) {
  if (files.length === 0) {
    return <div className="terminal-pane-empty">No problems detected in the workspace.</div>
  }

  return (
    <div className="terminal-problems">
      {files.map((file) => (
        <div key={file.filePath} className="terminal-problems-file">
          <div className="terminal-problems-filename" title={file.filePath}>{fileName(file.filePath)}</div>
          {file.diagnostics.map((d, i) => (
            <div key={i} className={`terminal-problem ${severityLabel(d.severity)}`}>
              <span className="terminal-problem-sev">{severityLabel(d.severity)}</span>
              <span className="terminal-problem-msg">{d.message}</span>
              <span className="terminal-problem-loc">
                {d.range ? `${d.range.start.line + 1}:${d.range.start.character + 1}` : ''}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
