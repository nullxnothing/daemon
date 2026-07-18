import { useCallback, useEffect, useRef, useState } from 'react'
import { ChartLineUp, MagnifyingGlass, Star, X } from '@phosphor-icons/react'
import type { JupiterTokenSearchResult } from '../../../electron/shared/types'
import { LiteToolHeader } from '../components/LiteToolHeader'
import styles from './LiteTrade.module.css'

const WATCHLIST_KEY = 'daemon-lite:watchlist'

function loadWatchlist(): JupiterTokenSearchResult[] {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY)
    return raw ? (JSON.parse(raw) as JupiterTokenSearchResult[]) : []
  } catch { return [] }
}

function saveWatchlist(list: JupiterTokenSearchResult[]): void {
  try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)) } catch { /* full */ }
}

function usd(n: number | null): string {
  if (n === null) return '—'
  if (n < 0.01) return `$${n.toPrecision(2)}`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

interface LiteTradeProps {
  onAskAria: (prompt: string) => void
}

export function LiteTrade({ onAskAria }: LiteTradeProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JupiterTokenSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [watchlist, setWatchlist] = useState<JupiterTokenSearchResult[]>(loadWatchlist)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await window.daemon.wallet.searchJupiterTokens(q.trim())
    if (res.ok && res.data) setResults(res.data as JupiterTokenSearchResult[])
    setSearching(false)
  }, [])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void runSearch(query), 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, runSearch])

  const isWatched = (mint: string) => watchlist.some((t) => t.mint === mint)

  const toggleWatch = (token: JupiterTokenSearchResult) => {
    setWatchlist((prev) => {
      const next = isWatched(token.mint)
        ? prev.filter((t) => t.mint !== token.mint)
        : [...prev, token]
      saveWatchlist(next)
      return next
    })
  }

  const renderToken = (t: JupiterTokenSearchResult, inWatchlist: boolean) => (
    <div key={t.mint} className={styles.tokenRow}>
      <div className={styles.tokenMeta}>
        <span className={styles.tokenSymbol}>{t.symbol || '???'}</span>
        {t.verified ? <span className={styles.verified}>verified</span> : null}
        {t.isSus ? <span className={styles.sus}>flagged</span> : null}
        <span className={styles.tokenName}>{t.name}</span>
      </div>
      <span className={styles.tokenPrice}>{usd(t.usdPrice)}</span>
      <button
        type="button"
        className={styles.swapBtn}
        onClick={() => onAskAria(`Swap into ${t.symbol} (${t.mint}) — quote it first and show me the price impact before I confirm.`)}
      >
        Swap via ARIA
      </button>
      <button
        type="button"
        className={styles.starBtn}
        aria-pressed={inWatchlist}
        title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
        onClick={() => toggleWatch(t)}
      >
        {inWatchlist ? <X size={13} aria-hidden="true" /> : <Star size={13} aria-hidden="true" />}
      </button>
    </div>
  )

  return (
    <div className={styles.trade}>
      <LiteToolHeader
        icon={ChartLineUp}
        title="Trade"
        subtitle="Search tokens and track a watchlist. Swaps run through ARIA with a typed confirm."
      />

      <div className={styles.body}>
        <div className={styles.searchWrap}>
          <MagnifyingGlass size={15} className={styles.searchIcon} aria-hidden="true" />
          <input
            className={styles.search}
            value={query}
            placeholder="Search token by name, symbol, or mint"
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>

        {query.trim() ? (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>{searching ? 'Searching…' : 'Results'}</div>
            {results.length === 0 && !searching ? (
              <div className={styles.empty}>No tokens found.</div>
            ) : (
              results.map((t) => renderToken(t, isWatched(t.mint)))
            )}
          </section>
        ) : (
          <section className={styles.section}>
            <div className={styles.sectionLabel}>Watchlist</div>
            {watchlist.length === 0 ? (
              <div className={styles.empty}>Search for a token and star it to watch it here.</div>
            ) : (
              watchlist.map((t) => renderToken(t, true))
            )}
          </section>
        )}
      </div>
    </div>
  )
}
