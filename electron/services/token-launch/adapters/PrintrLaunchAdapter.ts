import * as WalletService from '../../WalletService'
import { uploadTokenMetadata } from '../metadata'
import type {
  AdapterLaunchResult,
  PrintrLaunchpadConfig,
  TokenLaunchAdapter,
  TokenLaunchCheck,
  TokenLaunchInput,
} from '../types'

const DEFAULT_API_BASE_URL = 'https://api-preview.printr.money'
const DEFAULT_QUOTE_PATH = '/quote'
const DEFAULT_CREATE_PATH = '/create'
const DEFAULT_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const REQUEST_TIMEOUT_MS = 30_000

interface PrintrDeps {
  env?: NodeJS.ProcessEnv
  settings?: PrintrLaunchpadConfig
  uploadMetadata?: typeof uploadTokenMetadata
  fetchImpl?: typeof fetch
}

interface PrintrCreateResponse {
  signature?: string
  mint?: string
  tokenAddress?: string
  contractAddress?: string
  metadataUri?: string | null
  poolAddress?: string | null
  bondingCurveAddress?: string | null
  receipts?: Record<string, unknown>
  data?: Record<string, unknown>
  result?: Record<string, unknown>
}

function resolveConfig(env: NodeJS.ProcessEnv, settings?: PrintrLaunchpadConfig) {
  return {
    apiBaseUrl: normalizeUrl(settings?.apiBaseUrl) || normalizeUrl(env.PRINTR_API_BASE_URL) || DEFAULT_API_BASE_URL,
    apiKey: normalizeText(settings?.apiKey) || normalizeText(env.PRINTR_API_KEY),
    quotePath: normalizePath(settings?.quotePath) || normalizePath(env.PRINTR_API_QUOTE_PATH) || DEFAULT_QUOTE_PATH,
    createPath: normalizePath(settings?.createPath) || normalizePath(env.PRINTR_API_CREATE_PATH) || DEFAULT_CREATE_PATH,
    chain: normalizeText(settings?.chain) || normalizeText(env.PRINTR_API_CHAIN) || DEFAULT_CHAIN,
  }
}

function getDefinition(config: ReturnType<typeof resolveConfig>) {
  const ready = Boolean(config.apiBaseUrl && config.apiKey)
  return {
    id: 'printr' as const,
    name: 'Printr',
    description: 'API-driven launch flow via Printr partner integration',
    status: ready ? 'available' as const : 'planned' as const,
    enabled: ready,
    reason: ready ? null : 'Set a Printr API base URL and API key to enable beta launch support.',
  }
}

