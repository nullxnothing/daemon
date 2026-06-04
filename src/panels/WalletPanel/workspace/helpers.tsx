import styles from './WalletWorkspace.module.css'

export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export function fmtUsd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtUsdCompact(n: number): string {
  return n >= 1000
    ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : fmtUsd(n)
}

export function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '-'
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

export function fmtAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length <= 12) return addr
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function glyphKind(symbol: string): string {
  if (symbol === 'SOL') return styles.tokIcSol
  if (symbol === 'USDC' || symbol === 'USDT') return styles.tokIcUsdc
  return styles.tokIcPlain
}

export function TokGlyph({ symbol, logoUri, small }: { symbol: string; logoUri?: string | null; small?: boolean }) {
  const cls = `${styles.tokIc}${small ? ' ' + styles.tokIcSm : ''} ${glyphKind(symbol)}`
  if (logoUri) {
    return (
      <span className={cls}>
        <img src={logoUri} alt="" />
      </span>
    )
  }
  const glyph = symbol === 'SOL' ? '◎' : symbol === 'USDC' || symbol === 'USDT' ? '$' : symbol.charAt(0).toUpperCase()
  return <span className={cls}>{glyph}</span>
}
