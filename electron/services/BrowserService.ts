import { pluginPrompt, orchestratedPrompt } from './PluginPrompt'
import type { BrowserPage, BrowserNavResult, BrowserAnalysis } from '../shared/types'

const PLUGIN_ID = 'browser'

// In-memory page cache — lightweight, no DB needed
const pageCache = new Map<string, BrowserPage>()
let pageIdCounter = 0

function nextPageId(): string {
  return `page-${++pageIdCounter}-${Date.now()}`
}

// --- URL Safety ---

function isBlockedBrowserHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized) return true

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (normalized === '0.0.0.0' || normalized === '::' || normalized === '::1') return true
  if (normalized === 'metadata.google.internal') return true
  if (normalized.endsWith('.local') || normalized.endsWith('.internal')) return true

  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(normalized)) return true

  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true

  return false
}

function isBlockedNavigationUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    if (!['http:', 'https:'].includes(parsed.protocol)) return true
    if (parsed.username || parsed.password) return true
    return isBlockedBrowserHost(parsed.hostname)
  } catch { return true }
}

// --- Navigation ---

export async function navigate(url: string): Promise<BrowserNavResult> {
  // Normalize bare hostnames without mutating explicit non-http schemes.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`
  }

  if (isBlockedNavigationUrl(url)) {
    throw new Error('Navigation blocked: URL targets an internal or unsafe address')
  }

  // Create a page entry with the URL — actual content comes from webview via capturePageContent
  const page: BrowserPage = {
    id: nextPageId(),
    url,
    title: 'Loading...',
    content: '',
    timestamp: Date.now(),
  }

  pageCache.set(page.id, page)

  // Keep cache bounded
  if (pageCache.size > 50) {
    const oldest = [...pageCache.keys()][0]
    pageCache.delete(oldest)
  }

  return {
    pageId: page.id,
    url,
    title: page.title,
    status: 0,
    contentLength: 0,
  }
}

// --- Webview Content Capture ---

export function capturePageContent(
  pageId: string,
  url: string,
  title: string,
  content: string,
): void {
  const existing = pageCache.get(pageId)
  if (existing) {
    existing.url = url
    existing.title = title
    existing.content = content
    existing.timestamp = Date.now()
  } else {
    // Capture without a prior navigate (e.g. user clicked a link in the webview)
    const page: BrowserPage = {
      id: pageId,
      url,
      title,
      content,
      timestamp: Date.now(),
    }
    pageCache.set(page.id, page)

    if (pageCache.size > 50) {
      const oldest = [...pageCache.keys()][0]
      pageCache.delete(oldest)
    }
  }
}

// --- Page Content ---

export function getPage(pageId: string): BrowserPage | null {
  return pageCache.get(pageId) ?? null
}

export function getLatestPage(): BrowserPage | null {
  const pages = [...pageCache.values()]
  return pages.length > 0 ? pages[pages.length - 1] : null
}

// --- AI Analysis ---

export async function analyzePage(
  pageId: string,
  type: 'summarize' | 'extract' | 'audit' | 'compare',
  target?: string,
): Promise<BrowserAnalysis> {
  const page = pageCache.get(pageId)
  if (!page) throw new Error(`Page ${pageId} not found in cache`)

  const templateMap: Record<string, { templateId: string; vars: Record<string, string> }> = {
    summarize: {
      templateId: 'summarize-page',
      vars: { url: page.url, content: truncate(page.content, 8000) },
    },
    extract: {
      templateId: 'extract-data',
      vars: { content: truncate(page.content, 8000), target: target ?? 'all structured data' },
    },
    audit: {
      templateId: 'audit-page',
      vars: { url: page.url, html: truncate(page.content, 6000), requests: '(not available in fetch mode)' },
    },
    compare: {
      templateId: 'compare-pages',
      vars: { before: target ?? '', after: truncate(page.content, 4000) },
    },
  }

  const config = templateMap[type]
  if (!config) throw new Error(`Unknown analysis type: ${type}`)

  const sagaResult = await orchestratedPrompt({
    sagaId: `browser-${type}-${pageId}-${Date.now()}`,
    sagaName: `Browser ${type} analysis`,
    steps: [
      {
        name: `${type}-analysis`,
        execute: async () => {
          const res = await pluginPrompt({
            pluginId: PLUGIN_ID,
            templateId: config.templateId,
            vars: config.vars,
          })
          return res.text
        },
      },
    ],
  })

  const text = sagaResult.results[0] as string

  return {
    url: page.url,
    summary: text,
    findings: extractFindings(text),
    type,
  }
}

export async function auditPage(pageId: string): Promise<BrowserAnalysis> {
  return analyzePage(pageId, 'audit')
}

// --- History ---

export function getHistory(): BrowserPage[] {
  return [...pageCache.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ id, url, title, timestamp, content }) => ({
      id,
      url,
      title,
      content: content.slice(0, 200),
      timestamp,
    }))
}

export function clearHistory(): void {
  pageCache.clear()
}

// --- Helpers ---

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n\n[truncated]'
}

function extractFindings(text: string): string[] {
  // Pull bullet points or numbered items from the analysis
  const lines = text.split('\n')
  return lines
    .filter((line) => /^[\s]*[-*•]\s/.test(line) || /^[\s]*\d+[.)]\s/.test(line))
    .map((line) => line.replace(/^[\s]*[-*•\d.)\s]+/, '').trim())
    .filter(Boolean)
}
