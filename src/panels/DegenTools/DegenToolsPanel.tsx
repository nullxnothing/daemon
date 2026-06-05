import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, ImageSquare, MagnifyingGlass, PaperPlaneTilt, RocketLaunch, Sparkle } from '@phosphor-icons/react'
import { daemon } from '../../lib/daemonBridge'
import { LiveRegion } from '../../components/LiveRegion'
import { PanelHeader } from '../../components/Panel'
import { ProductSurfaceStrip } from '../../components/ProductSurfaceStrip'
import type {
  DegenToolsCopyType,
  DegenToolsMemeType,
  DegenToolsToolResult,
} from '../../../electron/services/DegenToolsService'
import './DegenToolsPanel.css'

const DOCS_URL = 'https://degentools.co/docs'
const API_DASHBOARD_URL = 'https://degentools.co/dashboard/api'
const MEME_TYPES: DegenToolsMemeType[] = ['meme', 'banner', 'pfp', 'sticker']
const COPY_TYPES: DegenToolsCopyType[] = ['shill_tweets', 'raid_messages', 'announcements']

function resultText(result: DegenToolsToolResult | null): string {
  if (!result) return ''
  if (result.text) return result.text
  return result.json ? JSON.stringify(result.json, null, 2) : ''
}

function readString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const current = record[key]
    if (typeof current === 'string') return current
  }
  return ''
}

export function DegenToolsPanel() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [announce, setAnnounce] = useState('')
  const keyInputRef = useRef<HTMLInputElement>(null)

  const checkConfigured = useCallback(async () => {
    const res = await daemon.degentools.isConfigured()
    setConfigured(res.ok ? Boolean(res.data) : false)
  }, [])

  const focusKeyInput = useCallback(() => {
    keyInputRef.current?.focus()
  }, [])

  useEffect(() => { void checkConfigured() }, [checkConfigured])

  if (configured === null) {
    return <div className="dt-panel dt-panel--loading">Loading DegenTools...</div>
  }

  return (
    <div className="dt-panel" data-brand="degentools">
      <PanelHeader
        kicker="DegenTools"
        title="Meme coin launch desk"
        subtitle="Generate launch assets, shill copy, token data, and Bags.fm launch calls through the DegenTools MCP API."
        actions={
          <>
            <Sparkle size={20} weight="duotone" />
            <a className="dt-docs-link" href={DOCS_URL} target="_blank" rel="noreferrer">Docs</a>
          </>
        }
      />

      <LiveRegion message={announce} />

      <ProductSurfaceStrip
        surfaceId="degentools"
        stateLabel={configured ? 'Connected' : 'Needs key'}
        setupLabel={configured ? 'Asset lane ready' : 'API key required'}
        tone={configured ? 'success' : 'warning'}
        primaryLabel={configured ? 'Generate assets' : 'Paste key'}
        onPrimary={configured ? undefined : focusKeyInput}
      />

      {configured
        ? <DegenToolsConsole onAnnounce={setAnnounce} onResetKey={() => setConfigured(false)} />
        : <SetupGate inputRef={keyInputRef} onSaved={() => { void checkConfigured() }} onAnnounce={setAnnounce} />}
    </div>
  )
}

function SetupGate({
  inputRef,
  onSaved,
  onAnnounce,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onSaved: () => void
  onAnnounce: (message: string) => void
}) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = useCallback(async () => {
    const trimmed = key.trim()
    if (!trimmed) { setError('Enter your DegenTools API key.'); return }
    setSaving(true)
    setError('')
    const res = await daemon.degentools.storeKey(trimmed)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'Failed to store key.'); return }
    setKey('')
    onAnnounce('DegenTools API key saved.')
    onSaved()
  }, [key, onAnnounce, onSaved])

  return (
    <section className="dt-setup">
      <h2 className="dt-section-title">Connect DegenTools</h2>
      <p className="dt-setup-copy">
        Open the API dashboard, copy a DegenTools key, then paste it here. DAEMON stores it with the OS keyring and sends it only as
        <code>X-DegenTools-API-Key</code>.
      </p>
      <div className="dt-setup-row">
        <input
          ref={inputRef}
          className="dt-input"
          type="password"
          placeholder="dgt_..."
          value={key}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void save() }}
        />
        <button className="dt-btn dt-btn--primary" type="button" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving...' : 'Save key'}
        </button>
      </div>
      {error && <p className="dt-error">{error}</p>}
      <a className="dt-setup-link" href={API_DASHBOARD_URL} target="_blank" rel="noreferrer">API dashboard</a>
    </section>
  )
}

