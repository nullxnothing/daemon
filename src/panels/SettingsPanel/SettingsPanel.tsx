import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useOnboardingStore } from '../../store/onboarding'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { Toggle } from '../../components/Toggle'
import { BUILTIN_TOOLS, TOOL_NAMES } from '../../components/CommandDrawer/CommandDrawer'
import type { WorkspaceProfileName } from '../../../electron/shared/types'
import './SettingsPanel.css'


type SettingsTab = 'keys' | 'integrations' | 'agents' | 'display' | 'setup' | 'crashes'

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
        {(['keys', 'integrations', 'agents', 'display', 'setup', 'crashes'] as SettingsTab[]).map((t) => (
          <button
            key={t}
            data-tab={t}
            className={`settings-tab ${tab === t ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setTab(t) }}
          >
            {t === 'keys' ? 'API Keys' : t === 'integrations' ? 'Integrations' : t === 'agents' ? 'Agents' : t === 'display' ? 'Display' : t === 'setup' ? 'Setup' : 'Crash Log'}
          </button>
        ))}
      </div>

      <div className="settings-body">
        {tab === 'keys' && <KeysSection />}
        {tab === 'integrations' && <IntegrationsSection projectPath={activeProjectPath} />}
        {tab === 'agents' && <AgentsSection />}
        {tab === 'display' && <DisplaySection />}
        {tab === 'setup' && <SetupSection />}
        {tab === 'crashes' && <CrashesSection />}
      </div>
    </div>
  )
}

function KeysSection() {
  const [keys, setKeys] = useState<SecureKeyEntry[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback((cancelled = false) => {
    window.daemon.claude.listKeys().then((res) => {
      if (!cancelled && res.ok && res.data) setKeys(res.data)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    load(cancelled)
    return () => { cancelled = true }
  }, [load])

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
  const [connection, setConnection] = useState<ClaudeConnection | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [showApiInput, setShowApiInput] = useState(false)

  const load = useCallback((cancelled = false) => {
    if (projectPath) {
      window.daemon.claude.projectMcpAll(projectPath).then((res) => {
        if (!cancelled && res.ok && res.data) setMcps(res.data)
      })
    }
    window.daemon.claude.verifyConnection().then((res) => {
      if (!cancelled && res.ok && res.data) setConnection(res.data)
    })
  }, [projectPath])

  useEffect(() => {
    let cancelled = false
    load(cancelled)
    return () => { cancelled = true }
  }, [load])

  const toggleMcp = async (name: string, enabled: boolean) => {
    if (!projectPath) return
    await window.daemon.claude.projectMcpToggle(projectPath, name, enabled)
    load()
    useUIStore.getState().bumpMcpVersion()
    useUIStore.getState().setMcpDirty(true)
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    await window.daemon.claude.disconnect()
    setDisconnecting(false)
    setConnection(null)
    setShowApiInput(false)
    setApiKeyInput('')
    load()
  }

  const handleSignIn = async () => {
    setSigningIn(true)
    await window.daemon.claude.authLogin()
    setSigningIn(false)
    load()
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    await window.daemon.claude.storeKey('ANTHROPIC_API_KEY', apiKeyInput.trim())
    setSavingKey(false)
    setApiKeyInput('')
    setShowApiInput(false)
    load()
  }

  const isConnected = connection && connection.authMode !== 'none'
  const authLabel = connection
    ? connection.authMode === 'both' ? 'Subscription + API key'
      : connection.authMode === 'cli' ? 'Subscription'
      : connection.authMode === 'api' ? 'API key'
      : 'Not connected'
    : 'Checking...'

  return (
    <div className="settings-section">
      {/* Claude Connection */}
      <div className="settings-section-label">Claude Connection</div>
      <div className="settings-section-desc">
        Manage your Claude authentication and API access.
      </div>

      <div className="settings-integration-row">
        <div className={`settings-integration-dot ${isConnected ? 'green' : ''}`} />
        <span className="settings-integration-name">Status</span>
        <span className="settings-integration-status">{authLabel}</span>
      </div>

      {connection?.claudePath && (
        <div className="settings-integration-row">
          <div className="settings-integration-dot green" />
          <span className="settings-integration-name">CLI Path</span>
          <span className="settings-integration-status" style={{ fontFamily: 'var(--font-code)', fontSize: 11 }}>
            {connection.claudePath}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {isConnected ? (
          <button className="settings-btn danger" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <>
            <button className="settings-btn primary" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? 'Waiting...' : 'Sign in with Claude'}
            </button>
            <button className="settings-btn" onClick={() => setShowApiInput(!showApiInput)}>
              {showApiInput ? 'Cancel' : 'Use API Key'}
            </button>
          </>
        )}
      </div>

      {showApiInput && !isConnected && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="settings-input"
            type="password"
            placeholder="sk-ant-api03-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button className="settings-btn primary" onClick={handleSaveApiKey} disabled={savingKey || !apiKeyInput.trim()}>
            {savingKey ? '...' : 'Save'}
          </button>
        </div>
      )}

      <div className="settings-divider" />

      {/* MCP Servers */}
      <div className="settings-section-label">MCP Servers</div>
      {!projectPath && <div className="settings-empty">Select a project to manage MCPs</div>}
      {mcps.map((mcp) => (
        <div key={mcp.name} className="settings-integration-row">
          <div className={`settings-integration-dot ${mcp.enabled ? 'green' : ''}`} />
          <span className="settings-integration-name">{mcp.name}</span>
          <span className="settings-integration-source">{mcp.source}</span>
          <Toggle checked={mcp.enabled} onChange={(v) => toggleMcp(mcp.name, v)} />
        </div>
      ))}
    </div>
  )
}

function AgentsSection() {
  const [agents, setAgents] = useState<AgentRow[]>([])

  useEffect(() => {
    let cancelled = false
    window.daemon.agents.list().then((res) => {
      if (!cancelled && res.ok && res.data) setAgents(res.data)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Registered agents and model preferences. Use the Agent Launcher (Ctrl+Shift+A) to create or edit agents.
      </div>

      <div className="settings-agent-list">
        {agents.map((agent) => (
          <div key={agent.id} className="settings-agent-row">
            <span className="settings-agent-name">{agent.name}</span>
            <code className="settings-agent-model">{agent.model}</code>
          </div>
        ))}
        {agents.length === 0 && <div className="settings-empty">No agents configured. Launch one via Ctrl+Shift+A.</div>}
      </div>
    </div>
  )
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface AppCrashEntry {
  id: string
  type: string
  message: string
  stack: string
  created_at: number
}

function CrashesSection() {
  const [crashes, setCrashes] = useState<AppCrashEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback((cancelled = false) => {
    window.daemon.settings.getCrashes().then((res) => {
      if (!cancelled && res.ok && res.data) setCrashes(res.data)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    load(cancelled)
    return () => { cancelled = true }
  }, [load])

  const handleClear = async () => {
    await window.daemon.settings.clearCrashes()
    setCrashes([])
  }

  const now = Date.now()
  const count24h = crashes.filter((c) => now - c.created_at < 86400_000).length
  const count7d = crashes.filter((c) => now - c.created_at < 604800_000).length

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Local crash and error history. No data is sent externally.
      </div>

      <div className="settings-crash-stats">
        <div className="settings-crash-stat">
          <span className="settings-crash-stat-value">{count24h}</span>
          <span className="settings-crash-stat-label">Last 24h</span>
        </div>
        <div className="settings-crash-stat">
          <span className="settings-crash-stat-value">{count7d}</span>
          <span className="settings-crash-stat-label">Last 7 days</span>
        </div>
        <button className="settings-btn danger" onClick={handleClear} disabled={crashes.length === 0}>
          Clear History
        </button>
      </div>

      {crashes.length === 0 ? (
        <div className="settings-empty">No crashes recorded</div>
      ) : (
        <div className="settings-crash-list">
          {crashes.map((crash) => (
            <div key={crash.id} className="settings-crash-row">
              <div
                className="settings-crash-summary"
                onClick={() => setExpandedId(expandedId === crash.id ? null : crash.id)}
              >
                <span className={`settings-crash-type ${crash.type.includes('Exception') || crash.type.includes('error') ? 'error' : 'warn'}`}>
                  {crash.type}
                </span>
                <span className="settings-crash-message">
                  {crash.message.length > 120 ? crash.message.slice(0, 120) + '...' : crash.message}
                </span>
                <span className="settings-crash-time">{formatRelativeTime(crash.created_at)}</span>
                <svg
                  className={`settings-crash-chevron ${expandedId === crash.id ? 'expanded' : ''}`}
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              {expandedId === crash.id && crash.stack && (
                <pre className="settings-crash-stack">{crash.stack}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SetupSection() {
  const handleRerunWizard = async () => {
    const freshProgress = { profile: 'pending' as const, claude: 'pending' as const, gmail: 'pending' as const, vercel: 'pending' as const, railway: 'pending' as const, tour: 'pending' as const }
    await window.daemon.settings.setOnboardingComplete(false)
    await window.daemon.settings.setOnboardingProgress(freshProgress)
    // Reset in-memory progress before opening so progress dots start clean
    useOnboardingStore.setState({ progress: freshProgress })
    useOnboardingStore.getState().openWizard()
  }

  const handleStartTour = () => {
    useOnboardingStore.getState().startTour()
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Re-run the setup wizard or take the app tour again.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="settings-btn primary" onClick={handleRerunWizard}>
          Re-run Setup Wizard
        </button>
        <button className="settings-btn" onClick={handleStartTour}>
          Take App Tour
        </button>
      </div>
    </div>
  )
}

const PROFILE_OPTIONS: { name: WorkspaceProfileName; label: string }[] = [
  { name: 'web', label: 'Web' },
  { name: 'solana', label: 'Solana' },
  { name: 'custom', label: 'Custom' },
]

function DisplaySection() {
  const [showMarketTape, setShowMarketTape] = useState(true)
  const [showTitlebarWallet, setShowTitlebarWallet] = useState(true)

  const profileName = useWorkspaceProfileStore((s) => s.profileName)
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const setProfile = useWorkspaceProfileStore((s) => s.setProfile)
  const setToolVisible = useWorkspaceProfileStore((s) => s.setToolVisible)

  useEffect(() => {
    let cancelled = false
    window.daemon.settings.getUi().then((res) => {
      if (!cancelled && res.ok && res.data) {
        setShowMarketTape(res.data.showMarketTape)
        setShowTitlebarWallet(res.data.showTitlebarWallet)
      }
    })
    return () => { cancelled = true }
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
        <Toggle checked={showMarketTape} onChange={handleToggleMarketTape} />
      </div>

      <div className="settings-display-row">
        <span className="settings-display-label">Titlebar wallet balance</span>
        <span className="settings-display-hint">Show portfolio value in the titlebar</span>
        <Toggle checked={showTitlebarWallet} onChange={handleToggleTitlebarWallet} />
      </div>

      <div className="settings-divider" />

      <div className="settings-section-label">Workspace Profile</div>
      <div className="settings-section-desc">
        Control which tools are visible in the sidebar and tool drawer.
      </div>

      <div className="settings-profile-selector">
        {PROFILE_OPTIONS.map(({ name, label }) => (
          <button
            key={name}
            className={`settings-profile-btn${profileName === name ? ' active' : ''}`}
            onClick={() => setProfile(name)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-section-label" style={{ marginTop: 16 }}>Tool Visibility</div>
      {BUILTIN_TOOLS.map((tool) => {
        const isVisible = toolVisibility[tool.id] ?? true
        const isAlwaysOn = tool.id === 'settings'
        return (
          <div key={tool.id} className="settings-display-row">
            <span className="settings-display-label">{TOOL_NAMES[tool.id] ?? tool.name}</span>
            <span className="settings-display-hint">{tool.description}</span>
            <Toggle
              checked={isAlwaysOn ? true : isVisible}
              onChange={(v) => !isAlwaysOn && setToolVisible(tool.id, v)}
            />
          </div>
        )
      })}
    </div>
  )
}
