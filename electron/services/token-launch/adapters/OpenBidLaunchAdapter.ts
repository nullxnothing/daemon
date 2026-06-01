import fs from 'node:fs'
import path from 'node:path'
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
  type Connection,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { executeTransaction, getConnection, withKeypair } from '../../SolanaService'
import { getWalletInfrastructureSettings } from '../../SettingsService'
import type {
  AdapterLaunchResult,
  OpenBidLaunchpadConfig,
  OpenBidLaunchInputConfig,
  TokenLaunchAdapter,
  TokenLaunchCheck,
  TokenLaunchInput,
} from '../types'

const DEFAULT_API_BASE_URL = 'https://cdn.based.bid/api'
const DEFAULT_CHAIN_ID = '5011'
const DEFAULT_DEX = 'meteora'
const DEFAULT_FEE_TIER = '1'
const DEFAULT_PACKAGE_TYPE = 'based'
const DEFAULT_MARKET_CAP = '11000'
const DEFAULT_TOTAL_SUPPLY = '1000000000'
const DEFAULT_MAX_ALLOCATION_PER_USER = '0'
const DEFAULT_INITIAL_BUY_PERCENT = 0.1
const MIN_MARKET_CAP = 11_000
const MAX_MARKET_CAP = 10_000_000
const MAX_INITIAL_BUY_PERCENT = 80.2
const SOLANA_DECIMALS = 9
const SOLANA_BASE_TOKEN_PAIR = 'So11111111111111111111111111111111111111112'
const SOLANA_ZERO_ADDRESS = '11111111111111111111111111111111'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_TRANSACTION_BYTES = 1232
const MAX_TOKEN_IMAGE_BYTES = 5 * 1024 * 1024
const DEFAULT_ALLOWED_PROGRAM_IDS = [
  ComputeBudgetProgram.programId.toBase58(),
  SystemProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
]

type OpenBidDex = 'meteora' | 'raydium'
type OpenBidPackageType = 'based' | 'super_based' | 'ultra_based'

interface OpenBidDeps {
  env?: NodeJS.ProcessEnv
  settings?: OpenBidLaunchpadConfig
  fetchImpl?: typeof fetch
  withKeypairImpl?: typeof withKeypair
  getConnectionImpl?: typeof getConnection
  executeTransactionImpl?: typeof executeTransaction
  getWalletInfrastructureSettingsImpl?: typeof getWalletInfrastructureSettings
}

interface BasedBidUploadResponse {
  response?: { url?: string }
  url?: string
}

interface CreateLbpSolanaApiResponse {
  ok?: boolean
  chainId?: number
  chainSymbol?: string
  transaction?: string
  mintAddress?: string
  mintSignerSecretHex?: string
  lookupTableAddresses?: string[]
  blockhash?: string
  lastValidBlockHeight?: number
  signingNote?: string
  metadataUrl?: string
  value?: string
}

interface ResolvedOpenBidConfig {
  apiBaseUrl: string
  chainId: string
  dex: OpenBidDex
  feeTier: string
  packageType: OpenBidPackageType
  marketCap: string
  totalSupply: string
  maxAllocationPerUser: string
  initialBuyPercent: number
  referrer: string
  board: string
  boardOwner: string
  saleStartTime: number | null
  softCap: string
  endTime: number | null
  whitelistedAddresses: string[]
  buyFeePercent: number
  sellFeePercent: number
  referralFeePercent: number
  graduationFeePercent: number
  dynamicFee: boolean
}

