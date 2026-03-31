import { useState } from 'react'
import { useRecoveryStore } from '../../store/recovery'

export function RecoveryControls() {
  const status = useRecoveryStore((s) => s.status)
  const walletCount = useRecoveryStore((s) => s.wallets.length)
  const wallets = useRecoveryStore((s) => s.wallets)
  const setStatus = useRecoveryStore((s) => s.setStatus)
  const setWallets = useRecoveryStore((s) => s.setWallets)
  const handleProgress = useRecoveryStore((s) => s.handleProgress)
  const addLog = useRecoveryStore((s) => s.addLog)
  const reset = useRecoveryStore((s) => s.reset)
  const [masterAddress, setMasterAddress] = useState('')
  const [csvLoaded, setCsvLoaded] = useState(false)
  const [csvPath, setCsvPath] = useState('')

  const isIdle = status === 'idle' || status === 'complete' || status === 'error'
  const isScanning = status === 'scanning'
  const isExecuting = status === 'executing'

  const handleImportCsv = async () => {
    const res = await window.daemon.recovery.importCsv()
    if (res.ok && res.data) {
      setCsvLoaded(true)
      setCsvPath(res.data.path.split(/[/\\]/).pop() ?? res.data.path)
      addLog('success', `Loaded ${res.data.count} wallets from CSV`)
    } else if (res.ok && !res.data) {
      // User cancelled dialog
    } else {
      addLog('error', res.error ?? 'Failed to load CSV')
    }
  }

  const handleScan = async () => {
    reset()
    setCsvLoaded(true) // keep CSV state
    setStatus('scanning')
    addLog('info', 'Starting wallet scan...')

    const res = await window.daemon.recovery.scan()
    if (res.ok && res.data) {
      setWallets(res.data)
      addLog('success', `Scan complete: ${res.data.length} wallets`)
      for (const w of res.data) {
        handleProgress({
          type: 'scan-progress', walletIndex: w.index, pubkey: w.pubkey,
          message: `${w.pubkey.slice(0, 8)}... | ${(w.solLamports / 1e9).toFixed(4)} SOL | ${w.tokenAccountCount} tokens`,
        })
      }
      handleProgress({ type: 'scan-complete', message: `Scan complete: ${res.data.length} wallets` })
    } else {
      setStatus('error')
      addLog('error', res.error ?? 'Scan failed')
    }
  }

  const handleExecute = async () => {
    if (!masterAddress) {
      addLog('error', 'Enter a master wallet address')
      return
    }
    setStatus('executing')
    addLog('info', `Starting recovery → ${masterAddress.slice(0, 8)}...`)

    const res = await window.daemon.recovery.execute(masterAddress)
    if (res.ok && res.data) {
      setStatus('complete')
      addLog('success', `Recovery complete: ${res.data.totalRecovered.toFixed(6)} SOL`)
    } else {
      setStatus('error')
      addLog('error', res.error ?? 'Recovery failed')
    }
  }

  const handleStop = async () => {
    await window.daemon.recovery.stop()
    setStatus('idle')
    addLog('warning', 'Recovery stopped')
  }

  // Build a quick-pick list of unique wallet addresses from scan results
  const topWallets = wallets.slice(0, 10)

  return (
    <div className="recovery-controls">
      <button className="recovery-btn" onClick={handleImportCsv} disabled={!isIdle}>
        {csvLoaded ? csvPath : 'Import CSV'}
      </button>

      <input
        className="recovery-input"
        value={masterAddress}
        onChange={(e) => setMasterAddress(e.target.value)}
        placeholder="Master wallet address"
        disabled={!isIdle}
        list="recovery-wallet-list"
      />
      {topWallets.length > 0 && (
        <datalist id="recovery-wallet-list">
          {topWallets.map((w) => (
            <option key={w.pubkey} value={w.pubkey}>
              {w.pubkey.slice(0, 8)}... ({(w.solLamports / 1e9).toFixed(4)} SOL)
            </option>
          ))}
        </datalist>
      )}

      <button className="recovery-btn" onClick={handleScan} disabled={!isIdle || !csvLoaded}>
        {isScanning ? 'Scanning...' : 'Scan'}
      </button>

      <button
        className="recovery-btn primary"
        onClick={handleExecute}
        disabled={!isIdle || walletCount === 0 || !masterAddress}
      >
        {isExecuting ? 'Executing...' : 'Execute'}
      </button>

      {(isScanning || isExecuting) && (
        <button className="recovery-btn danger" onClick={handleStop}>
          Stop
        </button>
      )}
    </div>
  )
}