export function createPrintrLaunchAdapter(deps: PrintrDeps = {}): TokenLaunchAdapter {
  const env = deps.env ?? process.env
  const config = resolveConfig(env, deps.settings)
  const definition = getDefinition(config)
  const uploadMetadataImpl = deps.uploadMetadata ?? uploadTokenMetadata
  const fetchImpl = deps.fetchImpl ?? fetch

  return {
    definition,
    async preflight(input?: TokenLaunchInput): Promise<TokenLaunchCheck[]> {
      const checks: TokenLaunchCheck[] = []

      checks.push({
        id: 'printr-api-base-url',
        label: 'Printr API Base URL',
        status: config.apiBaseUrl ? 'pass' : 'fail',
        detail: config.apiBaseUrl || 'Printr API base URL is missing.',
      })
      checks.push({
        id: 'printr-api-key',
        label: 'Printr API Key',
        status: config.apiKey ? 'pass' : 'fail',
        detail: config.apiKey ? 'Printr API key is configured.' : 'Printr API key is missing.',
      })
      checks.push({
        id: 'printr-quote-path',
        label: 'Printr Quote Path',
        status: config.quotePath ? 'pass' : 'warn',
        detail: config.quotePath || 'Printr quote path is not configured. API quote checks will be skipped.',
      })
      checks.push({
        id: 'printr-create-path',
        label: 'Printr Create Path',
        status: config.createPath ? 'pass' : 'fail',
        detail: config.createPath || 'Printr create path is missing.',
      })
      checks.push({
        id: 'printr-chain',
        label: 'Printr Chain',
        status: config.chain ? 'pass' : 'fail',
        detail: config.chain || 'Printr chain identifier is missing.',
      })

      if (!config.apiBaseUrl || !config.apiKey) {
        return checks
      }

      try {
        const url = new URL(config.apiBaseUrl)
        checks.push({
          id: 'printr-api-host',
          label: 'Printr API Host',
          status: url.protocol === 'https:' ? 'pass' : 'warn',
          detail: `Using ${url.origin}`,
        })
      } catch (error) {
        checks.push({
          id: 'printr-api-host',
          label: 'Printr API Host',
          status: 'fail',
          detail: error instanceof Error ? error.message : 'Invalid Printr API base URL.',
        })
      }

      if (config.quotePath) {
        try {
          const quoteResponse = await requestPrintrApi({
            fetchImpl,
            apiBaseUrl: config.apiBaseUrl,
            path: config.quotePath,
            apiKey: config.apiKey,
            body: {
              chain: config.chain,
              anchorInitialBuyAmountSol: input?.initialBuySol ?? 0.1,
            },
          })
          checks.push({
            id: 'printr-quote-api',
            label: 'Printr Quote API',
            status: 'pass',
            detail: `Quote endpoint responded${quoteResponse.summary ? `: ${quoteResponse.summary}` : '.'}`,
          })
        } catch (error) {
          checks.push({
            id: 'printr-quote-api',
            label: 'Printr Quote API',
            status: 'warn',
            detail: error instanceof Error ? error.message : 'Quote endpoint did not respond successfully.',
          })
        }
      }

      return checks
    },
    async createLaunch(input: TokenLaunchInput): Promise<AdapterLaunchResult> {
      if (!definition.enabled) {
        throw new Error(definition.reason ?? 'Printr launch support is not configured')
      }

      const metadata = await uploadMetadataImpl(input)
      const wallet = WalletService.listWallets().find((entry) => entry.id === input.walletId)
      if (!wallet) {
        throw new Error('Selected wallet was not found in the local wallet registry')
      }
      const requestBody = {
        chain: config.chain,
        anchorInitialBuyAmountSol: input.initialBuySol,
        token: {
          name: input.name,
          symbol: input.symbol,
          description: input.description,
          metadataUri: metadata.metadataUri,
          socials: {
            twitter: input.twitter ?? '',
            telegram: input.telegram ?? '',
            website: input.website ?? '',
          },
        },
        launch: {
          slippageBps: input.slippageBps,
          priorityFeeSol: input.priorityFeeSol,
        },
        wallet: {
          address: wallet.address,
        },
      }

      const quoteResponse = config.quotePath
        ? await requestPrintrApi({
            fetchImpl,
            apiBaseUrl: config.apiBaseUrl,
            path: config.quotePath,
            apiKey: config.apiKey,
            body: requestBody,
          })
        : null

      const createResponse = await requestPrintrApi({
        fetchImpl,
        apiBaseUrl: config.apiBaseUrl,
        path: config.createPath,
        apiKey: config.apiKey,
        body: requestBody,
      })
      const result = normalizeResponse(createResponse.payload)
      if (!result.signature || !result.mint) {
        throw new Error('Printr API response did not include a signature and mint address')
      }

      return {
        signature: result.signature,
        mint: result.mint,
        metadataUri: result.metadataUri ?? metadata.metadataUri,
        poolAddress: result.poolAddress ?? null,
        bondingCurveAddress: result.bondingCurveAddress ?? null,
        protocolReceipts: {
          provider: 'printr-api',
          apiBaseUrl: config.apiBaseUrl,
          quotePath: config.quotePath,
          createPath: config.createPath,
          chain: config.chain,
          walletAddress: wallet.address,
          request: {
            initialBuySol: input.initialBuySol,
            slippageBps: input.slippageBps,
            priorityFeeSol: input.priorityFeeSol,
          },
          quoteResponse: quoteResponse?.payload ?? null,
          createResponse: createResponse.payload,
        },
      }
    },
  }
}

async function requestPrintrApi(input: {
  fetchImpl: typeof fetch
  apiBaseUrl: string
  path: string
  apiKey: string
  body: Record<string, unknown>
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const url = new URL(input.path, appendTrailingSlash(input.apiBaseUrl))
    const response = await input.fetchImpl(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
        'x-api-key': input.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: controller.signal,
    })
    const text = await response.text()
    const payload = tryParseJson(text)
    if (!response.ok) {
      const detail = extractErrorMessage(payload) || text || `Printr API request failed with status ${response.status}`
      throw new Error(detail)
    }
    return {
      ok: true,
      payload,
      summary: extractSummary(payload),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeUrl(value: unknown): string {
  const text = normalizeText(value)
  if (!text) return ''
  return text.replace(/\/+$/, '')
}

function normalizePath(value: unknown): string {
  const text = normalizeText(value)
  if (!text) return ''
  return text.startsWith('/') ? text : `/${text}`
}

function appendTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function tryParseJson(value: string): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record.error === 'string') return record.error
  if (typeof record.message === 'string') return record.message
  if (record.error && typeof record.error === 'object' && typeof (record.error as Record<string, unknown>).message === 'string') {
    return (record.error as Record<string, unknown>).message as string
  }
  return null
}

function extractSummary(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const parts = [
    typeof record.message === 'string' ? record.message : null,
    typeof record.status === 'string' ? record.status : null,
    typeof record.quoteId === 'string' ? `quote ${record.quoteId}` : null,
  ].filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join(' | ') : null
}

function normalizeResponse(payload: unknown) {
  const source = extractRecord(payload)
  const nested = extractRecord(source?.data) ?? extractRecord(source?.result)
  const response = (nested ?? source ?? {}) as PrintrCreateResponse
  const mint = firstString(response.mint, response.tokenAddress, response.contractAddress)
  const signature = firstString(response.signature, extractString(nested, 'txSignature'), extractString(nested, 'transactionSignature'))
  return {
    signature,
    mint,
    metadataUri: firstString(response.metadataUri, extractString(nested, 'metadataUri')),
    poolAddress: firstString(response.poolAddress, extractString(nested, 'poolAddress'), extractString(nested, 'poolId')),
    bondingCurveAddress: firstString(response.bondingCurveAddress, extractString(nested, 'bondingCurveAddress')),
  }
}

function extractRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function extractString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function firstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}