function resolveConfig(env: NodeJS.ProcessEnv, settings?: OpenBidLaunchpadConfig): ResolvedOpenBidConfig {
  return {
    apiBaseUrl: normalizeUrl(settings?.apiBaseUrl) || normalizeUrl(env.OPENBID_API_BASE_URL) || DEFAULT_API_BASE_URL,
    chainId: normalizeText(settings?.chainId) || normalizeText(env.OPENBID_SOLANA_CHAIN_ID) || DEFAULT_CHAIN_ID,
    dex: normalizeDex(settings?.dex) || normalizeDex(env.OPENBID_SOLANA_DEX) || DEFAULT_DEX,
    feeTier: normalizeText(settings?.feeTier) || normalizeText(env.OPENBID_SOLANA_FEE_TIER) || DEFAULT_FEE_TIER,
    packageType: normalizePackageType(settings?.packageType) || normalizePackageType(env.OPENBID_PACKAGE_TYPE) || DEFAULT_PACKAGE_TYPE,
    marketCap: normalizeText(settings?.marketCap) || normalizeText(env.OPENBID_MARKET_CAP) || DEFAULT_MARKET_CAP,
    totalSupply: normalizeText(settings?.totalSupply) || normalizeText(env.OPENBID_TOTAL_SUPPLY) || DEFAULT_TOTAL_SUPPLY,
    maxAllocationPerUser: normalizeText(settings?.maxAllocationPerUser) || normalizeText(env.OPENBID_MAX_ALLOCATION_PER_USER) || DEFAULT_MAX_ALLOCATION_PER_USER,
    initialBuyPercent: DEFAULT_INITIAL_BUY_PERCENT,
    referrer: normalizeText(settings?.referrer) || normalizeText(env.OPENBID_REFERRER) || SOLANA_ZERO_ADDRESS,
    board: normalizeText(settings?.board) || normalizeText(env.OPENBID_BOARD),
    boardOwner: normalizeText(settings?.boardOwner) || normalizeText(env.OPENBID_BOARD_OWNER),
    saleStartTime: null,
    softCap: '',
    endTime: null,
    whitelistedAddresses: [],
    buyFeePercent: 0,
    sellFeePercent: 0,
    referralFeePercent: 0,
    graduationFeePercent: 0,
    dynamicFee: false,
  }
}

function getDefinition(config: ResolvedOpenBidConfig, cluster: string) {
  const ready = Boolean(config.apiBaseUrl && cluster === 'devnet')
  return {
    id: 'openbid' as const,
    name: 'basedbid',
    description: 'basedbid Pool/LBP launch through API-built Solana transactions',
    status: ready ? 'available' as const : 'planned' as const,
    enabled: ready,
    reason: ready
      ? null
      : cluster !== 'devnet'
        ? 'basedbid Solana launch support is currently devnet-only. Switch DAEMON wallet infrastructure to devnet.'
        : 'basedbid API base URL is not configured.',
  }
}

