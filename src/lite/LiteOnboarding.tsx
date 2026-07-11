import { useState } from 'react'
import { DaemonMark } from '../components/DaemonMark'
import { SegmentedControl } from '../components/Panel'
import styles from './LiteOnboarding.module.css'

type ProviderChoice = 'anthropic' | 'glm'

const PROVIDER_META: Record<ProviderChoice, { keyName: string; consoleUrl: string; placeholder: string }> = {
  anthropic: {
    keyName: 'ANTHROPIC_API_KEY',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-…',
  },
  glm: {
    keyName: 'ZAI_API_KEY',
    consoleUrl: 'https://z.ai',
    placeholder: 'Paste your Z.AI key',
  },
}

export function LiteOnboarding({ onDone }: { onDone: () => void }) {
  const [provider, setProvider] = useState<ProviderChoice>('anthropic')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meta = PROVIDER_META[provider]

  const start = async () => {
    const trimmed = key.trim()
    if (!trimmed || busy) return
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
      setError('That does not look like an Anthropic key. It should start with sk-ant-.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const stored = await window.daemon.claude.storeKey(meta.keyName, trimmed)
      if (!stored.ok) throw new Error(stored.error ?? 'Could not store the key')
      const verified = await window.daemon.provider.verifyAll()
      if (!verified.ok) throw new Error(verified.error ?? 'Could not verify the key')
      const done = await window.daemon.lite.setOnboardingComplete(true)
      if (!done.ok) throw new Error(done.error ?? 'Could not save setup state')
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const continueWithoutAi = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const done = await window.daemon.lite.setOnboardingComplete(true)
      if (!done.ok) throw new Error(done.error ?? 'Could not save setup state')
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}><DaemonMark /></span>
          <span className={styles.name}>DAEMON</span>
        </div>
        <h1 className={styles.headline}>Your AI coding agent.</h1>
        <p className={styles.sub}>
          Paste an API key to start. It is encrypted with your OS keychain and stored only on
          this device. It goes nowhere except your AI provider.
        </p>

        <SegmentedControl<ProviderChoice>
          ariaLabel="API provider"
          items={[
            { id: 'anthropic', label: 'Anthropic' },
            { id: 'glm', label: 'GLM (Z.AI)' },
          ]}
          value={provider}
          onChange={(next) => { setProvider(next); setError(null) }}
        />

        <input
          className={styles.keyInput}
          type="password"
          value={key}
          placeholder={meta.placeholder}
          aria-label={`${provider === 'anthropic' ? 'Anthropic' : 'GLM'} API key`}
          autoFocus
          onChange={(e) => { setKey(e.currentTarget.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') void start() }}
        />

        {error ? <div className={styles.error} role="alert">{error}</div> : null}

        <button type="button" className={styles.start} disabled={busy || !key.trim()} onClick={() => void start()}>
          {busy ? 'Checking key…' : 'Start chatting'}
        </button>

        <button type="button" className={styles.help} disabled={busy} onClick={() => void continueWithoutAi()}>
          Continue without AI
        </button>

        <button
          type="button"
          className={styles.help}
          onClick={() => void window.daemon.shell.openExternal(meta.consoleUrl)}
        >
          Where do I get a key?
        </button>
      </div>
    </div>
  )
}
