import { useEffect, useState } from 'react'
import { useAriaStore } from '../store/aria'
import { ModelDropdown } from '../components/Panel'
import styles from './LiteSettings.module.css'

interface KeyEntry {
  key_name: string
  hint: string
}

const KEY_OPTIONS = [
  { keyName: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
  { keyName: 'ZAI_API_KEY', label: 'GLM (Z.AI)' },
]

export function LiteSettings({ onBack }: { onBack: () => void }) {
  const [keys, setKeys] = useState<KeyEntry[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const verifyProviders = useAriaStore((s) => s.verifyProviders)

  const refresh = async () => {
    const res = await window.daemon.claude.listKeys()
    if (res.ok && res.data) setKeys(res.data as KeyEntry[])
  }

  useEffect(() => {
    void refresh()
    void window.daemon.lite.getFlavorInfo().then((res) => {
      if (res.ok && res.data) setVersion(res.data.version)
    })
  }, [])

  const saveKey = async (keyName: string) => {
    const value = (drafts[keyName] ?? '').trim()
    if (!value) return
    const res = await window.daemon.claude.storeKey(keyName, value)
    if (!res.ok) {
      setNotice(res.error ?? 'Could not store the key')
      return
    }
    setDrafts((d) => ({ ...d, [keyName]: '' }))
    setNotice(`${keyName} saved.`)
    await refresh()
    void verifyProviders()
  }

  const removeKey = async (keyName: string) => {
    await window.daemon.claude.deleteKey(keyName)
    setNotice(`${keyName} removed.`)
    await refresh()
    void verifyProviders()
  }

  return (
    <div className={styles.settings}>
      <div className={styles.column}>
        <div className={styles.head}>
          <button type="button" className={styles.back} onClick={onBack}>‹ Back</button>
          <h1 className={styles.title}>Settings</h1>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>API keys</h2>
          <p className={styles.sectionSub}>
            Keys are encrypted with your OS keychain and never leave this device.
          </p>
          {KEY_OPTIONS.map(({ keyName, label }) => {
            const stored = keys.find((k) => k.key_name === keyName)
            return (
              <div key={keyName} className={styles.keyRow}>
                <div className={styles.keyMeta}>
                  <span className={styles.keyLabel}>{label}</span>
                  {stored ? <span className={styles.keyHint}>saved ····{stored.hint}</span> : null}
                </div>
                <input
                  className={styles.keyInput}
                  type="password"
                  value={drafts[keyName] ?? ''}
                  placeholder={stored ? 'Replace key' : 'Paste key'}
                  onChange={(e) => setDrafts((d) => ({ ...d, [keyName]: e.currentTarget.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveKey(keyName) }}
                />
                <button type="button" className={styles.keyBtn} disabled={!(drafts[keyName] ?? '').trim()} onClick={() => void saveKey(keyName)}>
                  Save
                </button>
                {stored ? (
                  <button type="button" className={`${styles.keyBtn} ${styles.keyBtnDanger}`} onClick={() => void removeKey(keyName)}>
                    Remove
                  </button>
                ) : null}
              </div>
            )
          })}
          {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Model</h2>
          <p className={styles.sectionSub}>Default model for new messages.</p>
          <ModelDropdown />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>About</h2>
          <div className={styles.aboutRow}>
            <span>DAEMON Lite {version ? `v${version}` : ''}</span>
            <button
              type="button"
              className={styles.ideBtn}
              onClick={() => void window.daemon.lite.openInIde()}
            >
              Get the full DAEMON IDE ↗
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
