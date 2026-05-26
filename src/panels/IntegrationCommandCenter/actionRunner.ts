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
    const packages = [
      '@metaplex-foundation/umi',
      '@metaplex-foundation/umi-bundle-defaults',
      '@metaplex-foundation/mpl-core',
      '@metaplex-foundation/mpl-token-metadata',
      '@metaplex-foundation/digital-asset-standard-api',
    ]
    const installed = packages.filter((name) => context.packages.has(name))
    const missing = packages.filter((name) => !context.packages.has(name))
    return {
      title: 'Metaplex packages',
      status: missing.length === 0 ? 'success' : installed.length > 0 ? 'info' : 'warning',
      detail: missing.length === 0
        ? 'Metaplex Core, Token Metadata, Umi, and DAS packages are present.'
        : 'Install the current Metaplex Core/DAS starter packages before adding mint or collection transaction paths.',
      items: missing.length === 0 ? installed : missing,
    }
  }

  if (actionId === 'check-streamlock-config') {
    const envKeys = new Set(
      context.envFiles.flatMap((file) => file.vars.filter((envVar) => !envVar.isComment && envVar.value.trim().length > 0).map((envVar) => envVar.key)),
    )
    const required = ['STREAMLOCK_OPERATOR_KEY']
    const missing = required.filter((name) => !envKeys.has(name))
    return {
      title: 'Streamlock config',
      status: missing.length === 0 ? 'success' : 'warning',
      detail: missing.length === 0
        ? 'Streamlock operator API config is present in project env.'
        : `Missing ${missing.join(', ')}. Add the operator API key before calling Streamlock routes.`,
      items: missing.length === 0 ? ['STREAMLOCK_OPERATOR_KEY'] : missing,
    }
  }

  if (actionId === 'check-kausalayer-config') {
    const envKeys = new Set(
      context.envFiles.flatMap((file) => file.vars.filter((envVar) => !envVar.isComment && envVar.value.trim().length > 0).map((envVar) => envVar.key)),
    )
    const hasApiKey = envKeys.has('KAUSALAYER_API_KEY')
    const mcp = context.mcps.find((entry) => entry.name === 'kausalayer')
    const mcpReady = Boolean(mcp?.enabled)
    const missing = [
      hasApiKey ? null : 'KAUSALAYER_API_KEY',
      mcpReady ? null : mcp ? 'Enable kausalayer MCP' : 'Add kausalayer MCP',
    ].filter((item): item is string => Boolean(item))

    return {
      title: 'KausaLayer config',
      status: missing.length === 0 ? 'success' : hasApiKey || mcp ? 'info' : 'warning',
      detail: missing.length === 0
        ? 'KausaLayer API key and MCP route are ready for agent-side privacy tooling.'
        : 'KausaLayer needs an API key and enabled MCP route before DAEMON can expose privacy tooling safely.',
      items: missing.length === 0 ? ['KAUSALAYER_API_KEY', 'kausalayer MCP enabled'] : missing,
    }
  }

  if (actionId === 'preview-idle-router') {
    const paymentMcp = context.mcps.find((entry) => (entry.name === 'payai-mcp-server' || entry.name === 'x402-mcp') && entry.enabled)
    const envKeys = new Set(
      context.envFiles.flatMap((file) => file.vars.filter((envVar) => !envVar.isComment && envVar.value.trim().length > 0).map((envVar) => envVar.key)),
    )
    const registryReady = envKeys.has('IDLE_REGISTRY_URL') || envKeys.has('PAYAI_DISCOVERY_URL')
    return {
      title: registryReady && paymentMcp ? 'IDLE execution prerequisites ready' : 'IDLE route stack gated',
      status: registryReady && paymentMcp ? 'success' : 'info',
      detail: registryReady
        ? paymentMcp
          ? `DAEMON can import the configured IDLE registry and use ${paymentMcp.label ?? paymentMcp.name} for x402 payment policy.`
          : 'DAEMON can import the configured IDLE registry, but paid execution stays gated until PayAI or x402 MCP is enabled.'
        : 'Add IDLE_REGISTRY_URL or PAYAI_DISCOVERY_URL before DAEMON imports live resources or claims paid-call execution.',
      items: [
        registryReady ? 'Registry URL configured' : 'Registry URL required',
        'Score imported resources before execution',
        paymentMcp ? 'x402 payment tooling available' : 'x402 payment tooling required',
        'Apply route allowlists and spend caps',
        'Store redacted receipts for every attempt',
      ],
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

  if (actionId === 'check-squads-package') {
    const packages = ['@sqds/multisig']
    const installed = packages.filter((name) => context.packages.has(name))
    const missing = packages.filter((name) => !context.packages.has(name))
    return {
      title: 'Squads packages',
      status: missing.length === 0 ? 'success' : 'warning',
      detail: missing.length === 0
        ? 'Squads multisig SDK is listed in package.json.'
        : `Missing ${missing.join(', ')}. Install the SDK before multisig or vault inspection flows.`,
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

  if (actionId === 'open-spawnagents-panel') {
    return {
      title: 'SpawnAgents',
      status: 'info',
      detail: 'Open the SpawnAgents panel from the sidebar to spawn and manage your autonomous trading agents.',
    }
  }

  if (actionId === 'open-spawnagents-live') {
    void daemon.shell.openExternal('https://spawnagents.fun/genesis.html')
    return {
      title: 'Opening live agents',
      status: 'success',
      detail: 'Launched the SpawnAgents live agent directory in your browser.',
    }
  }

  if (actionId === 'open-kausalayer-mcp-register') {
    void daemon.shell.openExternal('https://www.kausalayer.com/mcp')
    return {
      title: 'Opening KausaLayer API key page',
      status: 'success',
      detail: 'Launched the KausaLayer MCP API key page in your browser.',
    }
  }

  if (actionId === 'open-kausalayer-docs') {
    void daemon.shell.openExternal('https://docs.kausalayer.com')
    return {
      title: 'Opening KausaLayer docs',
      status: 'success',
      detail: 'Launched the KausaLayer documentation in your browser.',
    }
  }

  if (actionId === 'open-idle-resources') {
    void daemon.shell.openExternal('https://earnidle.com/resources')
    return {
      title: 'Opening IDLE resources',
      status: 'success',
      detail: 'Launched the IDLE resource network in your browser.',
    }
  }

  if (actionId === 'open-idle-docs') {
    void daemon.shell.openExternal('https://earnidle.com/docs')
    return {
      title: 'Opening IDLE docs',
      status: 'success',
      detail: 'Launched the IDLE documentation in your browser.',
    }
  }

  return {
    title: 'Preview only',
    status: 'info',
    detail: 'This action is intentionally not executable yet. DAEMON will add transaction previews and confirmations before enabling it.',
  }
}
