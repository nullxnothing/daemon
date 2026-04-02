interface BreadcrumbSegment {
  label: string
  path: string
  isFile: boolean
}

interface EditorBreadcrumbsProps {
  breadcrumbs: BreadcrumbSegment[]
  isMarkdown: boolean
  isTidying: boolean
  tidyError: string | null
  showTidyButton: boolean
  onTidy: () => void
}

export function EditorBreadcrumbs({
  breadcrumbs,
  isMarkdown,
  isTidying,
  tidyError,
  showTidyButton,
  onTidy,
}: EditorBreadcrumbsProps) {
  return (
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
      {isMarkdown && showTidyButton && (
        <div className="editor-breadcrumbs-actions">
          {tidyError && <span className="editor-tidy-error">{tidyError}</span>}
          <button
            className="editor-tidy-btn"
            onClick={onTidy}
            disabled={isTidying}
            title="Tidy this Markdown with Claude"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v4m0 14v-4m9-5h-4M3 12h4m12.36-5.36l-2.83 2.83M7.46 16.54l-2.83 2.83m14.73 0l-2.83-2.83M7.46 7.46L4.64 4.64"/>
            </svg>
            {isTidying ? 'Tidying...' : 'Tidy'}
          </button>
        </div>
      )}
    </div>
  )
}