export function createOpenBidLaunchAdapter(deps: OpenBidDeps = {}): TokenLaunchAdapter {
  const env = deps.env ?? process.env
  const config = resolveConfig(env, deps.settings)
  const fetchImpl = deps.fetchImpl ?? fetch
  const withKeypairImpl = deps.withKeypairImpl ?? withKeypair
  const getConnectionImpl = deps.getConnectionImpl ?? getConnection
  const executeTransactionImpl = deps.executeTransactionImpl ?? executeTransaction
  const getWalletInfrastructureSettingsImpl = deps.getWalletInfrastructureSettingsImpl ?? getWalletInfrastructureSettings
  const definition = getDefinition(config, getWalletInfrastructureSettingsImpl().cluster)

  return {
    definition,
    async preflight(input: TokenLaunchInput): Promise<TokenLaunchCheck[]> {
      const checks: TokenLaunchCheck[] = []
      const launchConfig = resolveLaunchConfig(config, input.openbid)
      const infra = getWalletInfrastructureSettingsImpl()
      checks.push({
        id: 'openbid-cluster',
        label: 'basedbid Cluster',
        status: infra.cluster === 'devnet' ? 'pass' : 'fail',
        detail: infra.cluster === 'devnet'
          ? 'basedbid Solana Pool/LBP flow is targeting devnet chain 5011.'
          : `DAEMON is set to ${infra.cluster}; switch wallet infrastructure to devnet before using basedbid.`,
      })
      checks.push({
        id: 'openbid-api',
        label: 'basedbid API',
        status: config.apiBaseUrl ? 'pass' : 'fail',
        detail: config.apiBaseUrl || 'basedbid API base URL is missing.',
      })
      checks.push({
        id: 'openbid-image',
        label: 'Token Image',
        status: input.imagePath && fs.existsSync(input.imagePath) ? 'pass' : 'fail',
        detail: input.imagePath
          ? fs.existsSync(input.imagePath)
            ? `basedbid logo upload will use ${path.basename(input.imagePath)}.`
            : 'Selected token image was not found on disk.'
          : 'basedbid requires a token image for the metadata upload.',
      })
      const dexFeeError = validateDexFeeTier(launchConfig)
      checks.push({
        id: 'openbid-dex',
        label: 'basedbid DEX',
        status: dexFeeError ? 'fail' : 'pass',
        detail: dexFeeError ?? `${launchConfig.dex} fee tier ${launchConfig.feeTier}.`,
      })
      const saleError = validateMarketCap(launchConfig.marketCap)
        ?? (isPositiveNumberString(launchConfig.totalSupply) ? null : 'basedbid total supply must be a valid number')
      checks.push({
        id: 'openbid-sale',
        label: 'basedbid Sale',
        status: saleError ? 'fail' : 'pass',
        detail: saleError ?? `Market cap ${launchConfig.marketCap}, supply ${launchConfig.totalSupply}.`,
      })
      const initialBuyError = validateInitialBuyPercent(launchConfig.initialBuyPercent)
      checks.push({
        id: 'openbid-initial-buy',
        label: 'Initial Buy',
        status: initialBuyError ? 'fail' : 'pass',
        detail: initialBuyError ?? `Creator launch buy is ${launchConfig.initialBuyPercent}% of supply.`,
      })
      if ((launchConfig.board && !launchConfig.boardOwner) || (!launchConfig.board && launchConfig.boardOwner)) {
        checks.push({
          id: 'openbid-board',
          label: 'basedbid Board',
          status: 'fail',
          detail: 'Board and board owner must both be set or both be empty.',
        })
      }
      if ((launchConfig.softCap && !launchConfig.endTime) || (!launchConfig.softCap && launchConfig.endTime)) {
        checks.push({
          id: 'openbid-soft-cap',
          label: 'Soft Cap',
          status: 'fail',
          detail: 'Soft cap protection requires both a soft cap and an end time.',
        })
      }
      const feeError = validateFeeConfig(launchConfig)
      checks.push({
        id: 'openbid-fees',
        label: 'Creator Fees',
        status: feeError ? 'fail' : 'pass',
        detail: feeError ?? `Buy ${launchConfig.buyFeePercent}%, sell ${launchConfig.sellFeePercent}%, referral ${launchConfig.referralFeePercent}%, graduation ${launchConfig.graduationFeePercent}%.`,
      })
      const addressError = validateAddressConfig(launchConfig)
      if (addressError) {
        checks.push({
          id: 'openbid-addresses',
          label: 'basedbid Addresses',
          status: 'fail',
          detail: addressError,
        })
      }
      return checks
    },
    async createLaunch(input: TokenLaunchInput): Promise<AdapterLaunchResult> {
      if (!definition.enabled) {
        throw new Error(definition.reason ?? 'basedbid launch support is not available')
      }
      if (!input.imagePath || !fs.existsSync(input.imagePath)) {
        throw new Error('basedbid requires a token image file')
      }
      assertSafeImagePath(input.imagePath)
      const launchConfig = resolveLaunchConfig(config, input.openbid)
      assertSafeApiBaseUrl(launchConfig.apiBaseUrl)
      const dexFeeError = validateDexFeeTier(launchConfig)
      if (dexFeeError) throw new Error(dexFeeError)
      const marketCapError = validateMarketCap(launchConfig.marketCap)
      if (marketCapError) throw new Error(marketCapError)
      if (!isPositiveNumberString(launchConfig.totalSupply)) {
        throw new Error('basedbid total supply must be a valid number')
      }
      const initialBuyError = validateInitialBuyPercent(launchConfig.initialBuyPercent)
      if (initialBuyError) throw new Error(initialBuyError)
      const feeError = validateFeeConfig(launchConfig)
      if (feeError) throw new Error(feeError)
      const addressError = validateAddressConfig(launchConfig)
      if (addressError) throw new Error(addressError)
      if ((launchConfig.softCap && !launchConfig.endTime) || (!launchConfig.softCap && launchConfig.endTime)) {
        throw new Error('basedbid soft cap protection requires both a soft cap and an end time')
      }

      return withKeypairImpl(input.walletId, async (keypair) => {
        const logoUrl = await uploadImage(fetchImpl, launchConfig.apiBaseUrl, input.imagePath as string)
        const seed = generateNumericSeed()
        const metadataUrl = await uploadMetadata(fetchImpl, launchConfig.apiBaseUrl, buildMetadata(input, logoUrl, launchConfig, seed))
        const payload = buildCreateLbpPayload(input, launchConfig, keypair.publicKey.toBase58(), metadataUrl, seed)
        const response = await postJson<CreateLbpSolanaApiResponse>(fetchImpl, `${launchConfig.apiBaseUrl}/sol/create-lbp`, payload)
        assertCreateLbpResponse(response)

        const mintSecret = Buffer.from(response.mintSignerSecretHex!, 'hex')
        const mintKeypair = Keypair.fromSeed(mintSecret.subarray(0, 32))
        try {
          const transaction = VersionedTransaction.deserialize(Buffer.from(response.transaction!, 'base64'))
          const connection = getConnectionImpl()
          await validateOpenBidTransaction(connection, transaction, response, launchConfig, keypair, mintKeypair, env)
          const result = await executeTransactionImpl(connection, transaction, [keypair, mintKeypair], {
            addComputeBudget: false,
            confirmationStrategy: {
              blockhash: response.blockhash!,
              lastValidBlockHeight: response.lastValidBlockHeight!,
            },
          })

          return {
            signature: result.signature,
            mint: response.mintAddress!,
            metadataUri: response.metadataUrl ?? metadataUrl,
            poolAddress: null,
            bondingCurveAddress: null,
            protocolReceipts: {
              provider: 'openbid',
              apiBaseUrl: launchConfig.apiBaseUrl,
              chainId: Number(launchConfig.chainId),
              dex: launchConfig.dex,
              feeTier: launchConfig.feeTier,
              packageType: launchConfig.packageType,
              marketCap: launchConfig.marketCap,
              totalSupply: launchConfig.totalSupply,
              maxAllocationPerUser: launchConfig.maxAllocationPerUser,
              initialBuyPercent: launchConfig.initialBuyPercent,
              softCap: launchConfig.softCap || null,
              endTime: launchConfig.endTime,
              whitelistedAddressCount: launchConfig.whitelistedAddresses.length,
              creatorFees: {
                buyFeePercent: launchConfig.buyFeePercent,
                sellFeePercent: launchConfig.sellFeePercent,
                referralFeePercent: launchConfig.referralFeePercent,
                graduationFeePercent: launchConfig.graduationFeePercent,
              },
              seed,
              metadataUrl: response.metadataUrl ?? metadataUrl,
              walletAddress: keypair.publicKey.toBase58(),
              response: {
                ok: response.ok ?? null,
                chainId: response.chainId ?? null,
                chainSymbol: response.chainSymbol ?? null,
                mintAddress: response.mintAddress,
                lookupTableAddresses: response.lookupTableAddresses ?? [],
                blockhash: response.blockhash,
                lastValidBlockHeight: response.lastValidBlockHeight,
                signingNote: response.signingNote ?? null,
                value: response.value ?? null,
              },
            },
          }
        } finally {
          mintSecret.fill(0)
          mintKeypair.secretKey.fill(0)
        }
      })
    },
  }
}

