import { useState } from 'react'
import { openLaunchInBrowserMode } from '../../../lib/launchHandoff'
import { Toggle } from '../../../components/Toggle'

interface Props { walletId: string | null }

export function LaunchTab({ walletId }: Props) {
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [description, setDescription] = useState('')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [initialBuy, setInitialBuy] = useState('0.1')
  const [mayhemMode, setMayhemMode] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [result, setResult] = useState<{ signature?: string; mint?: string; error?: string } | null>(null)

  const handlePickImage = async () => {
    const res = await window.daemon.launch.pickImage()
    if (res.ok && res.data) setImagePath(res.data)
  }

  const handleLaunch = async () => {
    if (!walletId || !name.trim() || !symbol.trim()) return
    setLaunching(true)
    setResult(null)

    const res = await window.daemon.launch.createToken({
      launchpad: 'pumpfun',
      walletId,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: description.trim(),
      imagePath,
      twitter: '',
      telegram: '',
      website: '',
      initialBuySol: parseFloat(initialBuy) || 0,
      slippageBps: 1000,
      priorityFeeSol: 0.005,
      mayhemMode,
    })

    if (res.ok && res.data) {
      if (res.data.mint) {
        openLaunchInBrowserMode('pumpfun', res.data.mint)
      }
      setResult({ signature: res.data.signature, mint: res.data.mint })
    } else {
      setResult({ error: res.error ?? 'Launch failed' })
    }
    setLaunching(false)
  }

  const openTx = (sig: string) => {
    window.daemon.shell.openExternal(`https://solscan.io/tx/${sig}`)
  }

  return (
    <div>
      <div className="pf-field">
        <label className="pf-label">Token Name</label>
        <input className="pf-input" placeholder="My Token" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="pf-field">
        <label className="pf-label">Symbol</label>
        <input
          className="pf-input"
          placeholder="TOKEN"
          value={symbol}
          maxLength={8}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
      </div>

      <div className="pf-field">
        <label className="pf-label">Description</label>
        <textarea className="pf-textarea" placeholder="What is this token about?" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="pf-field">
        <label className="pf-label">Image</label>
        <div className="pf-image-picker">
          <button className="pf-btn pf-btn-secondary" onClick={handlePickImage}>
            {imagePath ? 'Change' : 'Select Image'}
          </button>
          {imagePath && <span style={{ fontSize: 10, color: 'var(--t3)' }}>{imagePath.split(/[\\/]/).pop()}</span>}
        </div>
      </div>

      <div className="pf-field">
        <label className="pf-label">Initial Buy (SOL)</label>
        <input className="pf-input" type="number" step="0.01" min="0" value={initialBuy} onChange={(e) => setInitialBuy(e.target.value)} />
      </div>

      <div className="pf-toggle-row">
        <span className="pf-toggle-label">Mayhem Mode</span>
        <Toggle checked={mayhemMode} onChange={setMayhemMode} />
      </div>

      <div style={{ marginTop: 12 }}>
        <button
          className="pf-btn pf-btn-primary"
          style={{ width: '100%' }}
          onClick={handleLaunch}
          disabled={launching || !walletId || !name.trim() || !symbol.trim()}
        >
          {launching ? 'Launching...' : 'Launch Token'}
        </button>
      </div>

      {result?.signature && (
        <div className="pf-result success">
          Token launched{result.mint ? ` (${result.mint.slice(0, 6)}...${result.mint.slice(-4)})` : ''}.{' '}
          <span className="pf-tx-link" onClick={() => openTx(result.signature!)}>
            {result.signature.slice(0, 20)}...
          </span>
        </div>
      )}

      {result?.error && <div className="pf-result error">{result.error}</div>}
    </div>
  )
}
