import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'

export type AgentTemplate = 'basic' | 'defi-trader' | 'portfolio-monitor' | 'nft-minter'
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
  const pluginDeps = plugins.reduce<Record<string, string>>((acc, p) => {
    acc[`@solana-agent-kit/plugin-${p}`] = '^1.0.0'
    return acc
  }, {})

  const packageJson = {
    name: safeName,
    version: '1.0.0',
    description: config.description ?? TEMPLATE_DESCRIPTIONS[config.template],
    scripts: {
      start: 'ts-node src/index.ts',
      dev: 'ts-node --watch src/index.ts',
    },
    dependencies: {
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
      module: 'commonjs',
      moduleResolution: 'node',
      outDir: 'dist',
      rootDir: 'src',
      strict: false,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
    include: ['src/**/*'],
  }
  fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

  // .env.example
  const envExample = [
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

  // src/index.ts — generated from template
  const indexContent = renderTemplate(config.template, config, 'SOLANA_PRIVATE_KEY')
  fs.writeFileSync(path.join(projectDir, 'src', 'index.ts'), indexContent)

  // Update DB with project path
  updateProjectPath(configId, projectDir)

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
