import { useState } from 'react'

interface DeployConnectProps {
  platform: 'vercel' | 'railway'
  onConnected: () => void
}

const PLATFORM_INFO = {
  vercel: {
    label: 'Vercel',
    tokenUrl: 'https://vercel.com/account/tokens',
    tokenHint: 'Get a token from vercel.com/account/tokens',
    placeholder: 'Paste Vercel personal access token...',
  },
  railway: {
    label: 'Railway',
    tokenUrl: 'https://railway.app/account/tokens',
    tokenHint: 'Get a token from railway.app/account/tokens',
    placeholder: 'Paste Railway API token...',
  },
} as const

export function DeployConnect({ platform, onConnected }: DeployConnectProps) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const info = PLATFORM_INFO[platform]

  const handleConnect = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError(null)

    try {
      const method = platform === 'vercel'
        ? window.daemon.deploy.connectVercel
        : window.daemon.deploy.connectRailway

      const res = await method(token.trim())
      if (res.ok) {
        setToken('')
        onConnected()
      } else {
        setError(res.error ?? 'Failed to connect')
      }
    } catch {
      setError('Connection failed')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenTokenPage = () => {
    window.daemon.shell.openExternal(info.tokenUrl)
  }

  return (
    <div className="deploy-pconnect">
      <div className="row">
        <input
          className="deploy-input"
          type="password"
          placeholder={info.placeholder}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          disabled={loading}
        />
        <button
          className="deploy-gbtn hair"
          onClick={handleConnect}
          disabled={!token.trim() || loading}
        >
          {loading ? 'Connecting...' : 'Connect'}
        </button>
      </div>
      {error && <div className="deploy-error">{error}</div>}
      <button type="button" className="deploy-connect-hint-link help" onClick={handleOpenTokenPage}>
        {info.tokenHint} ↗
      </button>
    </div>
  )
}
