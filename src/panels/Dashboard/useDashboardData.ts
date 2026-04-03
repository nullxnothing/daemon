import { useState, useEffect, useRef, useCallback } from 'react'

export interface DashboardMetadata {
  name: string
  symbol: string
  image: string | null
  supply: number
  decimals: number
}

export interface DashboardHolder {
  address: string
  amount: number
}

export interface DashboardData {
  price: number | null
  priceChange: number | null
  priceHistory: number[]
  metadata: DashboardMetadata | null
  holders: { count: number; topHolders: DashboardHolder[] } | null
  isLoading: boolean
  error: string | null
  refetchHolders: () => void
}

const POLL_INTERVAL_MS = 30_000
const MAX_PRICE_HISTORY = 20

export function useDashboardData(mint: string | null): DashboardData {
  const [price, setPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number | null>(null)
  const [priceHistory, setPriceHistory] = useState<number[]>([])
  const [metadata, setMetadata] = useState<DashboardMetadata | null>(null)
  const [holders, setHolders] = useState<{ count: number; topHolders: DashboardHolder[] } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mintRef = useRef<string | null>(null)

  const fetchPrice = useCallback(async (targetMint: string) => {
    try {
      const res = await window.daemon.dashboard.tokenPrice(targetMint)
      if (!res.ok || !res.data) return
      const newPrice = res.data.price
      setPrice(newPrice)
      setPriceChange(res.data.priceChange24h)
      setPriceHistory((prev) => {
        const next = [...prev, newPrice]
        return next.length > MAX_PRICE_HISTORY ? next.slice(next.length - MAX_PRICE_HISTORY) : next
      })
    } catch {
      // silent — poll will retry
    }
  }, [])

  const fetchHolders = useCallback(async (targetMint: string) => {
    try {
      const res = await window.daemon.dashboard.tokenHolders(targetMint)
      if (res.ok && res.data) setHolders(res.data)
    } catch {
      // silent
    }
  }, [])

  const refetchHolders = useCallback(() => {
    if (mint) fetchHolders(mint)
  }, [mint, fetchHolders])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!mint) {
      setPrice(null)
      setPriceChange(null)
      setPriceHistory([])
      setMetadata(null)
      setHolders(null)
      setError(null)
      return
    }

    // Reset when mint changes
    if (mintRef.current !== mint) {
      mintRef.current = mint
      setPrice(null)
      setPriceChange(null)
      setPriceHistory([])
      setMetadata(null)
      setHolders(null)
      setError(null)
    }

    let cancelled = false
    setIsLoading(true)

    const init = async () => {
      try {
        const [metaRes] = await Promise.allSettled([
          window.daemon.dashboard.tokenMetadata(mint),
        ])

        if (cancelled) return

        if (metaRes.status === 'fulfilled' && metaRes.value.ok && metaRes.value.data) {
          setMetadata(metaRes.value.data)
        }

        await fetchPrice(mint)
        if (!cancelled) fetchHolders(mint)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()

    intervalRef.current = setInterval(() => {
      if (!cancelled) fetchPrice(mint)
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [mint, fetchPrice, fetchHolders])

  return { price, priceChange, priceHistory, metadata, holders, isLoading, error, refetchHolders }
}
