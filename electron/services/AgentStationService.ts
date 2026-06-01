import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/db'
import { invalidatePathCache } from '../shared/pathValidation'
import * as SecureKey from './SecureKeyService'

export type AgentTemplate = 'basic' | 'defi-trader' | 'portfolio-monitor' | 'nft-minter' | 'metaplex-meterflow-operator'
export type AgentStatus = 'idle' | 'running' | 'stopped'

export interface AgentStationConfig {
  id: string
  name: string
  description: string | null
  template: AgentTemplate
  wallet_id: string | null
  plugins: string
  rpc_url: string | null
  model: string
  project_path: string | null
  status: AgentStatus
  created_at: number
  updated_at: number
}

export interface CreateAgentInput {
  name: string
  description?: string
  template: AgentTemplate
  wallet_id?: string | null
  plugins?: string[]
  rpc_url?: string | null
  model?: string
}

const TEMPLATE_DESCRIPTIONS: Record<AgentTemplate, string> = {
  'basic': 'Minimal agent ready for custom logic with all plugins available.',
  'defi-trader': 'Autonomous DeFi trader using Jupiter swaps + Pyth price feeds.',
  'portfolio-monitor': 'Monitors wallet balances and alerts on significant changes.',
  'nft-minter': 'Mints NFTs via Metaplex Core on triggers or schedules.',
  'metaplex-meterflow-operator': 'Onchain identity + paid x402 tool call + DAEMON receipt.',
}

function renderTemplate(template: AgentTemplate, config: AgentStationConfig, privateKeyRef: string): string {
  const plugins = JSON.parse(config.plugins) as string[]
  const pluginImports = plugins.map((p) => `import { ${pluginImportName(p)} } from '@solana-agent-kit/plugin-${p}'`).join('\n')
  const pluginUse = plugins.map((p) => `.use(${pluginImportName(p)})`).join('\n  ')
  const rpcUrl = config.rpc_url || 'https://api.mainnet-beta.solana.com'

  const templateBodies: Record<AgentTemplate, string> = {
    'basic': `
async function run() {
  console.log('[Agent] Basic agent started')
  const balance = await agent.getBalance()
  console.log('[Agent] Wallet balance:', balance, 'SOL')
  // Add your custom logic here
}

run().catch(console.error)
`,
    'defi-trader': `
import { Decimal } from 'decimal.js'

const TRADE_AMOUNT_SOL = parseFloat(process.env.TRADE_AMOUNT_SOL ?? '0.01')
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

async function run() {
  console.log('[Trader] Starting DeFi trader...')
  const balance = await agent.getBalance()
  console.log('[Trader] Balance:', balance, 'SOL')

  // Get price from Pyth
  const solPrice = await agent.getPrice(SOL_MINT)
  console.log('[Trader] SOL price: $' + solPrice)

  // Example: swap SOL -> USDC when price is above threshold
  if (parseFloat(solPrice) > 100) {
    console.log('[Trader] Price trigger hit, swapping', TRADE_AMOUNT_SOL, 'SOL -> USDC')
    const result = await agent.trade(
      USDC_MINT,
      TRADE_AMOUNT_SOL,
      SOL_MINT,
      300, // 3% slippage in bps
    )
    console.log('[Trader] Swap tx:', result)
  }
}

// Poll every 60 seconds
run().catch(console.error)
setInterval(() => run().catch(console.error), 60_000)
`,
    'portfolio-monitor': `
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS ?? '30000')
let lastBalance: number | null = null

async function checkPortfolio() {
  const balance = await agent.getBalance()
  console.log('[Monitor] Balance:', balance, 'SOL')

  if (lastBalance !== null) {
    const delta = balance - lastBalance
    if (Math.abs(delta) > 0.01) {
      console.log('[Monitor] ALERT: Balance changed by', delta.toFixed(4), 'SOL')
    }
  }
  lastBalance = balance
}

console.log('[Monitor] Portfolio monitor started, checking every', CHECK_INTERVAL_MS / 1000, 'seconds')
checkPortfolio().catch(console.error)
setInterval(() => checkPortfolio().catch(console.error), CHECK_INTERVAL_MS)
`,
    'nft-minter': `
const COLLECTION_MINT = process.env.COLLECTION_MINT ?? ''

async function mint() {
  if (!COLLECTION_MINT) {
    console.log('[Minter] Creating new collection...')
    const collection = await agent.deployCollection({
      name: process.env.COLLECTION_NAME ?? 'My Collection',
      uri: process.env.COLLECTION_URI ?? 'https://example.com/collection.json',
      royaltyBasisPoints: 500,
      creators: [],
    })
    console.log('[Minter] Collection created:', collection.collectionMint)
    process.env.COLLECTION_MINT = collection.collectionMint
  }

  console.log('[Minter] Minting NFT to collection:', process.env.COLLECTION_MINT)
  const result = await agent.mintNFT(
    process.env.COLLECTION_MINT!,
    {
      name: process.env.NFT_NAME ?? 'My NFT',
      uri: process.env.NFT_URI ?? 'https://example.com/nft.json',
    },
  )
  console.log('[Minter] NFT minted:', result.mint)
}

mint().catch(console.error)
`,
    'metaplex-meterflow-operator': `
async function run() {
  console.log('[Meterflow] Use src/metaplexAgent.ts and src/meterflowPayment.ts in this template.')
}

run().catch(console.error)
`,
  }

  return `import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit'
${pluginImports}
import bs58 from 'bs58'
import 'dotenv/config'

const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY
if (!PRIVATE_KEY) throw new Error('SOLANA_PRIVATE_KEY not set in .env')

const wallet = new KeypairWallet(bs58.decode(PRIVATE_KEY))
const agent = new SolanaAgentKit(wallet, process.env.RPC_URL ?? '${rpcUrl}', {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
})
  ${pluginUse}
${templateBodies[template]}`
}

