import { useCallback, useEffect, useState } from 'react'
import { useNotificationsStore } from '../../store/notifications'
import { Badge } from '../../components/Panel'
import basedbidLogo from '../../assets/basedbid-logo.svg'
import '../_solana/solanaSurface.css'

const EMPTY_SETTINGS: TokenLaunchSettings = {
  raydium: {
    configId: '',
    quoteMint: '',
  },
  meteora: {
    configId: '',
    quoteMint: '',
    baseSupply: '',
  },
  printr: {
    apiBaseUrl: '',
    apiKey: '',
    quotePath: '',
    createPath: '',
    chain: '',
  },
  openbid: {
    apiBaseUrl: '',
    chainId: '',
    dex: '',
    feeTier: '',
    packageType: '',
    marketCap: '',
    totalSupply: '',
    maxAllocationPerUser: '',
    referrer: '',
    board: '',
    boardOwner: '',
  },
}

type LaunchpadMap = Record<LaunchpadId, LaunchpadDefinition>

const BASEDBID_FEE_TIER_OPTIONS = [
  ['0', '1%'],
  ['1', '2%'],
  ['2', '4%'],
  ['3', '6%'],
] as const

function getBasedbidFeeTierOptions(dex: TokenLaunchSettings['openbid']['dex']) {
  return dex === 'raydium'
    ? BASEDBID_FEE_TIER_OPTIONS.filter(([id]) => id !== '3')
    : BASEDBID_FEE_TIER_OPTIONS
}

function normalizeSettings(value: Partial<TokenLaunchSettings> | null | undefined): TokenLaunchSettings {
  return {
    raydium: {
      ...EMPTY_SETTINGS.raydium,
      ...(value?.raydium ?? {}),
    },
    meteora: {
      ...EMPTY_SETTINGS.meteora,
      ...(value?.meteora ?? {}),
    },
    printr: {
      ...EMPTY_SETTINGS.printr,
      ...(value?.printr ?? {}),
    },
    openbid: {
      ...EMPTY_SETTINGS.openbid,
      ...(value?.openbid ?? {}),
    },
  }
}

function toMap(definitions: LaunchpadDefinition[]): LaunchpadMap {
  return definitions.reduce((acc, definition) => {
    acc[definition.id] = definition
    return acc
  }, {} as LaunchpadMap)
}

function LaunchpadStatusBadge({ definition }: { definition?: LaunchpadDefinition }) {
  if (!definition) return null
  return (
    <Badge tone={definition.enabled ? 'success' : 'warning'}>
      {definition.enabled ? 'Live' : 'Planned'}
    </Badge>
  )
}