function buildMetadata(input: TokenLaunchInput, logoUrl: string, config: ResolvedOpenBidConfig, seed: string) {
  return {
    name: input.name,
    symbol: input.symbol,
    decimals: SOLANA_DECIMALS,
    totalSupply: config.totalSupply,
    logo: logoUrl,
    twitter: input.twitter ?? '',
    telegram: input.telegram ?? '',
    website: input.website ?? '',
    discord: '',
    description: input.description,
    whitelist: config.whitelistedAddresses,
    ...(config.board && config.boardOwner ? { board: config.board, boardOwner: config.boardOwner } : {}),
    seed,
  }
}

function buildCreateLbpPayload(
  input: TokenLaunchInput,
  config: ResolvedOpenBidConfig,
  signer: string,
  metadataUrl: string,
  seed: string,
) {
  const initialBuyAmount = formatNumberString(config.initialBuyPercent)
  const sale: Record<string, unknown> = {
    marketCap: config.marketCap,
    initialBuyAmount,
    startTime: config.saleStartTime ?? Math.floor(Date.now() / 1000),
    maxAllocationPerUser: config.maxAllocationPerUser,
    baseTokenForPair: SOLANA_BASE_TOKEN_PAIR,
    baseTokenDecimals: SOLANA_DECIMALS,
    buyReferralFeePer: formatNumberString(config.referralFeePercent),
    sellMemeTokenOwnerFeePer: formatNumberString(config.sellFeePercent),
    buyMemeTokenOwnerFeePer: formatNumberString(config.buyFeePercent),
    finalizeFeePer: formatNumberString(config.graduationFeePercent),
    referrer: config.referrer,
  }
  if (config.softCap && config.endTime) {
    sale.softCap = config.softCap
    sale.endTime = config.endTime
  }
  const dex = {
    routerId: config.dex,
    ...(config.dex === 'meteora'
      ? { meteoraFeeTierIndex: config.feeTier }
      : { raydiumFeeTierIndex: config.feeTier }),
  }
  return {
    chainId: Number(config.chainId),
    signer,
    data: {
      seed,
      advanced: true,
      package: getLaunchPackageIndex(config.packageType),
      token: {
        name: input.name,
        symbol: input.symbol,
        totalSupply: config.totalSupply,
        decimals: SOLANA_DECIMALS,
        initialBuyAmount,
        metadataUrl,
        raiseTokenDecimals: SOLANA_DECIMALS,
      },
      dex,
      sale,
      baseTokenAddress: SOLANA_BASE_TOKEN_PAIR,
      baseTokenDecimals: SOLANA_DECIMALS,
    },
    fees: {
      buyPoolCreator: percentToRate(config.buyFeePercent),
      sellPoolCreator: percentToRate(config.sellFeePercent),
      buyReferral: percentToRate(config.referralFeePercent),
      graduation: percentToRate(config.graduationFeePercent),
      feeDistribution: false,
      dynamicFee: config.dynamicFee,
    },
  }
}

