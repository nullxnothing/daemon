import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useOnboardingStore } from '../../store/onboarding'
import { useWalletStore } from '../../store/wallet'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useNotificationsStore } from '../../store/notifications'
import { Toggle } from '../../components/Toggle'
import { PanelHeader } from '../../components/Panel'
import { BUILTIN_TOOLS, TOOL_NAMES } from '../../components/CommandDrawer/CommandDrawer'
import { KeyboardShortcuts } from '../../components/KeyboardShortcuts'
import { NavigationGuide } from '../../components/NavigationGuide'
import { isToolDisableable } from '../../constants/toolRegistry'
import {
  readRightSidebarWidgetConfig,
  RIGHT_SIDEBAR_WIDGET_EVENT,
  RIGHT_SIDEBAR_WIDGETS,
  setRightSidebarWidgetEnabled,
  writeRightSidebarWidgetConfig,
  type RightSidebarWidgetConfig,
} from '../RightPanel/sidebarAgentWidgetConfig'
import type { VoightPrivacyLevel, VoightStatus, WorkspaceProfileName } from '../../../electron/shared/types'
import './SettingsPanel.css'


type SettingsTab = 'keys' | 'integrations' | 'aiProviders' | 'agents' | 'tools' | 'sidePanels' | 'display' | 'setup' | 'shortcuts' | 'help' | 'crashes'

// Single-word labels so the tab row stays on one line at every responsive tier.
const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  keys: 'Keys',
  integrations: 'Integrations',
  aiProviders: 'Providers',
  agents: 'Agents',
  tools: 'Tools',
  sidePanels: 'Panels',
  display: 'Display',
  setup: 'Setup',
  shortcuts: 'Shortcuts',
  help: 'Help',
  crashes: 'Crashes',
}

const SETTINGS_TAB_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
  { label: 'Connections', tabs: ['keys', 'integrations', 'aiProviders'] },
  { label: 'Workspace', tabs: ['agents', 'tools', 'sidePanels', 'display'] },
  { label: 'System', tabs: ['setup', 'shortcuts', 'help', 'crashes'] },
]

interface AppMeta {
  version: string
  electronVersion: string
  platform: string
  updateChannel: string
  releaseUrl: string
}

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

// Lookup table mapping common search keywords to the tab they live in
const SEARCH_INDEX: { tab: SettingsTab; keywords: string[] }[] = [
  { tab: 'keys', keywords: ['key', 'api', 'token', 'secret', 'helius', 'openai', 'anthropic', 'birdeye', 'gemini'] },
  { tab: 'integrations', keywords: ['integration', 'claude', 'codex', 'mcp', 'voight', 'observability', 'sign in', 'login', 'connect', 'subscription', 'cli'] },
  { tab: 'aiProviders', keywords: ['ai provider', 'provider', 'default provider', 'aria', 'daemon ai', 'codex', 'claude', 'model'] },
  { tab: 'agents', keywords: ['agent', 'provider', 'default provider', 'model', 'system prompt'] },
  { tab: 'tools', keywords: ['tool', 'tools', 'extra tools', 'disable tools', 'sidebar', 'command drawer', 'profile', 'workspace'] },
  { tab: 'sidePanels', keywords: ['side panel', 'side panels', 'right panel', 'right sidebar', 'widget', 'widgets', 'spawn agent', 'wallet snapshot'] },
  { tab: 'display', keywords: ['display', 'theme', 'color', 'font', 'titlebar', 'wallet', 'tape', 'market', 'performance', 'low power', 'polling', 'animations'] },
  { tab: 'setup', keywords: ['setup', 'wizard', 'onboarding'] },
  { tab: 'shortcuts', keywords: ['shortcut', 'keyboard', 'hotkey', 'keybind', 'ctrl', 'cmd', 'key binding'] },
  { tab: 'help', keywords: ['help', 'guide', 'navigation', 'how to', 'sidebar', 'drawer', 'palette'] },
  { tab: 'crashes', keywords: ['crash', 'error', 'log', 'recovery'] },
]

function findTabForQuery(query: string): SettingsTab | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  for (const entry of SEARCH_INDEX) {
    if (entry.keywords.some((k) => k.includes(q) || q.includes(k))) return entry.tab
  }
  return null
}