function DegenToolsConsole({ onAnnounce, onResetKey }: {
  onAnnounce: (message: string) => void
  onResetKey: () => void
}) {
  const [tokenName, setTokenName] = useState('Moon Cat')
  const [tokenTicker, setTokenTicker] = useState('MCAT')
  const [tokenQuery, setTokenQuery] = useState('')
  const [description, setDescription] = useState('The most degenerate cat on Solana')
  const [imageUrl, setImageUrl] = useState('')
  const [prompt, setPrompt] = useState('rocket to the moon')
  const [memeType, setMemeType] = useState<DegenToolsMemeType>('meme')
  const [copyType, setCopyType] = useState<DegenToolsCopyType>('shill_tweets')
  const [copyCount, setCopyCount] = useState(5)
  const [toolsStatus, setToolsStatus] = useState('Not checked')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [memeResult, setMemeResult] = useState<DegenToolsToolResult | null>(null)
  const [copyResult, setCopyResult] = useState<DegenToolsToolResult | null>(null)
  const [tokenResult, setTokenResult] = useState<DegenToolsToolResult | null>(null)
  const [launchResult, setLaunchResult] = useState<DegenToolsToolResult | null>(null)

  const generatedImageUrl = useMemo(() => (
    readString(memeResult?.json, ['image_url', 'imageUrl', 'url']) || imageUrl
  ), [imageUrl, memeResult])

  const requireToken = useCallback(() => {
    if (!tokenName.trim()) throw new Error('Token name is required')
    if (!tokenTicker.trim()) throw new Error('Ticker is required')
  }, [tokenName, tokenTicker])

  const run = useCallback(async (
    id: string,
    task: () => Promise<void>,
  ) => {
    setBusy(id)
    setError('')
    try {
      await task()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DegenTools request failed'
      setError(message)
      onAnnounce(message)
    } finally {
      setBusy(null)
    }
  }, [onAnnounce])

  const checkTools = useCallback(async () => {
    await run('tools', async () => {
      const res = await daemon.degentools.tools()
      if (!res.ok) throw new Error(res.error ?? 'Failed to load DegenTools tools')
      const text = JSON.stringify(res.data)
      const count = (text.match(/"name"/g) ?? []).length
      setToolsStatus(count > 0 ? `${count} tools available` : 'MCP endpoint online')
      onAnnounce('DegenTools MCP endpoint online.')
    })
  }, [onAnnounce, run])

  const generateMeme = useCallback(async () => {
    await run('meme', async () => {
      requireToken()
      if (!prompt.trim()) throw new Error('Prompt is required')
      const res = await daemon.degentools.generateMeme({
        prompt: prompt.trim(),
        token_name: tokenName.trim(),
        token_ticker: tokenTicker.trim(),
        type: memeType,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Meme generation failed')
      setMemeResult(res.data)
      const url = readString(res.data.json, ['image_url', 'imageUrl', 'url'])
      if (url) setImageUrl(url)
      onAnnounce('Meme generated.')
    })
  }, [memeType, onAnnounce, prompt, requireToken, run, tokenName, tokenTicker])

  const generateCopy = useCallback(async () => {
    await run('copy', async () => {
      requireToken()
      const res = await daemon.degentools.generateShillCopy({
        token_name: tokenName.trim(),
        token_ticker: tokenTicker.trim(),
        copy_type: copyType,
        count: copyCount,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Copy generation failed')
      setCopyResult(res.data)
      onAnnounce('Copy generated.')
    })
  }, [copyCount, copyType, onAnnounce, requireToken, run, tokenName, tokenTicker])

  const fetchTokenData = useCallback(async () => {
    await run('token', async () => {
      const query = tokenQuery.trim() || tokenTicker.trim()
      if (!query) throw new Error('Token query is required')
      const res = await daemon.degentools.getTokenData({ query })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Token data request failed')
      setTokenResult(res.data)
      onAnnounce('Token data loaded.')
    })
  }, [onAnnounce, run, tokenQuery, tokenTicker])

  const launchToken = useCallback(async () => {
    await run('launch', async () => {
      requireToken()
      if (!description.trim()) throw new Error('Description is required')
      if (!imageUrl.trim()) throw new Error('Image URL is required')
      if (!window.confirm('Send launch_token to DegenTools for Bags.fm?')) return
      const res = await daemon.degentools.launchToken({
        name: tokenName.trim(),
        symbol: tokenTicker.trim(),
        description: description.trim(),
        image_url: imageUrl.trim(),
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Launch request failed')
      setLaunchResult(res.data)
      onAnnounce('Launch request sent.')
    })
  }, [description, imageUrl, onAnnounce, requireToken, run, tokenName, tokenTicker])

  const clearKey = useCallback(async () => {
    if (!window.confirm('Disconnect DegenTools and remove the stored API key?')) return
    const res = await daemon.degentools.clearKey()
    if (res.ok) {
      onAnnounce('DegenTools disconnected.')
      onResetKey()
    }
  }, [onAnnounce, onResetKey])

  const copyOutput = useCallback(async (text: string) => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    onAnnounce('Copied.')
  }, [onAnnounce])

  return (
    <div className="dt-console">
      <section className="dt-toolbar">
        <div>
          <span className="dt-label">MCP</span>
          <strong>{toolsStatus}</strong>
        </div>
        <div className="dt-toolbar-actions">
          <button className="dt-btn dt-btn--ghost" type="button" onClick={() => void checkTools()} disabled={busy === 'tools'}>
            <MagnifyingGlass size={15} /> {busy === 'tools' ? 'Checking...' : 'Check tools'}
          </button>
          <button className="dt-btn dt-btn--ghost" type="button" onClick={() => void clearKey()}>Disconnect</button>
        </div>
      </section>

      {error && <p className="dt-error dt-error--bar">{error}</p>}

      <div className="dt-grid">
        <section className="dt-card dt-card--profile">
          <h2 className="dt-section-title">Token profile</h2>
          <div className="dt-form-grid">
            <label>
              <span>Name</span>
              <input className="dt-input" value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
            </label>
            <label>
              <span>Ticker</span>
              <input className="dt-input" value={tokenTicker} onChange={(event) => setTokenTicker(event.target.value.toUpperCase())} />
            </label>
            <label className="dt-wide">
              <span>Description</span>
              <textarea className="dt-textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="dt-wide">
              <span>Image URL</span>
              <input className="dt-input" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." />
            </label>
            <label className="dt-wide">
              <span>Token query</span>
              <input className="dt-input" value={tokenQuery} onChange={(event) => setTokenQuery(event.target.value)} placeholder="Ticker or contract address" />
            </label>
          </div>
        </section>

        <section className="dt-card">
          <h2 className="dt-section-title">Meme generator</h2>
          <label className="dt-stack">
            <span>Prompt</span>
            <textarea className="dt-textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          <div className="dt-action-row">
            <select className="dt-select" value={memeType} onChange={(event) => setMemeType(event.target.value as DegenToolsMemeType)}>
              {MEME_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button className="dt-btn dt-btn--primary" type="button" onClick={() => void generateMeme()} disabled={busy === 'meme'}>
              <ImageSquare size={15} /> {busy === 'meme' ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {generatedImageUrl && <img className="dt-preview" src={generatedImageUrl} alt={`${tokenTicker} generated asset`} />}
          <ResultBlock result={memeResult} onCopy={copyOutput} />
        </section>

        <section className="dt-card">
          <h2 className="dt-section-title">Copy studio</h2>
          <div className="dt-action-row">
            <select className="dt-select" value={copyType} onChange={(event) => setCopyType(event.target.value as DegenToolsCopyType)}>
              {COPY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input
              className="dt-input dt-count"
              type="number"
              min={1}
              max={10}
              value={copyCount}
              onChange={(event) => setCopyCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
            />
            <button className="dt-btn dt-btn--primary" type="button" onClick={() => void generateCopy()} disabled={busy === 'copy'}>
              <Sparkle size={15} /> {busy === 'copy' ? 'Writing...' : 'Generate'}
            </button>
          </div>
          <ResultBlock result={copyResult} onCopy={copyOutput} tall />
        </section>

        <section className="dt-card">
          <h2 className="dt-section-title">Market lookup</h2>
          <button className="dt-btn dt-btn--secondary" type="button" onClick={() => void fetchTokenData()} disabled={busy === 'token'}>
            <MagnifyingGlass size={15} /> {busy === 'token' ? 'Loading...' : 'Fetch token data'}
          </button>
          <ResultBlock result={tokenResult} onCopy={copyOutput} tall />
        </section>

        <section className="dt-card dt-card--launch">
          <h2 className="dt-section-title">Bags launch</h2>
          <button className="dt-btn dt-btn--launch" type="button" onClick={() => void launchToken()} disabled={busy === 'launch'}>
            <RocketLaunch size={15} /> {busy === 'launch' ? 'Sending...' : 'Send launch_token'}
          </button>
          <ResultBlock result={launchResult} onCopy={copyOutput} tall />
        </section>
      </div>
    </div>
  )
}

function ResultBlock({ result, onCopy, tall = false }: {
  result: DegenToolsToolResult | null
  onCopy: (text: string) => Promise<void>
  tall?: boolean
}) {
  const text = resultText(result)
  if (!text) return null

  return (
    <div className={`dt-result${tall ? ' dt-result--tall' : ''}`}>
      <button className="dt-copy" type="button" onClick={() => void onCopy(text)} title="Copy output">
        <Copy size={14} />
      </button>
      <pre>{text}</pre>
      <PaperPlaneTilt className="dt-result-mark" size={22} weight="duotone" />
    </div>
  )
}