function pluginImportName(plugin: string): string {
  const map: Record<string, string> = {
    token: 'TokenPlugin',
    defi: 'DefiPlugin',
    nft: 'NftPlugin',
    misc: 'MiscPlugin',
    blinks: 'BlinksPlugin',
  }
  return map[plugin] ?? `${plugin.charAt(0).toUpperCase()}${plugin.slice(1)}Plugin`
}

function renderMetaplexMeterflowEnv(config: AgentStationConfig): string {
  return [
    'SOLANA_PRIVATE_KEY=',
    'OPENAI_API_KEY=',
    `RPC_URL=${config.rpc_url ?? 'https://api.devnet.solana.com'}`,
    'METAPLEX_NETWORK=solana-devnet',
    `METAPLEX_AGENT_NAME=${config.name || 'Drop Operator'}`,
    'METAPLEX_AGENT_DESCRIPTION=DAEMON-created agent with Metaplex identity and Meterflow x402 receipt trail.',
    'METAPLEX_AGENT_URI=',
    'DAEMON_AGENT_SERVICE_ENDPOINT=https://daemonide.tech',
    'METERFLOW_AGENT_READINESS_URL=https://www.meterflow.fun/proxy/mcp/agent-readiness',
    'DAEMON_AGENT_SESSION_ID=daemon-demo',
    'METERFLOW_DEMO_MODE=false',
  ].join('\n')
}