function resolveLaunchConfig(base: ResolvedOpenBidConfig, override?: OpenBidLaunchInputConfig): ResolvedOpenBidConfig {
  return {
    ...base,
    chainId: normalizeText(override?.chainId) || base.chainId,
    dex: normalizeDex(override?.dex) || base.dex,
    feeTier: normalizeText(override?.feeTier) || base.feeTier,
    packageType: normalizePackageType(override?.packageType) || base.packageType,
    marketCap: normalizeText(override?.marketCap) || base.marketCap,
    totalSupply: normalizeText(override?.totalSupply) || base.totalSupply,
    maxAllocationPerUser: normalizeText(override?.maxAllocationPerUser) || base.maxAllocationPerUser,
    initialBuyPercent: normalizeNumber(override?.initialBuyPercent, base.initialBuyPercent),
    referrer: normalizeText(override?.referrer) || base.referrer,
    board: normalizeText(override?.board) || base.board,
    boardOwner: normalizeText(override?.boardOwner) || base.boardOwner,
    saleStartTime: normalizeTimestamp(override?.saleStartTime) ?? base.saleStartTime,
    softCap: normalizeText(override?.softCap) || base.softCap,
    endTime: normalizeTimestamp(override?.endTime) ?? base.endTime,
    whitelistedAddresses: normalizeWhitelist(override?.whitelistedAddresses) || base.whitelistedAddresses,
    buyFeePercent: normalizeNumber(override?.buyFeePercent, base.buyFeePercent),
    sellFeePercent: normalizeNumber(override?.sellFeePercent, base.sellFeePercent),
    referralFeePercent: normalizeNumber(override?.referralFeePercent, base.referralFeePercent),
    graduationFeePercent: normalizeNumber(override?.graduationFeePercent, base.graduationFeePercent),
    dynamicFee: Boolean(override?.dynamicFee ?? base.dynamicFee),
  }
}

async function uploadImage(fetchImpl: typeof fetch, apiBaseUrl: string, imagePath: string): Promise<string> {
  const image = assertSafeImagePath(imagePath)
  const imageBuffer = fs.readFileSync(image.path)
  const formData = new FormData()
  formData.append('file', new Blob([imageBuffer], { type: image.mimeType }), path.basename(image.path))
  const json = await request(fetchImpl, `${apiBaseUrl}/upload`, {
    method: 'POST',
    body: formData,
  }) as BasedBidUploadResponse
  const url = json.response?.url ?? json.url
  if (!url) throw new Error('basedbid image upload did not return a URL')
  return url
}

