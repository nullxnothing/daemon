import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import './SettingsPanel.css'


type SettingsTab = 'keys' | 'integrations' | 'agents' | 'display'

interface SecureKeyEntry {
  key_name: string
  hint: string
}

interface McpEntry {
  name: string
  enabled: boolean
  source: string
}

interface AgentRow {
  id: string
  name: string
  model: string
}

export function SettingsPanel() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const [tab, setTab] = useState<SettingsTab>('keys')

  return (
    <div className="settings-center">
      <div className="settings-header">
        <h2 className="settings-title">Settings</h2>
      </div>

      <div className="settings-tabs">
        {(['keys', 'integrations', 'agents', 'display'] as SettingsTab[]).map((t) => (
          <button
            key={t}
            className={`settings-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'keys' ? 'API Keys' : t === 'integrations' ? 'Integrations' : t === 'agents' ? 'Agents' : 'Display'}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {tab === 'keys' && <KeysSection />}
        {tab === 'integrations' && <IntegrationsSection projectPath={activeProjectPath} />}
        {tab === 'agents' && <AgentsSection />}
        {tab === 'display' && <DisplaySection />}
      </div>
    </div>
  )
}

function KeysSection() {
  const [keys, setKeys] = useState<SecureKeyEntry[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    window.daemon.claude.listKeys().then((res) => {
      if (res.ok && res.data) setKeys(res.data)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) return
    setSaving(true)
    await window.daemon.claude.storeKey(newKeyName.trim(), newKeyValue.trim())
    setNewKeyName('')
    setNewKeyValue('')
    setSaving(false)
    load()
  }

  const handleDelete = async (name: string) => {
    await window.daemon.claude.deleteKey(name)
    load()
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Encrypted credentials stored locally via OS keychain. Used by agents and integrations.
      </div>

      <div className="settings-key-list">
        {keys.map((k) => (
          <div key={k.key_name} className="settings-key-row">
            <code className="settings-key-name">{k.key_name}</code>
            <span className="settings-key-hint">{k.hint}</span>
            <button className="settings-btn danger" onClick={() => handleDelete(k.key_name)}>Remove</button>
          </div>
        ))}
        {keys.length === 0 && <div className="settings-empty">No keys stored</div>}
      </div>

      <div className="settings-key-add">
        <input
          className="settings-input"
          placeholder="KEY_NAME"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
        />
        <input
          className="settings-input"
          type="password"
          placeholder="Value"
          value={newKeyValue}
          onChange={(e) => setNewKeyValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button className="settings-btn primary" onClick={handleSave} disabled={saving || !newKeyName.trim() || !newKeyValue.trim()}>
          {saving ? 'Saving...' : 'Add Key'}
        </button>
      </div>
    </div>
  )
}

function IntegrationsSection({ projectPath }: { projectPath: string | null }) {
  const [mcps, setMcps] = useState<McpEntry[]>([])
  const [connection, setConnection] = useState<{ authMode: string } | null>(null)

  const load = useCallback(() => {
    if (!projectPath) return
    window.daemon.claude.projectMcpAll(projectPath).then((res) => {
      if (res.ok && res.data) setMcps(res.data)
    })
    window.daemon.claude.getConnection().then((res) => {
      if (res.ok && res.data) setConnection(res.data)
    })
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const toggleMcp = async (name: string, enabled: boolean) => {
    if (!projectPath) return
    await window.daemon.claude.projectMcpToggle(projectPath, name, enabled)
    load()
    // Notify all panels (e.g. ClaudePanel) that MCP state changed
    useUIStore.getState().bumpMcpVersion()
    useUIStore.getState().setMcpDirty(true)
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Claude CLI connection and MCP server toggles for the active project.
      </div>

      <div className="settings-integration-row">
        <div className="settings-integration-dot green" />
        <span className="settings-integration-name">Claude CLI</span>
        <span className="settings-integration-status">{connection?.authMode ?? 'unknown'}</span>
      </div>

      <div className="settings-divider" />

      <div className="settings-section-label">MCP Servers</div>
      {!projectPath && <div className="settings-empty">Select a project to manage MCPs</div>}
      {mcps.map((mcp) => (
        <div key={mcp.name} className="settings-integration-row">
          <div className={`settings-integration-dot ${mcp.enabled ? 'green' : ''}`} />
          <span className="settings-integration-name">{mcp.name}</span>
          <span className="settings-integration-source">{mcp.source}</span>
          <button
            className={`settings-toggle ${mcp.enabled ? 'on' : ''}`}
            onClick={() => toggleMcp(mcp.name, !mcp.enabled)}
          >
            <span className="settings-toggle-thumb" />
          </button>
        </div>
      ))}
    </div>
  )
}

function AgentsSection() {
  const [agents, setAgents] = useState<AgentRow[]>([])

  useEffect(() => {
    window.daemon.agents.list().then((res) => {
      if (res.ok && res.data) setAgents(res.data)
    })
  }, [])

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Default agents and model preferences. Edit agents in the Agent Launcher.
      </div>

      <div className="settings-agent-list">
        {agents.map((agent) => (
          <div key={agent.id} className="settings-agent-row">
            <span className="settings-agent-name">{agent.name}</span>
            <code className="settings-agent-model">{agent.model}</code>
          </div>
        ))}
        {agents.length === 0 && <div className="settings-empty">No agents configured</div>}
      </div>
    </div>
  )
}

function DisplaySection() {
  const [showMarketTape, setShowMarketTape] = useState(true)
  const [showTitlebarWallet, setShowTitlebarWallet] = useState(true)

  useEffect(() => {
    window.daemon.settings.getUi().then((res) => {
      if (res.ok && res.data) {
        setShowMarketTape(res.data.showMarketTape)
        setShowTitlebarWallet(res.data.showTitlebarWallet)
      }
    })
  }, [])

  const handleToggleMarketTape = async (enabled: boolean) => {
    setShowMarketTape(enabled)
    await window.daemon.settings.setShowMarketTape(enabled)
  }

  const handleToggleTitlebarWallet = async (enabled: boolean) => {
    setShowTitlebarWallet(enabled)
    await window.daemon.settings.setShowTitlebarWallet(enabled)
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        UI display preferences.
      </div>

      <div className="settings-display-row">
        <span className="settings-display-label">Market ticker tape</span>
        <span className="settings-display-hint">Show BTC/SOL/ETH prices in the status bar</span>
        <button
          className={`settings-toggle ${showMarketTape ? 'on' : ''}`}
          onClick={() => handleToggleMarketTape(!showMarketTape)}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      <div className="settings-display-row">
        <span className="settings-display-label">Titlebar wallet balance</span>
        <span className="settings-display-hint">Show portfolio value in the titlebar</span>
        <button
          className={`settings-toggle ${showTitlebarWallet ? 'on' : ''}`}
          onClick={() => handleToggleTitlebarWallet(!showTitlebarWallet)}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
    </div>
  )
}
