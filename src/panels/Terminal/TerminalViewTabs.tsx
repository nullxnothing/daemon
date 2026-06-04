export type TerminalView = 'terminal' | 'problems' | 'output' | 'ports'

interface ViewTab {
  id: TerminalView
  label: string
}

const VIEW_TABS: ViewTab[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'ports', label: 'Ports' },
]

/** Fixed view switcher (Terminal / Problems / Output / Ports) + trailing actions. */
export function TerminalViewTabs({
  activeView,
  onSelectView,
  problemCount,
  onCollapse,
  trailing,
}: {
  activeView: TerminalView
  onSelectView: (view: TerminalView) => void
  problemCount: number
  onCollapse?: () => void
  /** Extra controls (launcher, split tools) rendered before the collapse action. */
  trailing?: React.ReactNode
}) {
  return (
    <div className="terminal-viewtabs" role="tablist" aria-label="Terminal views">
      <div className="terminal-viewtabs-scroll">
        {VIEW_TABS.map((tab) => {
          const count = tab.id === 'problems' ? problemCount : 0
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeView === tab.id}
              className={`terminal-viewtab${activeView === tab.id ? ' active' : ''}`}
              onClick={() => onSelectView(tab.id)}
            >
              {tab.label}
              {count > 0 && <span className="terminal-viewtab-badge">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="terminal-viewtabs-actions">
        {trailing}
        {onCollapse && (
          <button type="button" className="terminal-view-action" onClick={onCollapse} title="Collapse panel" aria-label="Collapse terminal panel">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
