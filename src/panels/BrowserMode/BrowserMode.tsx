import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useBrowserStore } from '../../store/browser'
import { PluginErrorBoundary } from '../../components/ErrorBoundary'
import { useNotificationsStore } from '../../store/notifications'
import { BrowserToolbar } from './BrowserToolbar'
import { BrowserWebview, BrowserWebviewHandle } from './BrowserWebview'
import './BrowserMode.css'

type LocalTarget = {
  label: string
  url: string
  meta?: string
}

const COMMON_DEV_PORTS = new Set([3000, 3001, 4173, 4321, 5000, 5173, 8000, 8080, 8787])
const DEV_PROCESS_PATTERN = /(node|bun|vite|next|react|wrangler|python|deno|php|ruby|go|serve|http-server|astro|nuxt|svelte)/i

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '')
}

export function BrowserMode() {
  const webviewRef = useRef<BrowserWebviewHandle>(null)
  const [registeredTargets, setRegisteredTargets] = useState<LocalTarget[]>([])
  const [discoveredTargets, setDiscoveredTargets] = useState<LocalTarget[]>([])
  const [registeredLoading, setRegisteredLoading] = useState(false)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [lastCopiedTimestamp, setLastCopiedTimestamp] = useState<number | null>(null)

  const currentUrl = useBrowserStore((s) => s.currentUrl)
  const isInspectMode = useBrowserStore((s) => s.isInspectMode)
  const loadStatus = useBrowserStore((s) => s.loadStatus)
  const canGoBack = useBrowserStore((s) => s.canGoBack)
  const canGoForward = useBrowserStore((s) => s.canGoForward)
  const inspectorResults = useBrowserStore((s) => s.inspectorResults)
  const setUrl = useBrowserStore((s) => s.setUrl)
  const setInspectMode = useBrowserStore((s) => s.setInspectMode)

  const handleNavigate = useCallback((url: string) => {
    setUrl(url)
    webviewRef.current?.navigate(url)
  }, [setUrl])

  const handleBack = useCallback(() => {
    webviewRef.current?.goBack()
  }, [])

  const handleForward = useCallback(() => {
    webviewRef.current?.goForward()
  }, [])

  const handleReload = useCallback(() => {
    webviewRef.current?.reload()
  }, [])

  const handleToggleInspect = useCallback(() => {
    const next = !isInspectMode
    setInspectMode(next)
    if (next) {
      webviewRef.current?.injectInspector()
    } else {
      webviewRef.current?.removeInspector()
    }
  }, [isInspectMode, setInspectMode])

  const loadRegisteredTargets = useCallback(async () => {
    setRegisteredLoading(true)
    try {
      const res = await window.daemon.ports.registered()
      if (!res.ok || !res.data) {
        setRegisteredTargets([])
        return
      }

      const nextTargets = [...res.data]
        .filter((entry) => entry.port >= 1024)
        .map((entry) => ({
          label: entry.serviceName || `Local app :${entry.port}`,
          url: `http://127.0.0.1:${entry.port}`,
          meta: entry.projectName !== 'Unknown' ? entry.projectName : undefined,
        }))
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.url === entry.url) === index)
        .sort((a, b) => a.label.localeCompare(b.label))

      setRegisteredTargets(nextTargets)
    } finally {
      setRegisteredLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRegisteredTargets()
  }, [loadRegisteredTargets])

  const loadDiscoveredTargets = useCallback(async () => {
    setDiscoveryLoading(true)
    try {
      const res = await window.daemon.ports.scan()
      if (!res.ok || !res.data) {
        setDiscoveredTargets([])
        return
      }

      const registeredUrls = new Set(registeredTargets.map((target) => normalizeUrl(target.url)))
      const nextTargets = [...res.data]
        .filter((entry) => entry.port >= 1024)
        .filter((entry) => COMMON_DEV_PORTS.has(entry.port) || DEV_PROCESS_PATTERN.test(entry.processName ?? ''))
        .map((entry) => ({
          label: entry.processName ? `${entry.processName} :${entry.port}` : `Suggested app :${entry.port}`,
          url: `http://127.0.0.1:${entry.port}`,
        }))
        .filter((entry) => !registeredUrls.has(normalizeUrl(entry.url)))
        .filter((entry, index, list) => list.findIndex((candidate) => candidate.url === entry.url) === index)
        .sort((a, b) => a.url.localeCompare(b.url))
        .slice(0, 6)

      setDiscoveredTargets(nextTargets)
    } finally {
      setDiscoveryLoading(false)
    }
  }, [registeredTargets])

  const latestInspectResult = inspectorResults.length > 0 ? inspectorResults[inspectorResults.length - 1] : null
  const statusLabel = loadStatus === 'loaded'
    ? 'Ready'
    : loadStatus === 'loading'
      ? 'Loading'
      : loadStatus === 'error'
        ? 'Needs attention'
        : 'Idle'

  const inspectSummary = useMemo(() => {
    if (!latestInspectResult) {
      return isInspectMode
        ? 'Click any element and the selector will copy automatically.'
        : 'Turn on inspect to copy selectors from the page.'
    }
    const label = latestInspectResult.text?.trim() || latestInspectResult.tagName.toLowerCase()
    return `Copied selector for ${label}`
  }, [isInspectMode, latestInspectResult])

  useEffect(() => {
    if (!latestInspectResult?.selector) return
    if (latestInspectResult.timestamp === lastCopiedTimestamp) return

    let cancelled = false
    void daemon.env.copyValue(latestInspectResult.selector)
      .then(async (res) => {
        if (!res.ok) {
          await navigator.clipboard.writeText(latestInspectResult.selector)
        }
        if (cancelled) return
        setLastCopiedTimestamp(latestInspectResult.timestamp)
        const label = latestInspectResult.text?.trim() || latestInspectResult.tagName.toLowerCase()
        useNotificationsStore.getState().pushSuccess(`Copied selector for ${label}`, 'Browser')
      })
      .catch(() => {
        if (cancelled) return
        useNotificationsStore.getState().pushError('Failed to copy selector', 'Browser')
      })

    return () => {
      cancelled = true
    }
  }, [lastCopiedTimestamp, latestInspectResult])

  const currentLocation = normalizeUrl(currentUrl)

  return (
    <div className="browser-mode">
      <section className="browser-shell">
        <div className="browser-toolbar-row">
          <BrowserToolbar
            url={currentUrl}
            onNavigate={handleNavigate}
            onBack={handleBack}
            onForward={handleForward}
            onReload={handleReload}
            isInspectMode={isInspectMode}
            onToggleInspect={handleToggleInspect}
            loadStatus={loadStatus}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
          />
          <div className="browser-local-strip">
            <button className="browser-local-refresh" onClick={() => void loadRegisteredTargets()} title="Refresh tracked local apps">
              {registeredLoading ? 'Refreshing...' : 'Tracked apps'}
            </button>
            {registeredTargets.map((target) => (
              <button
                key={target.url}
                className={`browser-local-target${currentLocation === normalizeUrl(target.url) ? ' active' : ''}`}
                onClick={() => handleNavigate(target.url)}
                title={target.meta ? `${target.meta} · ${target.url}` : target.url}
              >
                {target.label}
              </button>
            ))}
            <button className="browser-local-refresh" onClick={() => void loadDiscoveredTargets()} title="Scan for likely local dev servers">
              {discoveryLoading ? 'Scanning...' : 'Scan suggestions'}
            </button>
          </div>
          {discoveredTargets.length > 0 && (
            <div className="browser-local-strip browser-local-strip--secondary">
              {discoveredTargets.map((target) => (
                <button
                  key={target.url}
                  className={`browser-local-target browser-local-target--suggested${currentLocation === normalizeUrl(target.url) ? ' active' : ''}`}
                  onClick={() => handleNavigate(target.url)}
                  title={target.url}
                >
                  {target.label}
                </button>
              ))}
            </div>
          )}
          {registeredTargets.length === 0 && discoveredTargets.length === 0 && !registeredLoading && !discoveryLoading && (
            <div className="browser-local-hint">
              Start local apps inside DAEMON to keep them tracked here. Use suggestions only when you need to discover an external dev server.
            </div>
          )}
        </div>

        <div className="browser-inspect-strip">
          <div className="browser-inspect-status">
            <span>{statusLabel}</span>
            <span>{isInspectMode ? 'Inspect on' : 'Inspect off'}</span>
          </div>
          <div className="browser-inspect-selector">{inspectSummary}</div>
        </div>
      </section>

      <div className="browser-webview-area" style={{ flex: 1 }}>
        <PluginErrorBoundary>
          <BrowserWebview ref={webviewRef} />
        </PluginErrorBoundary>
      </div>
    </div>
  )
}