export function LaunchpadSettingsSection({
  onSettingsSaved,
  embedded = false,
}: {
  onSettingsSaved?: () => void
  embedded?: boolean
}) {
  const pushError = useNotificationsStore((s) => s.pushError)
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)

  const [draft, setDraft] = useState<TokenLaunchSettings>(EMPTY_SETTINGS)
  const [saved, setSaved] = useState<TokenLaunchSettings>(EMPTY_SETTINGS)
  const [definitions, setDefinitions] = useState<LaunchpadMap>({} as LaunchpadMap)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, launchpadsRes] = await Promise.all([
        window.daemon.settings.getTokenLaunchSettings(),
        window.daemon.launch.listLaunchpads(),
      ])
      const nextSettings = settingsRes.ok && settingsRes.data
        ? normalizeSettings(settingsRes.data)
        : EMPTY_SETTINGS
      setDraft(nextSettings)
      setSaved(nextSettings)
      if (launchpadsRes.ok && launchpadsRes.data) {
        setDefinitions(toMap(launchpadsRes.data))
      }
    } catch (error) {
      pushError(error, 'Token Launch Settings')
    } finally {
      setLoading(false)
    }
  }, [pushError])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await window.daemon.settings.setTokenLaunchSettings(draft)
      if (!res.ok) throw new Error(res.error || 'Failed to save token launch settings')
      const launchpadsRes = await window.daemon.launch.listLaunchpads()
      if (launchpadsRes.ok && launchpadsRes.data) {
        setDefinitions(toMap(launchpadsRes.data))
      }
      setSaved(draft)
      pushSuccess('Launchpad settings saved', 'Token Launch')
      onSettingsSaved?.()
    } catch (error) {
      pushError(error, 'Token Launch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="solana-launchpad-settings">
      {!embedded && (
        <div className="solana-launchpad-settings-header">
          <div>
            <div className="solana-token-launch-kicker">Launchpad Settings</div>
            <h2 className="solana-token-launch-title">Enable LaunchLab and DBC in-app</h2>
            <p className="solana-launchpad-settings-copy">
              Store protocol config once, keep env fallback in place, and let the unified Token Launch tool resolve readiness from DAEMON state.
            </p>
          </div>
          <div className="sol-actions">
            <button type="button" className="sol-btn" onClick={() => { void load() }} disabled={loading || saving}>Reload</button>
            <button type="button" className="sol-btn sol-btn--primary" onClick={handleSave} disabled={loading || saving || !isDirty}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="solana-launchpad-settings-compact-head">
          <div>
            <div className="solana-token-launch-card-title">Launchpad config</div>
            <div className="solana-token-launch-card-copy">
              Save the protocol config once here and the launch flow will pick it up automatically.
            </div>
          </div>
          <div className="sol-actions">
            <button type="button" className="sol-btn" onClick={() => { void load() }} disabled={loading || saving}>Reload</button>
            <button type="button" className="sol-btn sol-btn--primary" onClick={handleSave} disabled={loading || saving || !isDirty}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="solana-launchpad-settings-grid">
        <div className="solana-launchpad-settings-card">
          <div className="solana-launchpad-settings-top">
            <div>
              <h3 className="solana-launchpad-settings-name">Raydium LaunchLab</h3>
              <p className="solana-launchpad-settings-desc">LaunchLab needs a config account before Raydium launches can be enabled from the shared launcher.</p>
            </div>
            <LaunchpadStatusBadge definition={definitions.raydium} />
          </div>
          <div className="solana-launchpad-settings-fields">
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Config ID</span>
              <input
                className="solana-launchpad-input"
                value={draft.raydium.configId}
                onChange={(e) => setDraft((prev) => ({ ...prev, raydium: { ...prev.raydium, configId: e.target.value } }))}
                placeholder="LaunchLab config public key"
              />
              <span className="solana-launchpad-field-hint">Required. Leave blank only if `RAYDIUM_LAUNCHLAB_CONFIG` already exists in env.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Quote Mint</span>
              <input
                className="solana-launchpad-input"
                value={draft.raydium.quoteMint}
                onChange={(e) => setDraft((prev) => ({ ...prev, raydium: { ...prev.raydium, quoteMint: e.target.value } }))}
                placeholder="Optional, defaults to SOL"
              />
              <span className="solana-launchpad-field-hint">Optional. Wrapped SOL is used when empty.</span>
            </label>
          </div>
          {definitions.raydium?.reason && <div className="solana-launchpad-settings-note">{definitions.raydium.reason}</div>}
        </div>

        <div className="solana-launchpad-settings-card">
          <div className="solana-launchpad-settings-top">
            <div>
              <h3 className="solana-launchpad-settings-name">Meteora DBC</h3>
              <p className="solana-launchpad-settings-desc">DBC launches need a config account and optional supply tuning before they can be enabled from the shared launcher.</p>
            </div>
            <LaunchpadStatusBadge definition={definitions.meteora} />
          </div>
          <div className="solana-launchpad-settings-fields">
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Config ID</span>
              <input
                className="solana-launchpad-input"
                value={draft.meteora.configId}
                onChange={(e) => setDraft((prev) => ({ ...prev, meteora: { ...prev.meteora, configId: e.target.value } }))}
                placeholder="DBC config public key"
              />
              <span className="solana-launchpad-field-hint">Required. Leave blank only if `METEORA_DBC_CONFIG` is already set in env.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Quote Mint</span>
              <input
                className="solana-launchpad-input"
                value={draft.meteora.quoteMint}
                onChange={(e) => setDraft((prev) => ({ ...prev, meteora: { ...prev.meteora, quoteMint: e.target.value } }))}
                placeholder="Optional, defaults to SOL"
              />
              <span className="solana-launchpad-field-hint">Optional. Wrapped SOL is used when empty.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Base Supply</span>
              <input
                className="solana-launchpad-input"
                value={draft.meteora.baseSupply}
                onChange={(e) => setDraft((prev) => ({ ...prev, meteora: { ...prev.meteora, baseSupply: e.target.value } }))}
                placeholder="Optional raw base supply"
              />
              <span className="solana-launchpad-field-hint">Optional. The adapter baseline is used when empty.</span>
            </label>
          </div>
          {definitions.meteora?.reason && <div className="solana-launchpad-settings-note">{definitions.meteora.reason}</div>}
        </div>

        <div className="solana-launchpad-settings-card">
          <div className="solana-launchpad-settings-top">
            <div>
              <h3 className="solana-launchpad-settings-name">Printr Beta</h3>
              <p className="solana-launchpad-settings-desc">Printr launches are API-driven. Store partner API config here so DAEMON can preflight and submit launches without assuming a public Solana SDK.</p>
            </div>
            <LaunchpadStatusBadge definition={definitions.printr} />
          </div>
          <div className="solana-launchpad-settings-fields">
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">API Base URL</span>
              <input
                className="solana-launchpad-input"
                value={draft.printr.apiBaseUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, printr: { ...prev.printr, apiBaseUrl: e.target.value } }))}
                placeholder="https://api-preview.printr.money"
              />
              <span className="solana-launchpad-field-hint">Required unless `PRINTR_API_BASE_URL` already exists in env.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">API Key</span>
              <input
                className="solana-launchpad-input"
                value={draft.printr.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, printr: { ...prev.printr, apiKey: e.target.value } }))}
                placeholder="Partner API key"
              />
              <span className="solana-launchpad-field-hint">Required unless `PRINTR_API_KEY` already exists in env.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Quote Path</span>
              <input
                className="solana-launchpad-input"
                value={draft.printr.quotePath}
                onChange={(e) => setDraft((prev) => ({ ...prev, printr: { ...prev.printr, quotePath: e.target.value } }))}
                placeholder="/quote"
              />
              <span className="solana-launchpad-field-hint">Optional. Use this if Printr exposes a dedicated quote endpoint for launch cost estimation.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Create Path</span>
              <input
                className="solana-launchpad-input"
                value={draft.printr.createPath}
                onChange={(e) => setDraft((prev) => ({ ...prev, printr: { ...prev.printr, createPath: e.target.value } }))}
                placeholder="/create"
              />
              <span className="solana-launchpad-field-hint">Optional. Override only if Printr provides a different create endpoint path.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Chain ID</span>
              <input
                className="solana-launchpad-input"
                value={draft.printr.chain}
                onChange={(e) => setDraft((prev) => ({ ...prev, printr: { ...prev.printr, chain: e.target.value } }))}
                placeholder="solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
              />
              <span className="solana-launchpad-field-hint">Optional. Solana mainnet Printr chain id is used when empty.</span>
            </label>
          </div>
          {definitions.printr?.reason && <div className="solana-launchpad-settings-note">{definitions.printr.reason}</div>}
        </div>

        <div className="solana-launchpad-settings-card">
          <div className="solana-launchpad-settings-top">
            <div>
              <div className="solana-launchpad-brand-row">
                <img className="solana-launchpad-brand-mark" src={basedbidLogo} alt="" />
                <h3 className="solana-launchpad-settings-name">basedbid</h3>
              </div>
              <p className="solana-launchpad-settings-desc">basedbid uses API-built Solana Pool/LBP transactions. DAEMON signs the returned launch transaction with the selected local wallet.</p>
            </div>
            <LaunchpadStatusBadge definition={definitions.openbid} />
          </div>
          <div className="solana-launchpad-settings-fields">
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">API Base URL</span>
              <input
                className="solana-launchpad-input"
                value={draft.openbid.apiBaseUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, apiBaseUrl: e.target.value } }))}
                placeholder="https://cdn.based.bid/api"
              />
              <span className="solana-launchpad-field-hint">Optional. basedbid CDN API is used when empty.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Chain ID</span>
              <input
                className="solana-launchpad-input"
                value={draft.openbid.chainId}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, chainId: e.target.value } }))}
                placeholder="5011"
              />
              <span className="solana-launchpad-field-hint">Optional. basedbid Solana currently targets devnet chain 5011.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">DEX</span>
              <select
                className="solana-launchpad-input"
                value={draft.openbid.dex}
                onChange={(e) => setDraft((prev) => {
                  const dex = e.target.value as TokenLaunchSettings['openbid']['dex']
                  return {
                    ...prev,
                    openbid: {
                      ...prev.openbid,
                      dex,
                      feeTier: dex === 'raydium' && prev.openbid.feeTier === '3' ? '2' : prev.openbid.feeTier,
                    },
                  }
                })}
              >
                <option value="">Meteora</option>
                <option value="meteora">Meteora</option>
                <option value="raydium">Raydium</option>
              </select>
              <span className="solana-launchpad-field-hint">Optional. Meteora is used when empty.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Fee Tier</span>
              <select
                className="solana-launchpad-input"
                value={draft.openbid.feeTier}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, feeTier: e.target.value } }))}
              >
                <option value="">2%</option>
                {getBasedbidFeeTierOptions(draft.openbid.dex).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <span className="solana-launchpad-field-hint">Optional. basedbid fee tier 1 is used when empty.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Package</span>
              <select
                className="solana-launchpad-input"
                value={draft.openbid.packageType}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, packageType: e.target.value as TokenLaunchSettings['openbid']['packageType'] } }))}
              >
                <option value="">Based</option>
                <option value="based">Based</option>
                <option value="super_based">Super Based</option>
                <option value="ultra_based">Ultra Based</option>
              </select>
              <span className="solana-launchpad-field-hint">Optional. Based package is used when empty.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Market Cap</span>
              <input
                className="solana-launchpad-input"
                value={draft.openbid.marketCap}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, marketCap: e.target.value } }))}
                placeholder="11000"
              />
              <span className="solana-launchpad-field-hint">Optional. Use a target between 11000 and 10000000.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Total Supply</span>
              <input
                className="solana-launchpad-input"
                value={draft.openbid.totalSupply}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, totalSupply: e.target.value } }))}
                placeholder="1000000000"
              />
              <span className="solana-launchpad-field-hint">Optional. Numeric string with 9 token decimals.</span>
            </label>
            <label className="solana-launchpad-field">
              <span className="solana-launchpad-label">Max Allocation</span>
              <input
                className="solana-launchpad-input"
                value={draft.openbid.maxAllocationPerUser}
                onChange={(e) => setDraft((prev) => ({ ...prev, openbid: { ...prev.openbid, maxAllocationPerUser: e.target.value } }))}
                placeholder="0"
              />
              <span className="solana-launchpad-field-hint">Optional. Use 0 for no per-wallet allocation cap.</span>
            </label>
          </div>
          {definitions.openbid?.reason && <div className="solana-launchpad-settings-note">{definitions.openbid.reason}</div>}
        </div>
      </div>

      <div className="solana-launchpad-settings-note">
        Bonk remains disabled on purpose. It is still being treated as a LaunchLab partner path until the exact official integration contract is confirmed.
      </div>
    </section>
  )
}

export default LaunchpadSettingsSection
