import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowClockwise, ArrowSquareOut } from '@phosphor-icons/react'
import styles from './PopoutChrome.module.css'

interface NavState {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

interface DaemonPopout {
  navigate: (url: string) => Promise<boolean>
  back: () => void
  forward: () => void
  reload: () => void
  onNavState: (handler: (state: NavState) => void) => () => void
}

declare global {
  interface Window { daemonPopout: DaemonPopout }
}

export function PopoutChrome() {
  const [nav, setNav] = useState<NavState>({ url: '', canGoBack: false, canGoForward: false, loading: true })
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    return window.daemonPopout.onNavState((state) => {
      setNav(state)
      if (!editing) setDraft(state.url)
    })
  }, [editing])

  const submit = () => {
    const value = draft.trim()
    if (!value) return
    const withScheme = /^https?:\/\//.test(value) ? value : `https://${value}`
    void window.daemonPopout.navigate(withScheme)
    setEditing(false)
  }

  return (
    <div className={styles.chrome}>
      <div className={styles.titlebar} />
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!nav.canGoBack}
          onClick={() => window.daemonPopout.back()}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          disabled={!nav.canGoForward}
          onClick={() => window.daemonPopout.forward()}
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.navBtn}
          onClick={() => window.daemonPopout.reload()}
          title="Reload"
          aria-label="Reload"
        >
          <ArrowClockwise size={15} aria-hidden="true" />
        </button>
        <input
          className={styles.url}
          value={draft}
          spellCheck={false}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <span className={styles.dot} data-loading={nav.loading ? 'true' : 'false'} aria-hidden="true" />
      </div>
    </div>
  )
}
