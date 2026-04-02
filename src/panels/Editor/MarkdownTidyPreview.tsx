import { DiffEditor } from '@monaco-editor/react'

interface MarkdownTidyPreviewProps {
  original: string
  tidied: string
  language: string
  tidyError: string | null
  isApplying: boolean
  onApply: () => void
  onDiscard: () => void
}

export function MarkdownTidyPreview({
  original,
  tidied,
  language,
  tidyError,
  isApplying,
  onApply,
  onDiscard,
}: MarkdownTidyPreviewProps) {
  return (
    <div className="editor-tidy-preview">
      <div className="editor-tidy-preview-header">
        <div className="editor-tidy-preview-title">Preview tidy changes</div>
        <div className="editor-tidy-preview-actions">
          <button
            className="editor-tidy-preview-btn subtle"
            onClick={onDiscard}
            disabled={isApplying}
          >
            Keep Original
          </button>
          <button
            className="editor-tidy-preview-btn primary"
            onClick={onApply}
            disabled={isApplying}
          >
            {isApplying ? 'Applying...' : 'Accept & Apply'}
          </button>
        </div>
      </div>
      {tidyError && <div className="editor-tidy-preview-error">{tidyError}</div>}
      <div className="editor-tidy-preview-diff">
        <DiffEditor
          original={original}
          modified={tidied}
          language={language}
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
  )
}
