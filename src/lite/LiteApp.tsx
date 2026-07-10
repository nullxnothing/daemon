import { useCallback, useEffect, useRef, useState } from 'react'
import { useAriaStore } from '../store/aria'
import { LiteSidebar } from './LiteSidebar'
import { LiteHome } from './LiteHome'
import { LiteChat } from './LiteChat'
import { LiteSettings } from './LiteSettings'
import { LiteOnboarding } from './LiteOnboarding'
import { LiteWallet } from './wallet/LiteWallet'
import { LiteTrade } from './trade/LiteTrade'
import { LiteScanner } from './scanner/LiteScanner'
import '../panels/AgentWorkbench/AgentWorkbench.css'
import styles from './LiteApp.module.css'

export type LiteView = 'chat' | 'settings' | 'wallet' | 'trade' | 'scanner'

export default function LiteApp() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [view, setView] = useState<LiteView>('chat')
  const [showTools, setShowTools] = useState(false)
  const [draft, setDraft] = useState('')
  const mainRef = useRef<HTMLElement | null>(null)
  const turns = useAriaStore((s) => s.turns)

  useEffect(() => {
    void window.daemon.lite.isOnboardingComplete().then((res) => {
      setOnboarded(res.ok ? Boolean(res.data) : false)
    })
    void window.daemon.lite.getShowTools().then((res) => {
      if (res.ok) setShowTools(Boolean(res.data))
    })
  }, [])

  useEffect(() => {
    if (!onboarded) return
    const store = useAriaStore.getState()
    const unsubscribe = store.subscribe()
    void store.initSessions()
    void store.loadModels()
    void store.loadProviderStatus()
    return unsubscribe
  }, [onboarded])

  const focusComposer = useCallback(() => {
    // The shared Composer exposes no input ref; the shell owns one textarea.
    requestAnimationFrame(() => {
      mainRef.current?.querySelector('textarea')?.focus()
    })
  }, [])

  const prefillDraft = useCallback((text: string) => {
    setView('chat')
    setDraft(text)
    focusComposer()
  }, [focusComposer])

  const sendDraft = useCallback(() => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    void useAriaStore.getState().sendMessage(content)
  }, [draft])

  const toggleTools = useCallback(() => {
    setShowTools((prev) => {
      const next = !prev
      void window.daemon.lite.setShowTools(next)
      return next
    })
  }, [])

  if (onboarded === null) return null

  const showHome = view === 'chat' && turns.length === 0

  return (
    <div className={styles.app}>
      <div className={styles.titlebar}>
        <span className={styles.titlebarText}>DAEMON Lite</span>
      </div>
      {!onboarded ? (
        <LiteOnboarding onDone={() => setOnboarded(true)} />
      ) : (
        <div className={styles.body}>
          <LiteSidebar
            view={view}
            showTools={showTools}
            onToggleTools={toggleTools}
            onNewAgent={() => {
              setView('chat')
              setDraft('')
              void useAriaStore.getState().newChat()
              focusComposer()
            }}
            onSelectView={setView}
            onOpenSettings={() => setView(view === 'settings' ? 'chat' : 'settings')}
            onPickSession={() => setView('chat')}
          />
          <main ref={mainRef} className={styles.main}>
            {view === 'settings' ? (
              <LiteSettings onBack={() => setView('chat')} />
            ) : view === 'wallet' ? (
              <LiteWallet onAskAria={prefillDraft} />
            ) : view === 'trade' ? (
              <LiteTrade onAskAria={prefillDraft} />
            ) : view === 'scanner' ? (
              <LiteScanner onAskAria={prefillDraft} />
            ) : showHome ? (
              <LiteHome draft={draft} onDraftChange={setDraft} onSend={sendDraft} onQuickAction={prefillDraft} />
            ) : (
              <LiteChat draft={draft} onDraftChange={setDraft} onSend={sendDraft} />
            )}
          </main>
        </div>
      )}
    </div>
  )
}
