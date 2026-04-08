import { isIP } from 'node:net'
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

function isIpv4InCidr(ip: string, network: string, prefixLength: number): boolean {
  const octets = ip.split('.').map(Number)
  const networkOctets = network.split('.').map(Number)
  if (octets.length !== 4 || networkOctets.length !== 4 || octets.some(Number.isNaN) || networkOctets.some(Number.isNaN)) {
    return false
  }

  let ipValue = 0
  let networkValue = 0
  for (let i = 0; i < 4; i++) {
    ipValue = (ipValue << 8) + octets[i]
    networkValue = (networkValue << 8) + networkOctets[i]
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  return (ipValue & mask) === (networkValue & mask)
}

const BLOCKED_IPV4_RANGES: Array<{ network: string; prefixLength: number }> = [
  { network: '0.0.0.0', prefixLength: 8 },
  { network: '10.0.0.0', prefixLength: 8 },
  { network: '127.0.0.0', prefixLength: 8 },
  { network: '169.254.0.0', prefixLength: 16 },
  { network: '172.16.0.0', prefixLength: 12 },
  { network: '192.168.0.0', prefixLength: 16 },
  { network: '100.64.0.0', prefixLength: 10 },
  { network: '198.18.0.0', prefixLength: 15 },
  { network: '224.0.0.0', prefixLength: 4 },
  { network: '240.0.0.0', prefixLength: 4 },
  { network: '168.63.129.16', prefixLength: 32 },
]

export function isBlockedBrowserHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return true

  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === 'metadata.google.internal'
    || normalized === 'metadata.azure.internal'
    || normalized === 'kubernetes'
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.localdomain')
    || normalized.endsWith('.home.arpa')
    || normalized.endsWith('.cluster.local')
  ) {
    return true
  }

  const ipType = isIP(normalized)
  if (ipType === 4) {
    return BLOCKED_IPV4_RANGES.some(({ network, prefixLength }) => isIpv4InCidr(normalized, network, prefixLength))
  }

  if (ipType === 6) {
    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fe80:')
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('ff')
      || normalized === '::ffff:127.0.0.1'
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.')
      || /^::ffff:172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
      || normalized === '::ffff:169.254.169.254'
      || normalized === '::ffff:168.63.129.16'
  }

  return false
}

export function isBlockedBrowserUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)
    if (!['http:', 'https:'].includes(parsed.protocol)) return true
    if (parsed.username || parsed.password) return true
    return isBlockedBrowserHost(parsed.hostname)
  } catch { return true }
}

// --- Navigation ---

export async function navigate(url: string): Promise<BrowserNavResult> {
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  if (isBlockedBrowserUrl(url)) {
    throw new Error('Navigation to private, local, or metadata endpoints is blocked')
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
