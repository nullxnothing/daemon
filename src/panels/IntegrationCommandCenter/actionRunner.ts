import { daemon } from '../../lib/daemonBridge'
import type { IntegrationContext } from './status'

// USDC mainnet mint — the default stablecoin for inspecting allowances/subscriptions.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

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

  if (actionId === 'check-solflare-sdk') {
    const ready = context.packages.has('@solflare-wallet/sdk')
    return {
      title: 'Solflare SDK',
      status: ready ? 'success' : 'info',
      detail: ready
        ? '@solflare-wallet/sdk is listed in package.json.'
        : 'Direct Solflare integration needs @solflare-wallet/sdk. Generated web dApps can also use Solana Wallet Adapter with SolflareWalletAdapter.',
      items: ready ? ['@solflare-wallet/sdk'] : ['@solflare-wallet/sdk', '@solana/wallet-adapter-wallets'],
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

  if (actionId === 'open-clawpump-panel') {
    return {
      title: 'ClawPump',
      status: 'info',
      detail: 'Open the ClawPump panel from the sidebar to create and manage your hosted trading agents.',
    }
  }

  if (actionId === 'open-clawpump-docs') {
    void daemon.shell.openExternal('https://clawpump.tech/developers')
    return {
      title: 'Opening developer docs',
      status: 'success',
      detail: 'Launched the ClawPump developer documentation in your browser.',
    }
  }

  if (actionId === 'check-degentools-tools') {
    if (!context.secureKeys.DEGENTOOLS_API_KEY) {
      return {
        title: 'DegenTools key missing',
        status: 'warning',
        detail: 'Store a DegenTools API key before checking the MCP endpoint.',
      }
    }
    const tools = await daemon.degentools.tools()
    if (!tools.ok) {
      return {
        title: 'DegenTools unavailable',
        status: 'error',
        detail: tools.error ?? 'DAEMON could not reach the DegenTools MCP endpoint.',
      }
    }
    const text = JSON.stringify(tools.data)
    const count = (text.match(/"name"/g) ?? []).length
    return {
      title: 'DegenTools MCP online',
      status: 'success',
      detail: count > 0 ? `${count} tools reported.` : 'The MCP endpoint responded.',
    }
  }

  if (actionId === 'open-degentools-panel') {
    return {
      title: 'DegenTools',
      status: 'info',
      detail: 'Open the DegenTools panel from the sidebar to generate launch assets and run MCP calls.',
    }
  }

  if (actionId === 'open-degentools-docs') {
    void daemon.shell.openExternal('https://degentools.co/docs')
    return {
      title: 'Opening DegenTools docs',
      status: 'success',
      detail: 'Launched the DegenTools documentation in your browser.',
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

  if (actionId === 'open-solflare-docs') {
    void daemon.shell.openExternal('https://docs.solflare.com/solflare/technical/integrate-solflare')
    return {
      title: 'Opening Solflare docs',
      status: 'success',
      detail: 'Launched Solflare integration docs in your browser.',
    }
  }

  if (actionId === 'check-said-identity') {
    const wallet = context.defaultWallet
    if (!wallet) {
      return {
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Set a default wallet in the Wallet panel before checking its SAID identity.',
      }
    }

    const identity = await daemon.said.getIdentity(wallet.address)
    if (!identity.ok || !identity.data) {
      return {
        title: 'SAID lookup failed',
        status: 'error',
        detail: identity.error ?? 'DAEMON could not reach the SAID directory.',
        items: [wallet.address],
      }
    }

    if (!identity.data.registered) {
      return {
        title: 'Not registered on SAID',
        status: 'info',
        detail: `${wallet.name} has no SAID identity yet. Register it to earn a verifiable trust score and appear in the directory.`,
        items: [wallet.address],
      }
    }

    const trustRes = await daemon.said.getTrust(wallet.address)
    const score = trustRes.ok && trustRes.data ? trustRes.data.score : identity.data.trustScore
    const badges = [
      identity.data.isVerified ? 'verified' : 'unverified',
      trustRes.ok && trustRes.data?.staked ? 'staked' : 'no stake',
    ]
    return {
      title: identity.data.name ? `SAID: ${identity.data.name}` : 'SAID identity found',
      status: 'success',
      detail: `Trust score ${score ?? 'n/a'}/100 (${badges.join(', ')}).`,
      items: [
        wallet.address,
        ...(identity.data.pda ? [`PDA ${identity.data.pda}`] : []),
        ...(typeof identity.data.feedbackCount === 'number' ? [`${identity.data.feedbackCount} feedback`] : []),
      ],
    }
  }

  if (actionId === 'open-said-directory') {
    void daemon.shell.openExternal('https://www.saidprotocol.com/agents')
    return {
      title: 'Opening SAID directory',
      status: 'success',
      detail: 'Launched the SAID public agent directory in your browser.',
    }
  }

  if (actionId === 'open-said-docs') {
    void daemon.shell.openExternal('https://www.saidprotocol.com/docs')
    return {
      title: 'Opening SAID docs',
      status: 'success',
      detail: 'Launched the SAID docs in your browser.',
    }
  }

  if (actionId === 'check-allowance-state') {
    const wallet = context.defaultWallet
    if (!wallet) {
      return {
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Set a default wallet in the Wallet panel before inspecting allowances.',
      }
    }
    const state = await daemon.allowances.getState(wallet.address, USDC_MINT)
    if (!state.ok || !state.data) {
      return {
        title: 'Allowance lookup failed',
        status: 'error',
        detail: state.error ?? 'DAEMON could not read the wallet token account.',
        items: [wallet.address],
      }
    }
    if (!state.data.tokenAccountExists) {
      return {
        title: 'No USDC token account',
        status: 'info',
        detail: `${wallet.name} has no USDC token account yet, so it has granted no allowance on this mint.`,
        items: [wallet.address],
      }
    }
    if (!state.data.hasDelegate) {
      return {
        title: 'No active allowance',
        status: 'success',
        detail: `${wallet.name} has no delegate on its USDC account — no third party can spend from it.`,
        items: [wallet.address],
      }
    }
    return {
      title: 'Active allowance',
      status: 'info',
      detail: `${wallet.name} has delegated up to ${state.data.delegatedAmount} (base units) of USDC.`,
      items: [`delegate ${state.data.delegate}`, `token account ${state.data.tokenAccount}`],
    }
  }

  if (actionId === 'check-subscription-enrollment') {
    const wallet = context.defaultWallet
    if (!wallet) {
      return {
        title: 'No wallet selected',
        status: 'warning',
        detail: 'Set a default wallet in the Wallet panel before checking subscription enrollment.',
      }
    }
    const sub = await daemon.allowances.getSubscription(wallet.address, USDC_MINT)
    if (!sub.ok || !sub.data) {
      return {
        title: 'Subscription lookup failed',
        status: 'error',
        detail: sub.error ?? 'DAEMON could not read the wallet token account.',
        items: [wallet.address],
      }
    }
    return {
      title: sub.data.enrolled ? 'Enrolled in native subscriptions' : 'Not enrolled',
      status: sub.data.enrolled ? 'info' : 'success',
      detail: sub.data.enrolled
        ? `${wallet.name} has approved the Subscriptions Delegation authority on USDC.`
        : `${wallet.name} has not approved the native Subscriptions Delegation authority on USDC.`,
      items: [`authority ${sub.data.subscriptionAuthority}`],
    }
  }

  if (actionId === 'open-subscriptions-docs') {
    void daemon.shell.openExternal('https://solana.com/docs/payments/subscriptions/overview')
    return {
      title: 'Opening Solana docs',
      status: 'success',
      detail: 'Launched the Solana Subscriptions & Allowances docs in your browser.',
    }
  }

  if (actionId === 'preview-grant-allowance') {
    return {
      title: 'Grant allowance (preview only)',
      status: 'info',
      detail: 'Granting signs an approve-checked instruction that delegates a capped amount to a spender. DAEMON will route this through a transaction preview and the signer guard before enabling it.',
      items: ['instruction: approveChecked', 'sets delegate + max amount', 'a new grant revokes any prior delegate'],
    }
  }

  if (actionId === 'preview-revoke-allowance') {
    return {
      title: 'Revoke allowance (preview only)',
      status: 'warning',
      detail: 'Revoking signs a revoke instruction that clears the delegate entirely (no partial revoke). DAEMON will gate this behind a transaction preview before enabling it.',
      items: ['instruction: revoke', 'clears the active delegate', 'requires-confirmation'],
    }
  }

  if (actionId === 'open-signalhouse-panel') {
    return {
      title: 'Signalhouse',
      status: 'info',
      detail: 'Open the Signalhouse panel from the sidebar to browse strategies, ProofOfEdge rankings, and live risk verdicts.',
    }
  }

  if (actionId === 'check-signalhouse-health') {
    const health = await daemon.signalhouse.getHealth()
    if (!health.ok || !health.data) {
      return {
        title: 'Signalhouse unreachable',
        status: 'error',
        detail: health.error ?? 'DAEMON could not reach the Signalhouse API.',
      }
    }
    if (!health.data.ok) {
      return {
        title: 'Signalhouse degraded',
        status: 'warning',
        detail: 'The Signalhouse API responded but reported an unhealthy state.',
      }
    }
    const statusRes = await daemon.signalhouse.getStatus()
    const lag = statusRes.ok && statusRes.data ? statusRes.data.indexerLagSeconds : null
    const paused = statusRes.ok && statusRes.data ? statusRes.data.globalExecutionPaused : null
    return {
      title: 'Signalhouse online',
      status: 'success',
      detail: `${health.data.service ?? 'signalhouse-api'} is online.`,
      items: [
        ...(lag !== null ? [`indexer lag ${lag}s`] : []),
        ...(paused === true ? ['execution paused'] : []),
      ],
    }
  }

  if (actionId === 'top-strategies') {
    const res = await daemon.signalhouse.getLeaderboard({ window: '7d', sort: 'proof_of_edge', limit: 3 })
    if (!res.ok) {
      return {
        title: 'Leaderboard unavailable',
        status: 'error',
        detail: res.error ?? 'DAEMON could not load the Signalhouse leaderboard.',
      }
    }
    const rows = res.data ?? []
    if (rows.length === 0) {
      return {
        title: 'No strategies indexed yet',
        status: 'info',
        detail: 'Signalhouse has no live strategies on the leaderboard right now.',
      }
    }
    return {
      title: 'Top strategies (7d ProofOfEdge)',
      status: 'success',
      detail: `${rows.length} strategies ranked by ProofOfEdge.`,
      items: rows.map((s, i) => `#${i + 1} ${s.name ?? s.id} — PoE ${s.proofOfEdge ?? 'n/a'}`),
    }
  }

  if (actionId === 'open-signalhouse-docs') {
    void daemon.shell.openExternal('https://github.com/nullxnothing/Signalhouse')
    return {
      title: 'Opening Signalhouse docs',
      status: 'success',
      detail: 'Launched the Signalhouse documentation in your browser.',
    }
  }

  if (actionId === 'preview-copy-trading') {
    return {
      title: 'Copy-trading (preview only)',
      status: 'info',
      detail: 'Following a strategy requires wallet-signature auth, an on-chain Drift delegate transaction, and a follow request with risk limits. DAEMON will route every signing step through a transaction preview and the signer guard before enabling it.',
      items: ['1. wallet auth (signMessage)', '2. Drift delegate transaction (on-chain)', '3. follow + risk limits', 'revocable: clear the Drift delegate anytime'],
    }
  }

  if (actionId === 'open-ricomaps-panel') {
    return {
      title: 'RicoMaps',
      status: 'info',
      detail: 'Open the RicoMaps panel from the sidebar to start the local graph explorer and inspect token or wallet relationships.',
    }
  }

  if (actionId === 'start-ricomaps-service') {
    const current = await daemon.forensics.ricoMapsStatus()
    if (current.ok && current.data?.running) {
      return {
        title: 'RicoMaps running',
        status: 'success',
        detail: `Local RicoMaps is already available on port ${current.data.port}.`,
        items: [current.data.url, current.data.projectPath],
      }
    }

    const started = await daemon.forensics.startRicoMaps()
    if (!started.ok || !started.data) {
      return {
        title: 'RicoMaps start failed',
        status: 'error',
        detail: started.error ?? 'DAEMON could not start the local RicoMaps service.',
      }
    }

    return {
      title: started.data.running ? 'RicoMaps ready' : 'RicoMaps not ready',
      status: started.data.running ? 'success' : 'warning',
      detail: started.data.error ?? `Local RicoMaps is available at ${started.data.url}.`,
      items: [started.data.url, started.data.projectPath],
    }
  }

  if (actionId === 'open-flywheel-panel') {
    return {
      title: 'Fee Flywheel',
      status: 'info',
      detail: 'Open the Fee Flywheel panel from the sidebar to configure a token\'s 80/20 fee split and run buyback & burn into $DAEMON.',
    }
  }

  if (actionId === 'open-flywheel-docs') {
    void daemon.shell.openExternal('https://pump.fun/docs/fees')
    return {
      title: 'Opening pump.fun fee docs',
      status: 'success',
      detail: 'Launched the pump.fun creator-fee documentation in your browser.',
    }
  }

  if (actionId === 'configure-flywheel-split') {
    return {
      title: 'Configure split (preview only)',
      status: 'info',
      detail: 'Configuring writes an on-chain pump.fun fee-share config (default 80% creator / 20% buyback). The config is PERMANENT once written. Use the Fee Flywheel panel, which previews the recipients and percentages and requires explicit confirmation before signing.',
      items: ['80% → creator payout wallet', '20% → $DAEMON buyback & burn', 'permanent: cannot be changed after creation', 'signs with the pump.fun creator authority'],
    }
  }

  if (actionId === 'run-flywheel') {
    return {
      title: 'Run flywheel (preview only)',
      status: 'info',
      detail: 'Running claims accrued creator fees (pump.fun fans out the split automatically), swaps the buyback share of SOL to $DAEMON via Jupiter, and burns it. Run it from the Fee Flywheel panel where each transaction passes through the signer guard.',
      items: ['1. claim creator fees', '2. swap buyback SOL → $DAEMON (Jupiter)', '3. burn the $DAEMON received'],
    }
  }

  return {
    title: 'Preview only',
    status: 'info',
    detail: 'This action is intentionally not executable yet. DAEMON will add transaction previews and confirmations before enabling it.',
  }
}
