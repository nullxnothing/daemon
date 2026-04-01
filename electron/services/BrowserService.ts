import { pluginPrompt, orchestratedPrompt } from './PluginPrompt'
import type { BrowserPage, BrowserNavResult, BrowserAnalysis } from '../shared/types'

const PLUGIN_ID = 'browser'

// In-memory page cache — lightweight, no DB needed
const pageCache = new Map<string, BrowserPage>()
let pageIdCounter = 0

function nextPageId(): string {
  return `page-${++pageIdCounter}-${Date.now()}`
}

// --- Navigation ---

export async function navigate(url: string): Promise<BrowserNavResult> {
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  })

  const html = await response.text()
  const title = extractTitle(html)
  const text = stripHtmlToText(html)

  const page: BrowserPage = {
    id: nextPageId(),
    url: response.url,
    title,
    content: text,
    timestamp: Date.now(),
  }

  pageCache.set(page.id, page)

  // Keep cache bounded
  if (pageCache.size > 50) {
    const oldest = [...pageCache.keys()][0]
    pageCache.delete(oldest)
  }

  return {
    url: response.url,
    title,
    status: response.status,
    contentLength: html.length,
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

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1]?.trim() ?? 'Untitled'
}

function stripHtmlToText(html: string): string {
  return html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    // Convert structural elements to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
