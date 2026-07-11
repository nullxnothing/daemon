import { useEffect, useState } from 'react'
import type { MemeMarketSnapshot, MemeTechProjectProfile, TokenRiskPreflight } from '../../../electron/services/meme-studio/types'
import type { Project } from '../../../electron/shared/types'
import styles from './MemeTechStudio.module.css'

const KINS_MINT = 'Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump'
const PERCOLATOR_MINT = '8PzFWyLpCVEmbZmVJcaRTU5r69XKJx1rd7YGpWvnpump'

interface Props { project: Project | null }

function money(value: number | null): string {
  if (value === null) return 'Unknown'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function metric(value: number | null): string {
  if (value === null) return 'Unknown'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function archetypeLabel(value: MemeTechProjectProfile['archetype']): string {
  return value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
}

export function MemeTechStudio({ project }: Props) {
  const [profile, setProfile] = useState<MemeTechProjectProfile | null>(null)
  const [mint, setMint] = useState(KINS_MINT)
  const [market, setMarket] = useState<MemeMarketSnapshot | null>(null)
  const [preflight, setPreflight] = useState<TokenRiskPreflight | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [isLoadingToken, setIsLoadingToken] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    setProfile(null)
    setError(null)
    if (!project) return
    setIsLoadingProject(true)
    void window.daemon.memeStudio.detect(project.path).then((response) => {
      if (!isCurrent) return
      if (!response.ok || !response.data) setError(response.error ?? 'Project analysis failed.')
      else {
        setProfile(response.data)
        if (response.data.tokenMints[0]) setMint(response.data.tokenMints[0])
      }
    }).finally(() => { if (isCurrent) setIsLoadingProject(false) })
    return () => { isCurrent = false }
  }, [project?.id])

  const inspectToken = async () => {
    const inspectedMint = mint.trim()
    setError(null)
    setMarket(null)
    setPreflight(null)
    setIsLoadingToken(true)
    const [marketResponse, riskResponse] = await Promise.all([
      window.daemon.memeStudio.marketContext(inspectedMint),
      window.daemon.memeStudio.tokenPreflight(inspectedMint),
    ])
    if (mint.trim() !== inspectedMint) {
      setIsLoadingToken(false)
      return
    }
    if (marketResponse.ok && marketResponse.data) setMarket(marketResponse.data)
    if (riskResponse.ok && riskResponse.data) setPreflight(riskResponse.data)
    const errors = [marketResponse, riskResponse].filter((response) => !response.ok).map((response) => response.error)
    if (errors.length) setError(errors.join(' '))
    setIsLoadingToken(false)
  }

  return (
    <div className={styles.studio}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>MEME TECH STUDIO</span>
          <h1>Build the product loop behind the ticker.</h1>
          <p>Repo intelligence, live market context, and safety evidence for Solana products. No launch or signing authority.</p>
        </div>
        <div className={styles.principle}><strong>Attention is not trust.</strong><span>Boosts and volume never reduce token risk.</span></div>
      </header>

      <section className={styles.grid}>
        <article className={styles.card}>
          <header><span>01</span><h2>Product architecture</h2></header>
          {!project ? <p className={styles.empty}>Open a project to inspect its actual topology.</p> : isLoadingProject ? <p className={styles.empty}>Reading bounded manifests and configs...</p> : profile ? (
            <>
              <div className={styles.profileHeadline}><strong>{archetypeLabel(profile.archetype)}</strong><span>{Math.round(profile.confidence * 100)}% confidence</span></div>
              <div className={styles.tags}>{profile.topology.map((item) => <span key={item}>{item}</span>)}</div>
              <ul className={styles.findings}>{profile.evidence.slice(0, 5).map((item) => <li key={item.code}><strong>{item.detail}</strong><small>{item.path}</small></li>)}</ul>
              {profile.gaps.map((gap) => <div className={styles.gap} key={gap.code}><span>{gap.severity}</span><p>{gap.detail} {gap.action}</p></div>)}
            </>
          ) : null}
        </article>

        <article className={styles.card}>
          <header><span>02</span><h2>Token evidence</h2></header>
          <label className={styles.mintLabel} htmlFor="meme-tech-mint">Solana mint</label>
          <div className={styles.lookup}>
            <input id="meme-tech-mint" value={mint} disabled={isLoadingToken} onChange={(event) => setMint(event.target.value)} spellCheck={false} />
            <button type="button" onClick={() => void inspectToken()} disabled={isLoadingToken}>{isLoadingToken ? 'Inspecting...' : 'Inspect'}</button>
          </div>
          <div className={styles.benchmarks}>
            <button type="button" disabled={isLoadingToken} onClick={() => setMint(KINS_MINT)}>Kintara</button>
            <button type="button" disabled={isLoadingToken} onClick={() => setMint(PERCOLATOR_MINT)}>Percolator</button>
          </div>
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          {market ? (
            <>
              <div className={styles.tokenTitle}><strong>{market.symbol ?? 'Unknown token'}</strong><span>{market.degraded ? 'degraded data' : 'Birdeye + DEX cross-check'}</span></div>
              <div className={styles.metrics}>
                <div><span>Price</span><strong>{money(market.priceUsd)}</strong></div>
                <div><span>Liquidity</span><strong>{money(market.liquidityUsd)}</strong></div>
                <div><span>1h volume</span><strong>{money(market.volume1hUsd)}</strong></div>
                <div><span>1h traders</span><strong>{metric(market.uniqueWallets1h)}</strong></div>
                <div><span>Holders</span><strong>{metric(market.holders)}</strong></div>
                <div><span>Boosts</span><strong>{metric(market.boosts)}</strong></div>
              </div>
              <p className={styles.timestamp}>Observed {new Date(market.observedAt).toLocaleString()} from {market.sources.map((source) => source.provider).join(' + ')}.</p>
              {market.divergences.map((item) => <div className={styles.warning} key={item}>{item}</div>)}
            </>
          ) : null}
          {preflight ? (
            <div className={styles.preflight}>
              <div className={styles.riskHeader}><span>PROVIDER RISK EVIDENCE</span><strong data-risk={preflight.risk}>{preflight.risk}</strong></div>
              {preflight.facts.map((fact) => <div className={styles.fact} key={fact.label}><span>{fact.label}</span><strong data-status={fact.status}>{fact.value}</strong></div>)}
              {preflight.unknowns.map((unknown) => <div className={styles.warning} key={unknown}>{unknown}</div>)}
              <p className={styles.timestamp}>Observed {new Date(preflight.observedAt).toLocaleString()} from {preflight.sources.join(' + ')}. On-chain RPC verification is not included yet.</p>
            </div>
          ) : null}
        </article>

        <article className={`${styles.card} ${styles.wide}`}>
          <header><span>03</span><h2>Two proven technical shapes</h2></header>
          <div className={styles.patterns}>
            <div><span className={styles.patternLabel}>KINTARA SHAPE</span><h3>Playable loop first</h3><p>Wallet identity, authoritative state, quests and marketplace, with the token reserved for access, settlement, and measurable sinks.</p><ul><li>Server verifies outcomes</li><li>Off-chain loop stays fast</li><li>Burn and treasury receipts stay distinct</li></ul></div>
            <div><span className={styles.patternLabel}>PERCOLATOR SHAPE</span><h3>Infrastructure is the product</h3><p>Permissionless markets need an indexer, keeper, oracle freshness, risk invariants, and explicit lab status visible beside every action.</p><ul><li>Read-first frontend</li><li>Dry-run keepers</li><li>Stale state blocks writes</li></ul></div>
          </div>
        </article>
      </section>
    </div>
  )
}