function assertSafeImagePath(imagePath: string): { path: string; mimeType: string } {
  const resolved = fs.realpathSync(imagePath)
  const stats = fs.statSync(resolved)
  if (!stats.isFile()) throw new Error('basedbid token image must be a file')
  if (stats.size <= 0 || stats.size > MAX_TOKEN_IMAGE_BYTES) throw new Error('basedbid token image must be between 1 byte and 5 MB')
  const header = Buffer.alloc(Math.min(16, stats.size))
  const fd = fs.openSync(resolved, 'r')
  try {
    fs.readSync(fd, header, 0, header.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  const mimeType = getImageMime(header)
  if (!mimeType) throw new Error('basedbid token image must be a PNG, JPG, GIF, or WEBP file')
  return { path: resolved, mimeType }
}

function getImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

async function uploadMetadata(fetchImpl: typeof fetch, apiBaseUrl: string, metadata: Record<string, unknown>): Promise<string> {
  const json = await postJson<BasedBidUploadResponse>(fetchImpl, `${apiBaseUrl}/upload/json`, metadata)
  const url = json.response?.url ?? json.url
  if (!url) throw new Error('basedbid metadata upload did not return a URL')
  return url
}

async function postJson<T>(fetchImpl: typeof fetch, url: string, body: Record<string, unknown>): Promise<T> {
  return request(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as Promise<T>
}

async function request(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const text = await response.text()
    const payload = tryParseJson(text)
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload) || text || `basedbid API request failed with HTTP ${response.status}`)
    }
    return payload
  } finally {
    clearTimeout(timeout)
  }
}

function assertCreateLbpResponse(response: CreateLbpSolanaApiResponse): void {
  const missing = [
    response.transaction ? null : 'transaction',
    response.mintAddress ? null : 'mintAddress',
    response.mintSignerSecretHex ? null : 'mintSignerSecretHex',
    response.blockhash ? null : 'blockhash',
    response.lastValidBlockHeight ? null : 'lastValidBlockHeight',
  ].filter((value): value is string => Boolean(value))
  if (missing.length > 0) {
    throw new Error(`basedbid create-lbp response is missing: ${missing.join(', ')}`)
  }
}

function assertSafeApiBaseUrl(apiBaseUrl: string): void {
  let url: URL
  try {
    url = new URL(apiBaseUrl)
  } catch {
    throw new Error('basedbid API base URL must be a valid URL')
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('basedbid API base URL must use HTTPS unless it is localhost')
  }
}

function getAllowedProgramIds(env: NodeJS.ProcessEnv): Set<string> {
  const configured = normalizeText(env.OPENBID_ALLOWED_PROGRAM_IDS)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set([...DEFAULT_ALLOWED_PROGRAM_IDS, ...configured])
}

