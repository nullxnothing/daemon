import { useBrowserStore } from '../store/browser'
import { useUIStore } from '../store/ui'

function buildPumpFunTokenUrl(mint: string): string {
  return `https://pump.fun/coin/${mint}`
}

function buildPrintrTokenUrl(mint: string): string {
  return `https://app.printr.money/v2/trade/${mint}`
}

export function openLaunchInBrowserMode(launchpad: LaunchpadId, mint: string) {
  const trimmedMint = mint.trim()
  if (!trimmedMint) return

  let url: string | null = null

  if (launchpad === 'pumpfun') {
    url = buildPumpFunTokenUrl(trimmedMint)
  } else if (launchpad === 'printr') {
    url = buildPrintrTokenUrl(trimmedMint)
  }

  if (!url) return

  const browserStore = useBrowserStore.getState()
  const uiStore = useUIStore.getState()

  browserStore.setUrl(url)
  browserStore.setLoadStatus('loading')
  uiStore.openBrowserTab()

  window.daemon.browser.navigate(url).then((res) => {
    if (res.ok && res.data) {
      useBrowserStore.getState().setLastPageId(res.data.pageId)
    }
  }).catch(() => {})
}