function renderMetaplexMeterflowIndex(): string {
  return `import 'dotenv/config'
import { registerOrReuseMetaplexAgent } from './metaplexAgent.js'
import { callMeterflowAgentReadiness } from './meterflowPayment.js'
import { saveReceipt } from './saveReceipt.js'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function step(label: string): Promise<void> {
  console.log(\`\\n[DAEMON] \${label}\`)
  await sleep(650)
}

function short(value: string | null | undefined): string {
  if (!value) return 'unknown'
  return value.length > 18 ? \`\${value.slice(0, 8)}...\${value.slice(-8)}\` : value
}

async function main() {
  const agentName = process.env.METAPLEX_AGENT_NAME ?? 'Drop Operator'
  console.log('\\n================ DAEMON AGENT RUN ================')
  console.log(\`[\${agentName}] Session: \${process.env.DAEMON_AGENT_SESSION_ID ?? 'daemon-demo'}\`)
  await step('1/5 Preparing Metaplex Agent Registry identity')
  const identity = await registerOrReuseMetaplexAgent()
  console.log(\`[\${agentName}] Identity wallet: \${short(identity.wallet)}\`)
  console.log(\`[\${agentName}] Agent asset: \${identity.assetAddress}\`)

  await step('2/5 Opening paid Meterflow MCP route')
  const paid = await callMeterflowAgentReadiness({
    agentName,
    wallet: identity.wallet,
    metaplexAssetAddress: identity.assetAddress,
  })

  await step('3/5 Capturing x402 settlement receipt')
  console.log(\`[Meterflow] Verify URL: \${paid.receiptUrl ?? 'unknown'}\`)

  await step('4/5 Saving receipt for DAEMON side panel import')
  const receiptPath = await saveReceipt({
    agent: {
      name: agentName,
      wallet: identity.wallet,
      metaplexAssetAddress: identity.assetAddress,
    },
    meterflow: {
      route: '/mcp/agent-readiness',
      receiptId: paid.receiptId,
      receiptUrl: paid.receiptUrl,
      txSignature: paid.txSignature,
      idempotencyKey: paid.idempotencyKey,
    },
    receipt: paid.receipt,
    result: paid.result,
    createdAt: new Date().toISOString(),
  })

  console.log(\`[DAEMON] Receipt file: \${receiptPath}\`)
  await step('5/5 Meterflow Ops Ledger ready')
  console.log(\`[DAEMON] Receipt \${paid.receiptId ?? 'unknown'} is ready in the Meterflow panel\`)
  console.log('================ RUN COMPLETE =====================\\n')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
`
}

function renderMetaplexAgentFile(): string {
  return `import fs from 'node:fs/promises'
import path from 'node:path'
import bs58 from 'bs58'
import { mplCore } from '@metaplex-foundation/mpl-core'
import { mintAndSubmitAgent, mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { keypairIdentity } from '@metaplex-foundation/umi'

export interface MetaplexAgentIdentity {
  wallet: string
  assetAddress: string
  network: string
}

const CACHE_PATH = path.join(process.cwd(), '.daemon', 'metaplex-agent.json')

function parsePrivateKey(): Uint8Array {
  const raw = process.env.SOLANA_PRIVATE_KEY?.trim()
  if (!raw) throw new Error('SOLANA_PRIVATE_KEY is required.')
  if (raw.startsWith('[')) return Uint8Array.from(JSON.parse(raw) as number[])
  return bs58.decode(raw)
}

async function readCachedIdentity(): Promise<MetaplexAgentIdentity | null> {
  try {
    const cached = JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) as Partial<MetaplexAgentIdentity>
    if (cached.wallet && cached.assetAddress && cached.network) return cached as MetaplexAgentIdentity
  } catch {
    return null
  }
  return null
}

async function writeCachedIdentity(identity: MetaplexAgentIdentity): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true })
  await fs.writeFile(CACHE_PATH, JSON.stringify(identity, null, 2))
}

export async function registerOrReuseMetaplexAgent(): Promise<MetaplexAgentIdentity> {
  const cached = await readCachedIdentity()
  if (cached) return cached

  const secretKey = parsePrivateKey()
  try {
    const rpcUrl = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
    const network = process.env.METAPLEX_NETWORK ?? 'solana-devnet'
    if (network !== 'solana-devnet') throw new Error('This demo template only writes Metaplex Agent Registry identity on solana-devnet.')

    const umi = createUmi(rpcUrl).use(mplCore()).use(mplAgentIdentity())
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey)
    umi.use(keypairIdentity(keypair))

    if (process.env.METERFLOW_DEMO_MODE === 'true') {
      const identity = {
        wallet: umi.identity.publicKey.toString(),
        assetAddress: \`demo-agent-\${Date.now()}\`,
        network,
      }
      await writeCachedIdentity(identity)
      return identity
    }

    const name = process.env.METAPLEX_AGENT_NAME ?? 'Drop Operator'
    const endpoint = (process.env.DAEMON_AGENT_SERVICE_ENDPOINT ?? 'https://daemonide.tech').replace(/\\/+$/, '')
    const uri = process.env.METAPLEX_AGENT_URI || \`\${endpoint}/agent-card.json\`
    const agentMetadata = {
      type: 'agent',
      name,
      description: process.env.METAPLEX_AGENT_DESCRIPTION ?? 'DAEMON-created agent with Metaplex identity and Meterflow x402 receipt trail.',
      services: [
        { name: 'DAEMON_RUN', endpoint },
        { name: 'MCP', endpoint: \`\${endpoint}/mcp\` },
        { name: 'A2A', endpoint: \`\${endpoint}/a2a/agent-card.json\` },
        { name: 'x402', endpoint: \`\${endpoint}/x402\` },
      ],
      registrations: [],
      supportedTrust: ['reputation', 'wallet-signature', 'work-receipts'],
    }

    const result = await mintAndSubmitAgent(umi, {}, {
      wallet: umi.identity.publicKey,
      network,
      name,
      uri,
      agentMetadata,
    })
    const identity = {
      wallet: umi.identity.publicKey.toString(),
      assetAddress: String(result.assetAddress),
      network,
    }
    await writeCachedIdentity(identity)
    return identity
  } finally {
    secretKey.fill(0)
  }
}
`
}

