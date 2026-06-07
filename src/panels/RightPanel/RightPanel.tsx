import { AgentWorkbench } from '../AgentWorkbench/AgentWorkbench'
import { RightSidebarWidgets } from './RightSidebarWidgets'
import './RightPanel.css'

/**
 * Right rail: a single AGENT panel (the ARIA operator). The former Claude/Codex/
 * Meter tabs and the MCP/skills/CLAUDE.md Console were relocated out of the rail;
 * their panels (CodexPanel, MeterflowPanel, ClaudePanel) remain available elsewhere.
 */
export function RightPanel() {
  return (
    <div className="right-panel-wrap">
      <RightSidebarWidgets />
      <div className="right-panel-content">
        <AgentWorkbench />
      </div>
    </div>
  )
}