export function SettingsPanel() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const [tab, setTab] = useState<SettingsTab>('setup')
  const [search, setSearch] = useState('')

  const handleSearchChange = (value: string) => {
    setSearch(value)
    const matchedTab = findTabForQuery(value)
    if (matchedTab) setTab(matchedTab)
  }

  return (
    <div className="settings-center">
      <PanelHeader
        title="Settings"
        actions={
          <input
            type="text"
            className="settings-search"
            placeholder="Search settings..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search settings"
          />
        }
      />

      <div className="settings-shell">
        <nav className="settings-snav" role="tablist" aria-label="Settings sections">
          {SETTINGS_TAB_GROUPS.map((group) => (
            <div key={group.label} className="settings-snav-group">
              <div className="label settings-snav-label">{group.label}</div>
              {group.tabs.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  data-tab={t}
                  className={`settings-snav-item ${tab === t ? 'on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); setTab(t) }}
                >
                  {SETTINGS_TAB_LABELS[t]}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="settings-body">
          {tab === 'keys' && <KeysSection />}
          {tab === 'integrations' && <IntegrationsSection projectPath={activeProjectPath} />}
          {tab === 'aiProviders' && <AIProvidersSection />}
          {tab === 'agents' && <AgentsSection />}
          {tab === 'tools' && <ToolVisibilitySection />}
          {tab === 'sidePanels' && <SidePanelsSection />}
          {tab === 'display' && <DisplaySection />}
          {tab === 'setup' && <SetupSection />}
          {tab === 'shortcuts' && <KeyboardShortcuts />}
          {tab === 'help' && <NavigationGuide />}
          {tab === 'crashes' && <CrashesSection />}
        </div>
      </div>
    </div>
  )
}

function KeysSection() {
  const [keys, setKeys] = useState<SecureKeyEntry[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback((isCancelled: () => boolean = () => false) => {
    window.daemon.claude.listKeys().then((res) => {
      if (!isCancelled() && res.ok && res.data) setKeys(res.data)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
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
            <button type="button" className="settings-btn danger" onClick={() => handleDelete(k.key_name)}>Remove</button>
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
        <button type="button" className="settings-btn primary" onClick={handleSave} disabled={saving || !newKeyName.trim() || !newKeyValue.trim()}>
          {saving ? 'Saving...' : 'Add Key'}
        </button>
      </div>
      <div className="settings-section-desc tight">
        Key names: uppercase letters, numbers, and underscores only.
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

  const load = useCallback((isCancelled: () => boolean = () => false) => {
    if (projectPath) {
      window.daemon.claude.projectMcpAll(projectPath).then((res) => {
        if (!isCancelled() && res.ok && res.data) setMcps(res.data)
      })
    }
    window.daemon.claude.verifyConnection().then((res) => {
      if (!isCancelled() && res.ok && res.data) setConnection(res.data)
    })
  }, [projectPath])

  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
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
    // Auto-clear waiting state after 30s in case the OAuth flow stalls or
    // the user closes the browser without completing it.
    const timeoutId = window.setTimeout(() => {
      setSigningIn(false)
      useNotificationsStore.getState().pushInfo(
        'Sign-in is still pending. Click "Sign in with Claude" again if needed.',
        'Claude',
      )
    }, 30000)
    try {
      await window.daemon.claude.authLogin()
    } catch (err) {
      useNotificationsStore.getState().pushError(err, 'Claude sign-in')
    } finally {
      window.clearTimeout(timeoutId)
      setSigningIn(false)
      load()
    }
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
          <span className="settings-integration-status path">
            {connection.claudePath}
          </span>
        </div>
      )}

      <div className="settings-actions-row">
        {isConnected ? (
          <button type="button" className="settings-btn danger" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <>
            <button type="button" className="settings-btn primary" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? 'Waiting...' : 'Sign in with Claude'}
            </button>
            <button type="button" className="settings-btn" onClick={() => setShowApiInput(!showApiInput)}>
              {showApiInput ? 'Cancel' : 'Use API Key'}
            </button>
          </>
        )}
      </div>

      {showApiInput && !isConnected && (
        <div className="settings-inline-row">
          <input
            className="settings-input"
            type="password"
            placeholder="sk-ant-api03-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveApiKey()}
          />
          <button type="button" className="settings-btn primary" onClick={handleSaveApiKey} disabled={savingKey || !apiKeyInput.trim()}>
            {savingKey ? '...' : 'Save'}
          </button>
        </div>
      )}

      <div className="settings-divider" />

      <VoightIntegrationCard />

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

function VoightIntegrationCard() {
  const [status, setStatus] = useState<VoightStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.daemon.voight.status()
    if (res.ok && res.data) setStatus(res.data)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveKey = async () => {
    if (!keyInput.trim()) return
    setBusy('save')
    setMessage(null)
    const res = await window.daemon.voight.storeKey(keyInput.trim())
    setBusy(null)
    if (res.ok && res.data) {
      setStatus(res.data)
      setKeyInput('')
      setMessage('Voight key saved')
    } else {
      setMessage(res.error ?? 'Could not save Voight key')
    }
  }

  const deleteKey = async () => {
    setBusy('delete')
    setMessage(null)
    const res = await window.daemon.voight.deleteKey()
    setBusy(null)
    if (res.ok && res.data) {
      setStatus(res.data)
      setMessage('Voight key removed')
    } else {
      setMessage(res.error ?? 'Could not remove Voight key')
    }
  }

  const testEvent = async () => {
    setBusy('test')
    setMessage(null)
    const res = await window.daemon.voight.testEvent()
    setBusy(null)
    if (res.ok && res.data) {
      setMessage(`Test event accepted (${res.data.status})`)
      await refresh()
    } else {
      setMessage(res.error ?? 'Voight test event failed')
    }
  }

  const setPrivacy = async (privacyLevel: VoightPrivacyLevel) => {
    setBusy('privacy')
    const res = await window.daemon.voight.setPrivacyLevel(privacyLevel)
    setBusy(null)
    if (res.ok && res.data) setStatus(res.data)
    else setMessage(res.error ?? 'Could not update privacy level')
  }

  const connected = status?.configured === true
  const privacyLevel = status?.privacyLevel ?? 'standard'

  return (
    <>
      <div className="settings-section-label">Voight Observability</div>
      <div className="settings-section-desc">
        Stream DAEMON agent runs, tools, terminal activity, file actions, transactions, and errors into Voight.
      </div>

      <div className="settings-integration-row">
        <div className={`settings-integration-dot ${connected ? 'green' : ''}`} />
        <span className="settings-integration-name">Status</span>
        <span className="settings-integration-status">
          {connected ? `Connected via ${status?.keySource}` : 'Not configured'}
        </span>
      </div>

      <div className="settings-display-row settings-provider-pref-row">
        <span className="settings-display-label">Privacy</span>
        <span className="settings-display-hint">Sender-side scrubbing before events are queued or posted.</span>
        <select
          className="settings-provider-select"
          value={privacyLevel}
          disabled={busy === 'privacy'}
          onChange={(event) => setPrivacy(event.target.value as VoightPrivacyLevel)}
        >
          <option value="minimal">minimal</option>
          <option value="standard">standard</option>
          <option value="full">full</option>
        </select>
      </div>

      <div className="settings-inline-row">
        <input
          className="settings-input"
          type="password"
          placeholder="vk_..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveKey()}
        />
        <button type="button" className="settings-btn primary" onClick={saveKey} disabled={busy === 'save' || !keyInput.trim()}>
          {busy === 'save' ? 'Saving...' : 'Save Key'}
        </button>
        <button type="button" className="settings-btn" onClick={testEvent} disabled={busy === 'test' || !connected}>
          {busy === 'test' ? 'Sending...' : 'Test Event'}
        </button>
        <button type="button" className="settings-btn danger" onClick={deleteKey} disabled={busy === 'delete' || !connected}>
          Remove
        </button>
      </div>

      {status && (
        <div className="settings-section-desc tight">
          Queue: {status.pending} pending, {status.sent} sent, {status.failed} failed.
          {status.lastError ? ` Last error: ${status.lastError}` : ''}
        </div>
      )}
      {message && <div className="settings-section-desc tight">{message}</div>}
    </>
  )
}

function DefaultProviderSection() {
  const [defaultId, setDefaultId] = useState<'claude' | 'codex'>('claude')
  const [conns, setConns] = useState<{ claude: boolean; codex: boolean }>({ claude: false, codex: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [defRes, connRes] = await Promise.all([
      window.daemon.provider.getDefault(),
      window.daemon.provider.verifyAll(),
    ])
    if (defRes.ok && defRes.data) setDefaultId(defRes.data as 'claude' | 'codex')
    if (connRes.ok && connRes.data) {
      setConns({
        claude: !!connRes.data.claude && (connRes.data.claude.isAuthenticated || connRes.data.claude.authMode !== 'none'),
        codex: !!connRes.data.codex && (connRes.data.codex.isAuthenticated || connRes.data.codex.authMode !== 'none'),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handlePick = async (id: 'claude' | 'codex') => {
    setError(null)
    const res = await window.daemon.provider.setDefault(id)
    if (res.ok) {
      setDefaultId(id)
    } else {
      setError(res.error ?? 'Failed to set default')
    }
  }

  const authedCount = Number(conns.claude) + Number(conns.codex)

  return (
    <>
      <div className="settings-section-label">Default Provider</div>
      <div className="settings-section-desc">
        Used when an agent is set to "auto". Switching mid-session only affects new agents.
      </div>

      {loading ? (
        <div className="settings-empty">Checking...</div>
      ) : (
        <>
          <div className="settings-provider-grid">
            {(['claude', 'codex'] as const).map((id) => {
              const isAuthed = conns[id]
              const isActive = defaultId === id
              return (
                <button
                  key={id}
                  onClick={() => handlePick(id)}
                  disabled={!isAuthed && authedCount > 0}
                  title={!isAuthed ? `Sign in to ${id} to enable` : ''}
                  className={`settings-provider-btn${isActive ? ' active' : ''}`}
                >
                  <span className={`settings-provider-dot${isAuthed ? ' connected' : ''}`} />
                  {id}
                </button>
              )
            })}
          </div>
          {authedCount === 0 && (
            <div className="settings-section-desc settings-inline-note warn">
              Not signed in to any provider. Sign in below to start spawning agents.
            </div>
          )}
          {error && (
            <div className="settings-section-desc settings-inline-note error">{error}</div>
          )}
        </>
      )}
    </>
  )
}

function isProviderConnected(connection: ProviderConnectionMap[keyof ProviderConnectionMap]): boolean {
  return Boolean(connection && (connection.isAuthenticated || connection.authMode !== 'none'))
}

function AIProvidersSection() {
  const [preferences, setPreferences] = useState<ProviderPreferences | null>(null)
  const [conns, setConns] = useState<ProviderConnectionMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [prefsRes, connRes] = await Promise.all([
      window.daemon.provider.getPreferences(),
      window.daemon.provider.verifyAll(),
    ])
    if (prefsRes.ok && prefsRes.data) setPreferences(prefsRes.data)
    if (connRes.ok && connRes.data) setConns(connRes.data)
    setError(prefsRes.ok && connRes.ok ? null : prefsRes.error ?? connRes.error ?? 'Failed to load provider settings')
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const save = async (next: ProviderPreferences) => {
    setSaving(true)
    setError(null)
    const res = await window.daemon.provider.setPreferences(next)
    setSaving(false)
    if (res.ok && res.data) {
      setPreferences(res.data)
    } else {
      setError(res.error ?? 'Failed to save provider settings')
    }
  }

  const update = (mutate: (current: ProviderPreferences) => ProviderPreferences) => {
    if (!preferences) return
    void save(mutate(preferences))
  }

  if (!preferences || !conns) return <div className="settings-section"><div className="settings-empty">Checking providers...</div></div>

  const connected = {
    claude: isProviderConnected(conns.claude),
    codex: isProviderConnected(conns.codex),
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Choose which provider powers each AI surface. These choices affect new requests and new agent sessions.
      </div>

      <div className="settings-provider-status-grid">
        {(['claude', 'codex'] as ProviderId[]).map((id) => (
          <div key={id} className="settings-provider-status-card">
            <span className={`settings-provider-dot${connected[id] ? ' connected' : ''}`} />
            <span className="settings-display-label">{id}</span>
            <span className="settings-display-hint">{connected[id] ? conns[id]?.authMode : 'Not connected'}</span>
          </div>
        ))}
      </div>

      <div className="settings-divider" />

      <ProviderPreferenceRow
        label="Aria"
        hint="Small side assistant for navigation, quick answers, and action chips."
        value={preferences.aria.provider}
        connected={connected}
        onChange={(provider) => update((current) => ({ ...current, aria: { ...current.aria, provider } }))}
      />
      <SelectPreferenceRow
        label="Aria model"
        hint="Fast is best for short UI orchestration; standard/reasoning use stronger models."
        value={preferences.aria.model}
        options={['fast', 'standard', 'reasoning']}
        onChange={(model) => update((current) => ({ ...current, aria: { ...current.aria, model: model as ProviderPreferences['aria']['model'] } }))}
      />

      <div className="settings-divider" />

      <SelectPreferenceRow
        label="DAEMON AI access"
        hint="Auto uses hosted when available and falls back to BYOK."
        value={preferences.daemonAi.accessMode}
        options={['auto', 'hosted', 'byok']}
        onChange={(accessMode) => update((current) => ({ ...current, daemonAi: { ...current.daemonAi, accessMode: accessMode as ProviderPreferences['daemonAi']['accessMode'] } }))}
      />
      <ProviderPreferenceRow
        label="DAEMON AI BYOK"
        hint="Provider used when DAEMON AI runs locally through your own account."
        value={preferences.daemonAi.byokProvider}
        connected={connected}
        onChange={(byokProvider) => update((current) => ({ ...current, daemonAi: { ...current.daemonAi, byokProvider } }))}
      />
      <SelectPreferenceRow
        label="DAEMON AI lane"
        hint="Default lane for project-aware chat."
        value={preferences.daemonAi.modelLane}
        options={['auto', 'fast', 'standard', 'reasoning', 'premium']}
        onChange={(modelLane) => update((current) => ({ ...current, daemonAi: { ...current.daemonAi, modelLane: modelLane as ProviderPreferences['daemonAi']['modelLane'] } }))}
      />

      <div className="settings-divider" />

      <ProviderPreferenceRow
        label="Auto agents"
        hint="Default provider for agents configured as auto."
        value={preferences.agents.defaultProvider}
        connected={connected}
        onChange={(defaultProvider) => update((current) => ({ ...current, agents: { defaultProvider } }))}
      />
      <ProviderPreferenceRow
        label="Provider terminal"
        hint="Default provider for future quick terminal shortcuts."
        value={preferences.terminal.defaultProvider}
        connected={connected}
        onChange={(defaultProvider) => update((current) => ({ ...current, terminal: { defaultProvider } }))}
      />

      {saving && <div className="settings-section-desc settings-inline-note">Saving...</div>}
      {error && <div className="settings-section-desc settings-inline-note error">{error}</div>}
    </div>
  )
}

function ProviderPreferenceRow({
  label,
  hint,
  value,
  connected,
  onChange,
}: {
  label: string
  hint: string
  value: ProviderId
  connected: Record<ProviderId, boolean>
  onChange: (provider: ProviderId) => void
}) {
  return (
    <div className="settings-display-row settings-provider-pref-row">
      <span className="settings-display-label">{label}</span>
      <span className="settings-display-hint">{hint}</span>
      <div className="settings-provider-toggle">
        {(['claude', 'codex'] as ProviderId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`settings-provider-mini${value === id ? ' active' : ''}`}
            disabled={!connected[id]}
            onClick={() => onChange(id)}
            title={!connected[id] ? `Connect ${id} first` : id}
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  )
}

function SelectPreferenceRow({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-display-row settings-provider-pref-row">
      <span className="settings-display-label">{label}</span>
      <span className="settings-display-hint">{hint}</span>
      <select className="settings-provider-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
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
        Registered agents and model preferences. Use the Agent Launcher (Ctrl+Shift+A) to create or edit agents. Provider defaults live in AI Providers.
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

  const load = useCallback((isCancelled: () => boolean = () => false) => {
    window.daemon.settings.getCrashes().then((res) => {
      if (!isCancelled() && res.ok && res.data) setCrashes(res.data)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    load(() => cancelled)
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
        <button type="button" className="settings-btn danger" onClick={handleClear} disabled={crashes.length === 0}>
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
              {expandedId === crash.id && (
                <div className="settings-crash-detail">
                  {crash.message.length > 120 && (
                    <pre className="settings-crash-stack spaced">{crash.message}</pre>
                  )}
                  {crash.stack && <pre className="settings-crash-stack">{crash.stack}</pre>}
                  <button
                    onClick={() => navigator.clipboard.writeText([crash.type, crash.message, crash.stack].filter(Boolean).join('\n\n'))}
                    type="button"
                    className="settings-copy-stack-btn"
                  >
                    Copy stack
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SetupSection() {
  const [resettingLayout, setResettingLayout] = useState(false)
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    window.daemon.settings.getAppMeta().then((res) => {
      if (!cancelled && res.ok && res.data) setAppMeta(res.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleRerunWizard = async () => {
    const freshProgress = {
      profile: 'pending' as const,
      project: 'pending' as const,
      runtime: 'pending' as const,
      ai: 'pending' as const,
      firstRun: 'pending' as const,
      tour: 'pending' as const,
    }
    await window.daemon.settings.setOnboardingComplete(false)
    await window.daemon.settings.setOnboardingProgress(freshProgress)
    // Reset in-memory progress before opening so progress dots start clean
    useOnboardingStore.setState({ progress: freshProgress })
    useOnboardingStore.getState().openWizard()
  }

  const handleStartTour = () => {
    useOnboardingStore.getState().startTour()
  }

  const handleResetLayout = async () => {
    setResettingLayout(true)
    try {
      const res = await window.daemon.settings.recoverUiState()
      if (!res.ok) throw new Error(res.error ?? 'Failed to reset UI layout')
      useNotificationsStore.getState().pushToast({
        kind: 'warning',
        context: 'Workspace recovery',
        ttlMs: 5000,
        message: 'UI layout reset. Reloading workspace...',
      })
      window.daemon.window.reload()
    } catch (err) {
      useNotificationsStore.getState().pushError(err, 'Reset UI layout')
      setResettingLayout(false)
    }
  }

  return (
    <div className="settings-section">
      {appMeta && (
        <div className="settings-setup-card">
          <div className="settings-setup-card-head">
            <div>
              <div className="settings-section-label">Release Status</div>
              <div className="settings-section-desc">
                Keep recovery and update trust surfaces in one place.
              </div>
            </div>
            <span className="settings-version-pill">v{appMeta.version}</span>
          </div>

          <div className="settings-setup-meta-grid">
            <div className="settings-setup-meta">
              <span className="settings-setup-meta-label">App</span>
              <strong>DAEMON {appMeta.version}</strong>
            </div>
            <div className="settings-setup-meta">
              <span className="settings-setup-meta-label">Electron</span>
              <strong>{appMeta.electronVersion}</strong>
            </div>
            <div className="settings-setup-meta">
              <span className="settings-setup-meta-label">Channel</span>
              <strong>{appMeta.updateChannel}</strong>
            </div>
          </div>

          <div className="settings-meta-actions">
            <button type="button" className="settings-btn" onClick={() => window.daemon.feedback.openUrl(appMeta.releaseUrl)}>
              Open Latest Release
            </button>
          </div>
        </div>
      )}

      <div className="settings-section-desc">
        Re-run the setup wizard or take the app tour again.
      </div>
      <div className="settings-actions-row">
        <button type="button" className="settings-btn primary" onClick={handleRerunWizard}>
          Re-run Setup Wizard
        </button>
          <button type="button" className="settings-btn" onClick={handleStartTour}>
            Take App Tour
          </button>
        <button type="button" className="settings-btn danger" onClick={handleResetLayout} disabled={resettingLayout}>
          {resettingLayout ? 'Resetting...' : 'Reset UI Layout'}
        </button>
      </div>
      <div className="settings-section-desc settings-inline-note">
        Reset UI Layout clears saved panel/layout state and stale sessions, then reloads DAEMON. Project, wallet, key, and history data stay intact.
      </div>
      <div className="settings-divider" />
      <div className="settings-section-desc">
        Recovery is the right first step if the app opens blank, freezes after launch, or restores into a broken layout.
      </div>
    </div>
  )
}

const PROFILE_OPTIONS: { name: WorkspaceProfileName; label: string }[] = [
  { name: 'web', label: 'Web' },
  { name: 'solana', label: 'Solana' },
  { name: 'custom', label: 'Custom' },
]

function SidePanelsSection() {
  const [config, setConfig] = useState<RightSidebarWidgetConfig>(readRightSidebarWidgetConfig)

  useEffect(() => {
    const refresh = () => setConfig(readRightSidebarWidgetConfig())
    window.addEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(RIGHT_SIDEBAR_WIDGET_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const toggleWidget = (widgetId: keyof RightSidebarWidgetConfig['enabled'], enabled: boolean) => {
    setRightSidebarWidgetEnabled(widgetId, enabled)
    setConfig(readRightSidebarWidgetConfig())
  }

  const enableSuggested = () => {
    writeRightSidebarWidgetConfig({
      ...config,
      enabled: {
        ...config.enabled,
        'project-status': true,
        'wallet-snapshot': true,
        'solana-readiness': true,
        'token-watch': true,
        'zauth': true,
        'meterflow': true,
        'ai-status': true,
      },
    })
    setConfig(readRightSidebarWidgetConfig())
  }

  const disableAll = () => {
    writeRightSidebarWidgetConfig({
      ...config,
      enabled: {
        'project-status': false,
        'wallet-snapshot': false,
        'solana-readiness': false,
        'token-watch': false,
        'zauth': false,
        'meterflow': false,
        'ai-status': false,
        'clawpump': false,
      },
    })
    setConfig(readRightSidebarWidgetConfig())
  }

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Configure the widget stack that appears between the Claude/Codex toggles and ARIA in the right sidebar.
      </div>

      <div className="settings-side-actions">
        <button type="button" className="settings-btn primary" onClick={enableSuggested}>
          Enable Suggested
        </button>
        <button type="button" className="settings-btn" onClick={disableAll}>
          Clear Sidebar
        </button>
      </div>

      <div className="settings-side-list">
        {RIGHT_SIDEBAR_WIDGETS.map((widget) => (
          <div key={widget.id} className="settings-side-row">
            <div className="settings-side-copy">
              <span className="settings-display-label">{widget.name}</span>
              <span className="settings-display-hint">{widget.description}</span>
            </div>
            <Toggle checked={config.enabled[widget.id]} onChange={(v) => toggleWidget(widget.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function DisplaySection() {
  const showMarketTape = useWalletStore((s) => s.showMarketTape)
  const showTitlebarWallet = useWalletStore((s) => s.showTitlebarWallet)
  const lowPowerMode = useWalletStore((s) => s.lowPowerMode)
  const setShowMarketTape = useWalletStore((s) => s.setShowMarketTape)
  const setShowTitlebarWallet = useWalletStore((s) => s.setShowTitlebarWallet)
  const setLowPowerMode = useWalletStore((s) => s.setLowPowerMode)

  const handleToggleMarketTape = (enabled: boolean) => { void setShowMarketTape(enabled) }
  const handleToggleTitlebarWallet = (enabled: boolean) => { void setShowTitlebarWallet(enabled) }
  const handleToggleLowPowerMode = (enabled: boolean) => { void setLowPowerMode(enabled) }

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

      <div className="settings-display-row">
        <span className="settings-display-label">Low power mode</span>
        <span className="settings-display-hint">Reduce panel preloads, background polling, and UI motion for slower computers</span>
        <Toggle checked={lowPowerMode} onChange={handleToggleLowPowerMode} />
      </div>
    </div>
  )
}

function ToolVisibilitySection() {
  const profileName = useWorkspaceProfileStore((s) => s.profileName)
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const setProfile = useWorkspaceProfileStore((s) => s.setProfile)
  const setToolVisible = useWorkspaceProfileStore((s) => s.setToolVisible)
  const disableableTools = BUILTIN_TOOLS.filter((tool) => isToolDisableable(tool.id))
  const visibleCount = disableableTools.filter((tool) => toolVisibility[tool.id] ?? true).length

  return (
    <div className="settings-section">
      <div className="settings-section-desc">
        Disable extra tools from the sidebar and command drawer. Core navigation and Settings stay available.
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

      <div className="settings-tool-summary">
        <span>{visibleCount} of {disableableTools.length} extra tools visible</span>
        <button type="button" className="settings-btn" onClick={() => setProfile('custom')}>
          Show All Tools
        </button>
      </div>

      <div className="settings-section-label settings-tools-label">Extra Tool Visibility</div>
      {disableableTools.map((tool) => {
        const isVisible = toolVisibility[tool.id] ?? true
        return (
          <div key={tool.id} className="settings-display-row">
            <span className="settings-display-label">{TOOL_NAMES[tool.id] ?? tool.name}</span>
            <span className="settings-display-hint">{tool.description}</span>
            <Toggle
              checked={isVisible}
              onChange={(v) => setToolVisible(tool.id, v)}
            />
          </div>
        )
      })}
    </div>
  )
}