function renderMeterflowPaymentFile(): string {
  return `import crypto from 'node:crypto'
import bs58 from 'bs58'
import { createKeyPairSignerFromBytes } from '@solana/kit'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { toClientSvmSigner } from '@x402/svm'
import { registerExactSvmScheme } from '@x402/svm/exact/client'
import { appendPaymentIdentifierToExtensions } from '@x402/extensions'

interface PaidCallInput {
  agentName: string
  wallet: string
  metaplexAssetAddress: string
}

interface PaidCallResult {
  receiptId: string | null
  receiptUrl: string | null
  txSignature: string | null
  idempotencyKey: string
  receipt: Record<string, unknown>
  result: Record<string, unknown>
}

const METERFLOW_PAY_TO = '6ybgqYcvbKkhPCfRg76naKY2gjUUgyx4HHR3FqTa2GYR'
const MAINNET_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const MAX_USDC_BASE_UNITS = 100_000n

function parsePrivateKey(): Uint8Array {
  const raw = process.env.SOLANA_PRIVATE_KEY?.trim()
  if (!raw) throw new Error('SOLANA_PRIVATE_KEY is required.')
  if (raw.startsWith('[')) return Uint8Array.from(JSON.parse(raw) as number[])
  return bs58.decode(raw)
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { data: parsed }
  } catch {
    return { text: text.slice(0, 1000) }
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function headerValue(headers: Headers, name: string): string | null {
  return stringValue(headers.get(name))
}

function paymentSettleResponse(httpClient: x402HTTPClient, headers: Headers): Record<string, unknown> {
  try {
    return objectValue(httpClient.getPaymentSettleResponse((name) => headers.get(name)))
  } catch {
    return {}
  }
}

function assertMeterflowChallenge(paymentRequired: Record<string, unknown>): void {
  const accepts = Array.isArray(paymentRequired.accepts) ? paymentRequired.accepts : []
  const requirement = objectValue(accepts[0])
  const amount = BigInt(String(requirement.amount ?? '0'))
  if (requirement.scheme !== 'exact') throw new Error('Unsupported x402 scheme.')
  if (requirement.network !== 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') throw new Error('Unsupported x402 network.')
  if (requirement.asset !== MAINNET_USDC) throw new Error('Unsupported x402 asset.')
  if (requirement.payTo !== METERFLOW_PAY_TO) throw new Error('Unexpected x402 payee.')
  if (amount <= 0n || amount > MAX_USDC_BASE_UNITS) throw new Error('x402 amount exceeded policy.')
}

function validateMeterflowResource(paymentRequired: Record<string, unknown>): void {
  const resource = objectValue(paymentRequired.resource)
  const resourceUrl = stringValue(resource.url)
  if (!resourceUrl) throw new Error('Meterflow x402 challenge did not include a resource URL.')

  const parsed = new URL(resourceUrl)
  const isMeterflowHost = parsed.hostname === 'meterflow.fun' || parsed.hostname === 'www.meterflow.fun'
  if (parsed.protocol !== 'https:' || !isMeterflowHost || parsed.pathname !== '/proxy/mcp/agent-readiness') {
    throw new Error('Meterflow x402 resource did not match policy.')
  }
}

function prepareMeterflowPaymentRequired(paymentRequired: Record<string, unknown>, idempotencyKey: string): void {
  const extensions = { ...objectValue(paymentRequired.extensions) }
  delete extensions.bazaar
  paymentRequired.extensions = appendPaymentIdentifierToExtensions(extensions, idempotencyKey)
}

export async function callMeterflowAgentReadiness(input: PaidCallInput): Promise<PaidCallResult> {
  const url = process.env.METERFLOW_AGENT_READINESS_URL ?? 'https://www.meterflow.fun/proxy/mcp/agent-readiness'
  const idempotencyKey = crypto.randomUUID()
  const body = JSON.stringify({
    address: input.wallet,
    action: 'call paid Meterflow MCP tools from DAEMON',
  })
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  }

  console.log('[Meterflow] Calling paid MCP route: POST /proxy/mcp/agent-readiness')
  const unpaid = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' })
  if (unpaid.status >= 300 && unpaid.status < 400) throw new Error('Meterflow redirects are not allowed.')
  const unpaidJson = await readJson(unpaid)
  if (unpaid.status !== 402) {
    throw new Error(stringValue(unpaidJson.error) ?? stringValue(unpaidJson.message) ?? \`Expected x402 402 challenge, got HTTP \${unpaid.status}.\`)
  }

  console.log('[Meterflow] 402 payment required')
  const secretKey = parsePrivateKey()
  try {
    const signer = toClientSvmSigner(await createKeyPairSignerFromBytes(secretKey))
    const httpClient = new x402HTTPClient(registerExactSvmScheme(new x402Client(), { signer }))
    const paymentRequired = httpClient.getPaymentRequiredResponse((name) => unpaid.headers.get(name), unpaidJson)
    assertMeterflowChallenge(paymentRequired as Record<string, unknown>)
    validateMeterflowResource(paymentRequired as Record<string, unknown>)
    prepareMeterflowPaymentRequired(paymentRequired as Record<string, unknown>, idempotencyKey)
    console.log('[Meterflow] Signing x402 payment')
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload)

    const paid = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'X-Payment-Wallet': input.wallet, 'X-Payment-Id': idempotencyKey, ...paymentHeaders },
      body,
      redirect: 'manual',
    })
    if (paid.status >= 300 && paid.status < 400) throw new Error('Meterflow redirects are not allowed.')
    const result = await readJson(paid)
    if (!paid.ok) {
      throw new Error(stringValue(result.error) ?? stringValue(result.message) ?? \`Paid retry failed with HTTP \${paid.status}.\`)
    }

    console.log('[Meterflow] Paid retry accepted')
    const settlement = paymentSettleResponse(httpClient, paid.headers)
    const meterflow = objectValue(result.meterflow)
    const receipt = objectValue(result.receipt)
    const receiptId = headerValue(paid.headers, 'X-Meterflow-Receipt-Id') ?? stringValue(meterflow.receiptId) ?? stringValue(receipt.id)
    const receiptUrl = headerValue(paid.headers, 'X-Meterflow-Receipt-Url') ?? stringValue(meterflow.receiptUrl) ?? stringValue(receipt.publicVerifyUrl)
    const txSignature = stringValue(settlement.transaction) ?? headerValue(paid.headers, 'X-Payment-Transaction') ?? stringValue(meterflow.txSignature) ?? stringValue(receipt.txSignature)
    console.log(\`[Meterflow] Receipt: \${receiptId ?? 'unknown'}\`)
    console.log(\`[Meterflow] x402 tx: \${txSignature ?? 'unknown'}\`)

    return {
      receiptId,
      receiptUrl,
      txSignature,
      idempotencyKey,
      receipt,
      result,
    }
  } finally {
    secretKey.fill(0)
  }
}
`
}

