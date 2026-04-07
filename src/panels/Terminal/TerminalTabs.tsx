import { type CenterMode } from '../../store/ui'
import { type TerminalLaunchRecent } from './RecentsManager'
import { TerminalLauncher } from './TerminalLauncher'

interface TerminalTabEntry {
  id: string
  label: string
  agentId: string | null
  projectId: string
}

type SplitLayout = {
  direction: 'horizontal' | 'vertical'
  secondaryId: string
} | undefined

interface TerminalTabsProps {
  visibleTerminals: TerminalTabEntry[]
  activeTerminalId: string | null
  activeProjectId: string | null
  centerMode: CenterMode
  splitLayout: SplitLayout
  launchRecents: TerminalLaunchRecent[]
  onSelectTerminal: (id: string) => void
  onCloseTerminal: (id: string) => void
  onToggleGrindMode: () => void
  onSplit: (direction: 'horizontal' | 'vertical') => void
  onUnsplit: () => void
  onStartShell: () => void
  onStartClaudeChat: () => void
  onStartSolanaAgent: () => void
  onLaunchAgent: (agent: Agent) => void
  onLaunchCommand: (command: string, label: string) => void
}

export function TerminalTabs({
  visibleTerminals,
  activeTerminalId,
  activeProjectId,
  centerMode,
  splitLayout,
  launchRecents,
  onSelectTerminal,
  onCloseTerminal,
  onToggleGrindMode,
  onSplit,
  onUnsplit,
  onStartShell,
  onStartClaudeChat,
  onStartSolanaAgent,
  onLaunchAgent,
  onLaunchCommand,
}: TerminalTabsProps) {
  return (
    <div className="terminal-tabs">
      {visibleTerminals.map((tab) => (
        <button
          key={tab.id}
          className={`terminal-tab ${activeTerminalId === tab.id ? 'active' : ''}`}
          onClick={() => onSelectTerminal(tab.id)}
        >
          <span className={`terminal-tab-dot ${tab.agentId ? 'agent' : ''}`} />
          <span>{tab.label}</span>
          <span
            className="terminal-tab-close"
            onClick={(e) => { e.stopPropagation(); onCloseTerminal(tab.id) }}
          >
            &times;
          </span>
        </button>
      ))}
      <TerminalLauncher
        activeProjectId={activeProjectId}
        launchRecents={launchRecents}
        onStartShell={onStartShell}
        onStartClaudeChat={onStartClaudeChat}
        onStartSolanaAgent={onStartSolanaAgent}
        onLaunchAgent={onLaunchAgent}
        onLaunchCommand={onLaunchCommand}
      />
      <div className="terminal-tools">
        <button
          className={`terminal-tool-btn ${centerMode === 'grind' ? 'active' : ''}`}
          onClick={onToggleGrindMode}
          title="Agent Grid (2x2 Claude sessions)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
        </button>
        <button className="terminal-tool-btn" onClick={() => void onSplit('vertical')} title="Split vertical">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
        </button>
        <button className="terminal-tool-btn" onClick={() => void onSplit('horizontal')} title="Split horizontal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
        </button>
        {splitLayout && (
          <button className="terminal-tool-btn" onClick={onUnsplit} title="Unsplit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}