async function validateOpenBidTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
  response: CreateLbpSolanaApiResponse,
  config: ResolvedOpenBidConfig,
  payerKeypair: Keypair,
  mintKeypair: Keypair,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const payer = payerKeypair.publicKey
  const mint = mintKeypair.publicKey
  if (response.chainId !== undefined && String(response.chainId) !== config.chainId) {
    throw new Error(`basedbid response chainId ${response.chainId} does not match configured chain ${config.chainId}`)
  }
  if (response.mintAddress !== mint.toBase58()) {
    throw new Error('basedbid mint signer does not match response mintAddress')
  }
  if (transaction.message.recentBlockhash !== response.blockhash) {
    throw new Error('basedbid transaction blockhash does not match response blockhash')
  }
  if (transaction.serialize().length > MAX_TRANSACTION_BYTES) {
    throw new Error('basedbid transaction exceeds the Solana transaction size limit')
  }
  if (transaction.message.addressTableLookups.length > 0 || (response.lookupTableAddresses?.length ?? 0) > 0) {
    throw new Error('basedbid transaction uses address lookup tables; enable resolved LUT validation before signing')
  }

  const staticKeys = transaction.message.staticAccountKeys
  const feePayer = staticKeys[0]?.toBase58()
  if (feePayer !== payer.toBase58()) {
    throw new Error('basedbid transaction fee payer does not match selected wallet')
  }

  const requiredSigners = staticKeys
    .slice(0, transaction.message.header.numRequiredSignatures)
    .map((key) => key.toBase58())
    .sort()
  const expectedSigners = [payer.toBase58(), mint.toBase58()].sort()
  if (JSON.stringify(requiredSigners) !== JSON.stringify(expectedSigners)) {
    throw new Error('basedbid transaction signer set must be exactly the selected wallet and mint signer')
  }

  const allowedPrograms = getAllowedProgramIds(env)
  for (const ix of transaction.message.compiledInstructions) {
    const programId = staticKeys[ix.programIdIndex]?.toBase58()
    if (!programId || !allowedPrograms.has(programId)) {
      throw new Error(`basedbid transaction contains an unallowlisted program: ${programId ?? 'unknown'}`)
    }
  }

  if (typeof connection.simulateTransaction === 'function') {
    const probe = VersionedTransaction.deserialize(transaction.serialize())
    probe.sign([payerKeypair, mintKeypair])
    const simulation = await connection.simulateTransaction(probe, { sigVerify: false, replaceRecentBlockhash: false })
    if (simulation.value.err) {
      throw new Error(`basedbid transaction simulation failed: ${JSON.stringify(simulation.value.err)}`)
    }
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeUrl(value: unknown): string {
  const trimmed = normalizeText(value).replace(/\/+$/, '')
  if (!trimmed) return ''
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  assertSafeApiBaseUrl(candidate)
  return candidate.replace(/\/+$/, '')
}

function normalizeDex(value: unknown): OpenBidDex | '' {
  return value === 'raydium' || value === 'meteora' ? value : ''
}

function normalizePackageType(value: unknown): OpenBidPackageType | '' {
  return value === 'based' || value === 'super_based' || value === 'ultra_based' ? value : ''
}

function getLaunchPackageIndex(packageType: OpenBidPackageType): number {
  if (packageType === 'super_based') return 1
  if (packageType === 'ultra_based') return 2
  return 0
}

function isValidFeeTier(value: string): boolean {
  return value === '0' || value === '1' || value === '2' || value === '3'
}

function validateDexFeeTier(config: ResolvedOpenBidConfig): string | null {
  if (!isValidFeeTier(config.feeTier)) return 'basedbid fee tier must be 0, 1, 2, or 3'
  if (config.dex === 'raydium' && config.feeTier === '3') {
    return 'basedbid Raydium fee tier must be 0, 1, or 2'
  }
  return null
}

function validateMarketCap(value: string): string | null {
  if (!isPositiveNumberString(value)) return 'basedbid market cap must be a valid number'
  const marketCap = Number(value)
  if (marketCap < MIN_MARKET_CAP || marketCap > MAX_MARKET_CAP) {
    return `basedbid market cap must be between ${MIN_MARKET_CAP} and ${MAX_MARKET_CAP}`
  }
  return null
}

function validateInitialBuyPercent(value: number): string | null {
  if (!Number.isFinite(value) || value < 0 || value > MAX_INITIAL_BUY_PERCENT) {
    return `basedbid initial buy must be between 0% and ${MAX_INITIAL_BUY_PERCENT}% of supply`
  }
  return null
}

function isPositiveNumberString(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value) && Number(value) > 0
}

function formatNumberString(value: number): string {
  return Number.isFinite(value) ? value.toString() : '0'
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

function normalizeWhitelist(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const list = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return [...new Set(list)]
}

function percentToRate(value: number): number {
  return Number((value / 100).toFixed(6))
}

function validateFeeConfig(config: ResolvedOpenBidConfig): string | null {
  const checks = [
    ['basedbid buy creator fee', config.buyFeePercent, 1],
    ['basedbid sell creator fee', config.sellFeePercent, 1],
    ['basedbid referral fee', config.referralFeePercent, 1],
    ['basedbid graduation fee', config.graduationFeePercent, 2.5],
  ] as const
  for (const [label, value, max] of checks) {
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return `${label} must be between 0% and ${max}%`
    }
  }
  return null
}

function validateAddressConfig(config: ResolvedOpenBidConfig): string | null {
  for (const [label, value] of [
    ['basedbid referrer', config.referrer],
    ['basedbid board owner', config.boardOwner],
  ] as const) {
    if (!value) continue
    try {
      new PublicKey(value)
    } catch {
      return `${label} must be a valid Solana public key`
    }
  }

  for (const address of config.whitelistedAddresses) {
    try {
      new PublicKey(address)
    } catch {
      return `Whitelist address is invalid: ${address}`
    }
  }
  return null
}

function generateNumericSeed(): string {
  return Math.floor(10_000 + Math.random() * 90_000).toString()
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
  if (typeof record.message === 'string') return record.message
  if (typeof record.error === 'string') return record.error
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>
    if (typeof nested.message === 'string') return nested.message
  }
  return null
}