function renderSaveReceiptFile(): string {
  return `import fs from 'node:fs/promises'
import path from 'node:path'

interface ReceiptFile {
  agent: {
    name: string
    wallet: string
    metaplexAssetAddress: string
  }
  meterflow: {
    route: string
    receiptId: string | null
    receiptUrl: string | null
    txSignature: string | null
    idempotencyKey: string
  }
  receipt: Record<string, unknown>
  result: Record<string, unknown>
  createdAt: string
}

export async function saveReceipt(receipt: ReceiptFile): Promise<string> {
  const dir = path.join(process.cwd(), '.daemon', 'meterflow')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, \`receipt-\${Date.now()}.json\`)
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2))
  return filePath
}
`
}

// ---- DB helpers ----

export function listConfigs(): AgentStationConfig[] {
  const db = getDb()
  return db.prepare('SELECT * FROM agent_station_configs ORDER BY created_at DESC').all() as AgentStationConfig[]
}

export function getConfig(id: string): AgentStationConfig | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM agent_station_configs WHERE id = ?').get(id) as AgentStationConfig | undefined
}

export function createConfig(input: CreateAgentInput): AgentStationConfig {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = Date.now()
  const plugins = JSON.stringify(input.plugins ?? ['token', 'defi', 'misc'])

  db.prepare(`
    INSERT INTO agent_station_configs
      (id, name, description, template, wallet_id, plugins, rpc_url, model, project_path, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,NULL,'idle',?,?)
  `).run(
    id,
    input.name.trim().slice(0, 80),
    (input.description ?? '').slice(0, 400) || null,
    input.template,
    input.wallet_id ?? null,
    plugins,
    input.rpc_url?.trim() || null,
    input.model ?? 'gpt-4o',
    now,
    now,
  )

  return getConfig(id)!
}

