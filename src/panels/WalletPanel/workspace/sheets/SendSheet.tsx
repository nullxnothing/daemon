import { useEffect, useState } from 'react'
import { Sheet, type SheetWallet } from './Sheet'
import { TransactionPreviewCard } from '../../TransactionPreviewCard'
import { Icon } from '../icons'
import { TokGlyph, fmtAmount, fmtUsd, shortAddr, SOL_MINT } from '../helpers'
import { canOpenSolscan, getSolscanTxLabel, getSolscanTxUrl } from '../../../../lib/solanaExplorer'
import styles from '../WalletWorkspace.module.css'

interface RecipientOption {
  id: string
  name: string
  address: string
}

interface PendingSend {
  mode: 'sol' | 'token'
  mint: string
  dest: string
  amount: number
}

export function SendSheet({
  wallet,
  recipients,
  cluster,
  executionLabel,
  onClose,
  onDone,
}: {
  wallet: SheetWallet
  recipients: RecipientOption[]
  cluster: WalletInfrastructureSettings['cluster']
  executionLabel: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const assets = [{ mint: SOL_MINT, symbol: 'SOL', amount: solBalance(wallet) }, ...tokenAssets(wallet)]
  const [mint, setMint] = useState(SOL_MINT)
  const [destMode, setDestMode] = useState<'wallet' | 'address'>(recipients.length > 0 ? 'wallet' : 'address')
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [customAddr, setCustomAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState<PendingSend | null>(null)
  const [preview, setPreview] = useState<SolanaTransactionPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const selectedAsset = assets.find((a) => a.mint === mint) ?? assets[0]
  const isSol = mint === SOL_MINT
  const dest = destMode === 'wallet'
    ? recipients.find((r) => r.id === recipientId)?.address ?? ''
    : customAddr.trim()

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    if (!pending) return
    void window.daemon.wallet.transactionPreview({
      kind: pending.mode === 'sol' ? 'send-sol' : 'send-token',
      walletId: wallet.id,
      destination: pending.dest,
      amount: pending.amount,
      mint: pending.mint,
      tokenSymbol: selectedAsset?.symbol,
    }).then((res) => {
      if (!cancelled && res.ok && res.data) setPreview(res.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pending, wallet.id, selectedAsset?.symbol])

  const handleReview = () => {
    setError(null)
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) { setError('Enter a valid amount'); return }
    if (!dest || dest.length < 32) { setError('Choose a valid recipient'); return }
    setPending({ mode: isSol ? 'sol' : 'token', mint, dest, amount: parsed })
  }

  const handleSend = async () => {
    if (!pending) return
    setLoading(true)
    setError(null)
    try {
      const res = pending.mode === 'sol'
        ? await window.daemon.wallet.sendSol({ fromWalletId: wallet.id, toAddress: pending.dest, amountSol: pending.amount })
        : await window.daemon.wallet.sendToken({ fromWalletId: wallet.id, toAddress: pending.dest, mint: pending.mint, amount: pending.amount })
      if (res.ok && res.data) {
        setResult(res.data.signature)
        setPending(null)
        setAmount('')
        await onDone()
      } else {
        setError(res.error ?? 'Send failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setLoading(false)
    }
  }

  const footer = !pending ? (
    <button className={`${styles.btn} ${styles.primary} ${styles.big}`} onClick={handleReview} disabled={loading}>
      Review send
    </button>
  ) : (
    <button className={`${styles.btn} ${styles.primary} ${styles.big}`} onClick={() => void handleSend()} disabled={loading}>
      {loading ? 'Broadcasting…' : 'Sign and send'}
    </button>
  )

  return (
    <Sheet eyebrow={`SEND · ${wallet.name}`} title="Send funds" width={460} onClose={onClose} footer={footer}>
      {/* asset */}
      <div className={styles.fieldBlock}>
        <span className={styles.label}>Asset</span>
        <div className={styles.chiprow}>
          {assets.map((a) => (
            <button
              key={a.mint}
              className={`${styles.pillbtn}${mint === a.mint ? ' ' + styles.pillbtnOn : ''}`}
              onClick={() => { setMint(a.mint); setPending(null) }}
            >
              <TokGlyph symbol={a.symbol} small />
              {a.symbol} <span className={`${styles.mono} ${styles.dim}`}>{fmtAmount(a.amount)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* recipient */}
      <div className={styles.fieldBlock}>
        <div className={styles.fieldHead}>
          <span className={styles.label}>To</span>
          {recipients.length > 0 && (
            <div className={`${styles.seg} ${styles.segSm}`}>
              <button className={`${styles.segBtn}${destMode === 'wallet' ? ' ' + styles.segBtnOn : ''}`} onClick={() => setDestMode('wallet')}>My wallets</button>
              <button className={`${styles.segBtn}${destMode === 'address' ? ' ' + styles.segBtnOn : ''}`} onClick={() => setDestMode('address')}>Address</button>
            </div>
          )}
        </div>
        {destMode === 'wallet' && recipients.length > 0 ? (
          <div className={styles.wpick}>
            {recipients.map((r) => (
              <button
                key={r.id}
                className={`${styles.wpickRow}${recipientId === r.id ? ' ' + styles.wpickRowOn : ''}`}
                onClick={() => { setRecipientId(r.id); setPending(null) }}
              >
                <span className={`${styles.wpickDot}${recipientId === r.id ? ' ' + styles.wpickDotOn : ''}`} />
                <span className={styles.wpickId}><b>{r.name}</b><i className={styles.mono}>{shortAddr(r.address)}</i></span>
              </button>
            ))}
          </div>
        ) : (
          <input
            className={`${styles.field} ${styles.mono}`}
            placeholder="Destination address"
            value={customAddr}
            onChange={(e) => { setCustomAddr(e.target.value); setPending(null) }}
            spellCheck={false}
          />
        )}
      </div>

      {/* amount */}
      <div className={styles.fieldBlock}>
        <div className={styles.fieldHead}>
          <span className={styles.label}>Amount</span>
          <button className={styles.linkbtn} onClick={() => setAmount(String(selectedAsset?.amount ?? 0))}>
            Available {fmtAmount(selectedAsset?.amount ?? 0)} {selectedAsset?.symbol} · Max
          </button>
        </div>
        <div className={styles.amtField}>
          <input
            className={`${styles.field} ${styles.mono}`}
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setPending(null) }}
          />
          <span className={`${styles.amtSuffix} ${styles.mono}`}>{selectedAsset?.symbol}</span>
        </div>
      </div>

      {pending && (
        <TransactionPreviewCard
          title={preview?.title ?? 'Review send'}
          backendLabel={preview?.backendLabel ?? executionLabel}
          networkLabel={preview?.networkLabel ?? cluster}
          signerLabel={preview?.signerLabel ?? shortAddr(wallet.address)}
          destinationLabel={preview?.targetLabel ?? shortAddr(pending.dest)}
          amountLabel={preview?.amountLabel ?? `${pending.amount} ${selectedAsset?.symbol}`}
          feeLabel={preview?.feeLabel}
          warnings={preview?.warnings}
          notes={preview?.notes ?? ['Uses the shared DAEMON transaction pipeline.']}
        />
      )}

      {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>{error}</div>}
      {result && (
        <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>
          <span>Sent · {result.slice(0, 8)}…{result.slice(-8)}</span>
          <button
            className={styles.linkbtn}
            onClick={() => {
              if (canOpenSolscan(cluster)) void window.daemon.shell.openExternal(getSolscanTxUrl(result, cluster))
              else void window.daemon.env.copyValue(result)
            }}
          >
            {getSolscanTxLabel(cluster)}
          </button>
        </div>
      )}
    </Sheet>
  )
}

function solBalance(wallet: SheetWallet): number {
  return wallet.holdings.find((h) => h.symbol === 'SOL')?.amount ?? 0
}

function tokenAssets(wallet: SheetWallet) {
  return wallet.holdings
    .filter((h) => h.symbol !== 'SOL' && h.amount > 0)
    .map((h) => ({ mint: h.mint, symbol: h.symbol, amount: h.amount }))
}
