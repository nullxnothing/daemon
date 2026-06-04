import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { useNotificationsStore } from '../../../../store/notifications'
import { useWalletStore } from '../../../../store/wallet'
import { shortAddr } from '../helpers'
import styles from '../WalletWorkspace.module.css'

type Mode = 'generate' | 'import' | 'track'

const COPY: Record<Mode, { note: string; btn: string; namePh: string; extra?: string }> = {
  generate: { note: 'Creates a new local keypair DAEMON can use for signing.', btn: 'Generate wallet', namePh: 'Wallet name' },
  import: { note: 'Paste a Solana keypair to import a signing wallet.', btn: 'Import wallet', namePh: 'Wallet name', extra: 'Secret key (base58, JSON array, seed, or hex)' },
  track: { note: 'Watch any address read-only — balances and history, no signing.', btn: 'Track address', namePh: 'Label', extra: 'Address to track' },
}

export function AddWalletSheet({
  scope,
  onClose,
  onDone,
}: {
  scope: 'wallets' | 'agents'
  agentWallets: Array<{ id: string; name: string }>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  if (scope === 'agents') return <AddAgentWalletSheet onClose={onClose} onDone={onDone} />
  return <AddRegularWalletSheet onClose={onClose} onDone={onDone} />
}

function AddRegularWalletSheet({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const [mode, setMode] = useState<Mode>('generate')
  const [name, setName] = useState('')
  const [extra, setExtra] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const copy = COPY[mode]

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'generate') {
        const res = await window.daemon.wallet.generate({ name: name.trim() })
        if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to generate wallet')
        pushSuccess(`Signing wallet generated · ${shortAddr(res.data.address)}`, 'Wallet')
      } else if (mode === 'import') {
        const res = await window.daemon.wallet.importSigningWallet({ name: name.trim(), privateKey: extra.trim() || undefined })
        if (!res.ok) throw new Error(res.error ?? 'Failed to import signing wallet')
        pushSuccess('Signing wallet imported', 'Wallet')
      } else {
        const res = await window.daemon.wallet.create({ name: name.trim(), address: extra.trim() })
        if (!res.ok) throw new Error(res.error ?? 'Failed to track address')
        pushSuccess('Address tracked', 'Wallet')
      }
      await onDone()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      eyebrow="NEW WALLET"
      title="Add a wallet"
      width={460}
      onClose={onClose}
      footer={<button className={`${styles.btn} ${styles.primary} ${styles.big}`} disabled={busy} onClick={() => void submit()}>{busy ? 'Working…' : copy.btn}</button>}
    >
      <div className={`${styles.seg} ${styles.segFull}`}>
        <button className={`${styles.segBtn}${mode === 'generate' ? ' ' + styles.segBtnOn : ''}`} onClick={() => { setMode('generate'); setError(null) }}>Generate</button>
        <button className={`${styles.segBtn}${mode === 'import' ? ' ' + styles.segBtnOn : ''}`} onClick={() => { setMode('import'); setError(null) }}>Import key</button>
        <button className={`${styles.segBtn}${mode === 'track' ? ' ' + styles.segBtnOn : ''}`} onClick={() => { setMode('track'); setError(null) }}>Track address</button>
      </div>
      <div className={`${styles.addNote} ${styles.mono}`}>{copy.note}</div>
      <div className={styles.fieldBlock}>
        <span className={styles.label}>Name</span>
        <input className={styles.field} placeholder={copy.namePh} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {copy.extra && (
        <div className={styles.fieldBlock}>
          <span className={styles.label}>{copy.extra}</span>
          {mode === 'import' ? (
            <textarea className={styles.textarea} placeholder={copy.extra} value={extra} onChange={(e) => setExtra(e.target.value)} spellCheck={false} />
          ) : (
            <input className={`${styles.field} ${styles.mono}`} placeholder={copy.extra} value={extra} onChange={(e) => setExtra(e.target.value)} spellCheck={false} />
          )}
        </div>
      )}
      {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>{error}</div>}
    </Sheet>
  )
}

function AddAgentWalletSheet({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const pushSuccess = useNotificationsStore((s) => s.pushSuccess)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [agentId, setAgentId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.daemon.agents.list().then((res) => {
      if (res.ok && res.data) {
        const list = res.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
        setAgents(list)
        if (list[0]) setAgentId(list[0].id)
      }
    }).catch(() => {})
  }, [])

  const submit = async () => {
    if (!agentId) { setError('Select an agent'); return }
    setBusy(true)
    setError(null)
    try {
      const agentName = agents.find((a) => a.id === agentId)?.name ?? 'Agent'
      const res = await window.daemon.wallet.createAgentWallet(agentId, name.trim() || `${agentName} Wallet`)
      if (!res.ok) throw new Error(res.error ?? 'Failed to create agent wallet')
      await useWalletStore.getState().loadAgentWallets()
      await onDone()
      pushSuccess('Agent wallet created', 'Wallet')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      eyebrow="NEW AGENT WALLET"
      title="Create agent wallet"
      width={460}
      onClose={onClose}
      footer={<button className={`${styles.btn} ${styles.primary} ${styles.big}`} disabled={busy || agents.length === 0} onClick={() => void submit()}>{busy ? 'Working…' : 'Create agent wallet'}</button>}
    >
      <div className={`${styles.addNote} ${styles.mono}`}>Generates a dedicated signing wallet bound to an agent.</div>
      <div className={styles.fieldBlock}>
        <span className={styles.label}>Agent</span>
        <select className={styles.field} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          {agents.length === 0 && <option value="">No agents available</option>}
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className={styles.fieldBlock}>
        <span className={styles.label}>Wallet name</span>
        <input className={styles.field} placeholder="Wallet name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <div className={`${styles.feedback} ${styles.feedbackError}`}>{error}</div>}
    </Sheet>
  )
}
