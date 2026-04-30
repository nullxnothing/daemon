import { daemon } from '../../lib/daemonBridge'
import type { IntegrationContext } from './status'

export interface IntegrationActionResult {
  title: string
  status: 'success' | 'warning' | 'info' | 'error'
  detail: string
  items?: string[]
}

export async function runIntegrationAction(actionId: string, context: IntegrationContext): Promise<IntegrationActionResult> {
  if (actionId === 'check-wallet-balance') {
    const wallet = context.defaultWallet
    if (!wallet) {
      return {
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Create or set a default wallet before running wallet-backed actions.',
      }
    }

    const balance = await daemon.wallet.balance(wallet.id)
    if (!balance.ok || !balance.data) {
      return {
        title: 'Balance check failed',
        status: 'error',
        detail: balance.error ?? 'DAEMON could not read the selected wallet balance.',
      }
    }

    return {
      title: 'Wallet balance',
      status: 'success',
      detail: `${wallet.name} has ${balance.data.sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL.`,
      items: [wallet.address],
    }
  }

  if (actionId === 'check-helius-key') {
    const ready = Boolean(context.secureKeys.HELIUS_API_KEY)
    return {
      title: 'Helius key',
      status: ready ? 'success' : 'warning',
      detail: ready ? 'DAEMON has a Helius key stored.' : 'No Helius key is stored yet. Add one before production RPC/DAS workflows.',
    }
  }

  if (actionId === 'check-jupiter-key') {
    const ready = Boolean(context.secureKeys.JUPITER_API_KEY)
    return {
      title: 'Jupiter key',
      status: ready ? 'success' : 'info',
      detail: ready ? 'DAEMON has a Jupiter key stored.' : 'No Jupiter key is stored. Basic public endpoints can still work, but limits may be lower.',
    }
  }

  if (actionId === 'check-solana-mcp') {
    const mcp = context.mcps.find((entry) => entry.name === 'solana-mcp-server')
    return {
      title: 'Solana MCP',
      status: mcp?.enabled ? 'success' : mcp ? 'warning' : 'error',
      detail: mcp?.enabled ? 'Solana MCP is enabled for this project.' : mcp ? 'Solana MCP is available but disabled.' : 'Solana MCP was not detected in this project.',
    }
  }

  if (actionId === 'check-agent-kit-package') {
    const ready = context.packages.has('solana-agent-kit')
    return {
      title: 'SendAI Agent Kit package',
      status: ready ? 'success' : 'warning',
      detail: ready ? 'solana-agent-kit is listed in package.json.' : 'solana-agent-kit is not installed in this project yet.',
    }
  }

  if (actionId === 'check-nft-packages') {
    const packages = ['@metaplex-foundation/umi', '@metaplex-foundation/mpl-token-metadata']
    const installed = packages.filter((name) => context.packages.has(name))
    return {
      title: 'Metaplex packages',
      status: installed.length > 0 ? 'success' : 'info',
      detail: installed.length > 0 ? 'Metaplex dependencies are present.' : 'No common Metaplex packages were found in package.json.',
      items: installed.length > 0 ? installed : packages,
    }
  }

  if (actionId === 'check-light-package') {
    const packages = ['@lightprotocol/stateless.js', '@lightprotocol/compressed-token']
    const installed = packages.filter((name) => context.packages.has(name))
    const missing = packages.filter((name) => !context.packages.has(name))
    return {
      title: 'Light Protocol packages',
      status: missing.length === 0 ? 'success' : installed.length > 0 ? 'info' : 'warning',
      detail: missing.length === 0
        ? 'Light Protocol SDK packages are listed in package.json.'
        : `Missing ${missing.join(', ')}. Install both packages before compressed-token flows.`,
      items: missing.length === 0 ? installed : missing,
    }
  }

  if (actionId === 'check-magicblock-package') {
    const packages = ['@magicblock-labs/ephemeral-rollups-sdk']
    const installed = packages.filter((name) => context.packages.has(name))
    const missing = packages.filter((name) => !context.packages.has(name))
    return {
      title: 'MagicBlock packages',
      status: missing.length === 0 ? 'success' : 'warning',
      detail: missing.length === 0
        ? 'MagicBlock Ephemeral Rollups SDK is listed in package.json.'
        : `Missing ${missing.join(', ')}. Install the SDK before Magic Router or ER delegation flows.`,
      items: missing.length === 0 ? installed : missing,
    }
  }

  if (actionId === 'check-debridge-package') {
    const packages = ['@debridge-finance/dln-client']
    const installed = packages.filter((name) => context.packages.has(name))
    const missing = packages.filter((name) => !context.packages.has(name))
    return {
      title: 'deBridge packages',
      status: missing.length === 0 ? 'success' : 'warning',
      detail: missing.length === 0
        ? 'deBridge DLN client is listed in package.json.'
        : `Missing ${missing.join(', ')}. Install the client before DLN route-preview flows.`,
      items: missing.length === 0 ? installed : missing,
    }
  }

  if (actionId === 'check-skills-source') {
    const hasProject = context.packages.size > 0 || context.envFiles.length > 0
    return {
      title: 'Skills readiness',
      status: hasProject ? 'success' : 'info',
      detail: hasProject
        ? 'DAEMON has enough project context to recommend protocol skills.'
        : 'Open a project with package.json or env files so DAEMON can recommend skills more accurately.',
    }
  }

  return {
    title: 'Preview only',
    status: 'info',
    detail: 'This action is intentionally not executable yet. DAEMON will add transaction previews and confirmations before enabling it.',
  }
}
