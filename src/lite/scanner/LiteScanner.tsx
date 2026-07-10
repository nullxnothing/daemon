import { useState } from 'react'
import { ShieldCheck, MagnifyingGlass } from '@phosphor-icons/react'
import type { ForensicsScanResult, ForensicsTokenSecurity } from '../../../electron/shared/types'
import { LiteToolHeader } from '../components/LiteToolHeader'
import styles from './LiteScanner.module.css'

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

const RISK_LABEL: Record<ForensicsTokenSecurity['riskLevel'], string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
}

interface LiteScannerProps {
  onAskAria: (prompt: string) => void
}

export function LiteScanner({ onAskAria }: LiteScannerProps) {
  const [address, setAddress] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ForensicsScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = async () => {
    const addr = address.trim()
    if (!BASE58_RE.test(addr)) {
      setError('Enter a valid Solana mint or wallet address.')
      return
    }
    setScanning(true); setError(null); setResult(null)
    const res = await window.daemon.forensics.scan({ address: addr })
    setScanning(false)
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Scan failed.')
      return
    }
    setResult(res.data as ForensicsScanResult)
  }

  const security = result?.tokenSecurity ?? null
  const stats = result?.stats ?? null

  return (
    <div className={styles.scanner}>
      <LiteToolHeader
        icon={ShieldCheck}
        title="Scanner"
        subtitle="Paste a token mint or wallet to check authorities, snipers, and bundles."
      />

      <div className={styles.body}>
        <div className={styles.searchWrap}>
          <MagnifyingGlass size={15} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={styles.search}
            value={address}
            placeholder="Token mint or wallet address"
            spellCheck={false}
            onChange={(e) => { setAddress(e.currentTarget.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void scan() }}
          />
          <button type="button" className={styles.scanBtn} disabled={scanning} onClick={() => void scan()}>
            {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}

        {result ? (
          <div className={styles.result}>
            {security ? (
              <div className={`${styles.verdict} ${styles[security.riskLevel]}`}>
                <span className={styles.verdictDot} aria-hidden="true" />
                <span className={styles.verdictLabel}>{RISK_LABEL[security.riskLevel]}</span>
                {result.tokenMetadata?.symbol ? (
                  <span className={styles.verdictSymbol}>{result.tokenMetadata.symbol}</span>
                ) : null}
              </div>
            ) : (
              <div className={styles.verdict}>
                <span className={styles.verdictLabel}>Wallet scan complete</span>
              </div>
            )}

            {security ? (
              <div className={styles.grid}>
                <Fact label="Mint authority" value={security.hasMintAuthority ? 'Active (can mint more)' : 'Revoked'} bad={security.hasMintAuthority} />
                <Fact label="Freeze authority" value={security.hasFreezeAuthority ? 'Active (can freeze)' : 'Revoked'} bad={security.hasFreezeAuthority} />
                <Fact label="Metadata" value={security.isMutable ? 'Mutable' : 'Immutable'} bad={security.isMutable} />
                {security.decimals !== undefined ? <Fact label="Decimals" value={String(security.decimals)} /> : null}
              </div>
            ) : null}

            {stats ? (
              <div className={styles.grid}>
                {stats.snipersDetected !== undefined ? <Fact label="Snipers" value={String(stats.snipersDetected)} bad={(stats.snipersDetected ?? 0) > 0} /> : null}
                {stats.bundleClustersDetected !== undefined ? <Fact label="Bundle clusters" value={String(stats.bundleClustersDetected)} bad={(stats.bundleClustersDetected ?? 0) > 0} /> : null}
                {stats.cabalConnectionsFound !== undefined ? <Fact label="Cabal links" value={String(stats.cabalConnectionsFound)} bad={(stats.cabalConnectionsFound ?? 0) > 0} /> : null}
                {stats.totalHolders !== undefined ? <Fact label="Holders" value={String(stats.totalHolders)} /> : null}
              </div>
            ) : null}

            {security && security.riskFactors.length > 0 ? (
              <ul className={styles.factors}>
                {security.riskFactors.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            ) : null}

            <div className={styles.actions}>
              <button type="button" className={styles.askBtn} onClick={() => onAskAria(`Assess the risk of this token/wallet and whether it looks safe: ${address.trim()}`)}>
                Ask ARIA to explain
              </button>
              <button type="button" className={styles.ideBtn} onClick={() => void window.daemon.lite.openInIde()}>
                Open full map in DAEMON IDE ↗
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Fact({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={`${styles.factValue}${bad ? ` ${styles.factBad}` : ''}`}>{value}</span>
    </div>
  )
}