export function updateStatus(id: string, status: AgentStatus): void {
  const db = getDb()
  db.prepare('UPDATE agent_station_configs SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id)
}

export function updateProjectPath(id: string, projectPath: string): void {
  const db = getDb()
  db.prepare('UPDATE agent_station_configs SET project_path = ?, updated_at = ? WHERE id = ?').run(projectPath, Date.now(), id)
}

function ensureRegisteredProject(name: string, projectPath: string): void {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM projects WHERE path = ?').get(projectPath) as { id: string } | undefined
  if (!existing) {
    db.prepare('INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)')
      .run(crypto.randomUUID(), name, projectPath, Date.now())
  }
  invalidatePathCache()
}

export function deleteConfig(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM agent_station_configs WHERE id = ?').run(id)
}

// ---- Scaffold ----

export interface ScaffoldResult {
  projectPath: string
  envPath: string
}

export async function scaffoldProject(configId: string, outputDir: string): Promise<ScaffoldResult> {
  const config = getConfig(configId)
  if (!config) throw new Error('Agent config not found')

  const safeName = config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'
  const projectDir = path.join(outputDir, safeName)

  if (fs.existsSync(projectDir)) {
    throw new Error(`Directory already exists: ${projectDir}`)
  }

  fs.mkdirSync(projectDir, { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })

  // package.json
  const plugins = JSON.parse(config.plugins) as string[]
  const isMeterflowTemplate = config.template === 'metaplex-meterflow-operator'
  const pluginVersion = isMeterflowTemplate ? '^2.0.6' : '^1.0.0'
  const pluginDeps = plugins.reduce<Record<string, string>>((acc, p) => {
    acc[`@solana-agent-kit/plugin-${p}`] = pluginVersion
    return acc
  }, {})

  const packageJson = {
    name: safeName,
    version: '1.0.0',
    description: config.description ?? TEMPLATE_DESCRIPTIONS[config.template],
    type: isMeterflowTemplate ? 'module' : undefined,
    scripts: {
      start: isMeterflowTemplate ? 'node --loader ts-node/esm src/index.ts' : 'ts-node src/index.ts',
      dev: isMeterflowTemplate ? 'node --loader ts-node/esm --watch src/index.ts' : 'ts-node --watch src/index.ts',
    },
    dependencies: isMeterflowTemplate ? {
      'solana-agent-kit': '^2.0.0',
      ...pluginDeps,
      '@metaplex-foundation/mpl-agent-registry': '^0.2.5',
      '@metaplex-foundation/mpl-core': '^1.10.0',
      '@metaplex-foundation/umi': '^1.2.0',
      '@metaplex-foundation/umi-bundle-defaults': '^1.2.0',
      '@solana/kit': '6.9.0',
      '@solana/web3.js': '^1.95.0',
      '@x402/core': '^2.12.0',
      '@x402/extensions': '^2.12.0',
      '@x402/svm': '^2.12.0',
      'bs58': '^6.0.0',
      'dotenv': '^16.0.0',
    } : {
      'solana-agent-kit': '^2.0.0',
      ...pluginDeps,
      '@solana/web3.js': '^1.95.0',
      'bs58': '^6.0.0',
      'dotenv': '^16.0.0',
      'decimal.js': '^10.4.3',
    },
    devDependencies: {
      'typescript': '^5.0.0',
      'ts-node': '^10.9.0',
      '@types/node': '^22.0.0',
    },
  }

  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2))

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: isMeterflowTemplate ? 'NodeNext' : 'commonjs',
      moduleResolution: isMeterflowTemplate ? 'NodeNext' : 'node',
      outDir: 'dist',
      rootDir: 'src',
      strict: false,
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: isMeterflowTemplate ? true : undefined,
    },
    include: ['src/**/*'],
  }
  fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

  // .env.example
  const envExample = isMeterflowTemplate ? renderMetaplexMeterflowEnv(config) : [
    '# Required: base58-encoded Solana private key',
    'SOLANA_PRIVATE_KEY=',
    '',
    '# Required: OpenAI API key for AI actions',
    'OPENAI_API_KEY=',
    '',
    '# Optional: Solana RPC endpoint (defaults to mainnet-beta)',
    `RPC_URL=${config.rpc_url ?? 'https://api.mainnet-beta.solana.com'}`,
    '',
    '# Template-specific variables',
    '# TRADE_AMOUNT_SOL=0.01',
    '# CHECK_INTERVAL_MS=30000',
  ].join('\n')

  const envPath = path.join(projectDir, '.env')
  fs.writeFileSync(path.join(projectDir, '.env.example'), envExample)
  fs.writeFileSync(envPath, envExample.replace(/=.*/g, '='))

  // .gitignore
  fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules/\ndist/\n.env\n')

  if (isMeterflowTemplate) {
    fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), renderMetaplexMeterflowIndex())
    fs.writeFileSync(path.join(projectDir, 'src', 'metaplexAgent.ts'), renderMetaplexAgentFile())
    fs.writeFileSync(path.join(projectDir, 'src', 'meterflowPayment.ts'), renderMeterflowPaymentFile())
    fs.writeFileSync(path.join(projectDir, 'src', 'saveReceipt.ts'), renderSaveReceiptFile())
  } else {
    const indexContent = renderTemplate(config.template, config, 'SOLANA_PRIVATE_KEY')
    fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), indexContent)
  }

  // Update DB with project path
  updateProjectPath(configId, projectDir)
  ensureRegisteredProject(config.name, projectDir)

  return { projectPath: projectDir, envPath }
}

// ---- Private key helpers ----

export async function storeAgentKey(configId: string, privateKey: string): Promise<void> {
  await SecureKey.storeKey(`AGENT_STATION_KEY_${configId}`, privateKey)
}

export function hasAgentKey(configId: string): boolean {
  return !!SecureKey.getKey(`AGENT_STATION_KEY_${configId}`)
}

export function deleteAgentKey(configId: string): void {
  SecureKey.deleteKey(`AGENT_STATION_KEY_${configId}`)
}

export function getAgentPrivateKey(configId: string): string | null {
  return SecureKey.getKey(`AGENT_STATION_KEY_${configId}`) ?? null
}
