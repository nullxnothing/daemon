import { afterEach, describe, expect, it, vi } from 'vitest'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'
import { runIntegrationAction } from '../../src/panels/IntegrationCommandCenter/actionRunner'
import { resolveIntegrationStatus, type IntegrationContext } from '../../src/panels/IntegrationCommandCenter/status'

function stubDaemon(said: { getIdentity?: unknown; getTrust?: unknown }) {
  const daemon = {
    said: {
      getIdentity: said.getIdentity ?? vi.fn(),
      getTrust: said.getTrust ?? vi.fn(),
    },
    shell: { openExternal: vi.fn() },
  }
  vi.stubGlobal('window', { daemon })
}

describe('Integration Command Center registry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps integration ids, actions, and docs valid', () => {
    const ids = new Set<string>()

    for (const integration of INTEGRATION_REGISTRY) {
      expect(integration.id).toMatch(/^[a-z0-9-]+$/)
      expect(ids.has(integration.id)).toBe(false)
      ids.add(integration.id)
      expect(integration.name.length).toBeGreaterThan(1)
      expect(integration.docsUrl).toMatch(/^https:\/\//)
      expect(integration.actions.length).toBeGreaterThan(0)

      const actionIds = new Set<string>()
      for (const action of integration.actions) {
        expect(actionIds.has(action.id)).toBe(false)
        actionIds.add(action.id)
        expect(action.risk).toMatch(/^(read-only|requires-confirmation|transaction)$/)
      }

      if (integration.primaryActionId) {
        const primary = integration.actions.find((action) => action.id === integration.primaryActionId)
        expect(primary, integration.id).toBeDefined()
        expect(primary!.kind, integration.id).not.toBe('planned')
      }
    }
  })

  it('marks fully configured integrations ready without counting optional setup', () => {
    const context: IntegrationContext = {
      envFiles: [
        {
          fileName: '.env',
          filePath: 'C:/project/.env',
          vars: [
            { key: 'RPC_URL', value: 'https://rpc.example', isComment: false, isSecret: false, secretLabel: null, lineIndex: 0, raw: 'RPC_URL=https://rpc.example' },
          ],
        },
      ],
      mcps: [
        { name: 'solana-mcp-server', label: 'Solana MCP', description: 'tools', category: 'testing', enabled: true },
        { name: 'helius', label: 'Helius', description: 'rpc', category: 'rpc', enabled: false },
      ],
      packages: new Set(['solana-agent-kit']),
      walletReady: true,
      defaultWallet: { id: 'wallet-1', name: 'Main Wallet', address: '7Y12wallet9AbC', is_default: 1, created_at: 1, assigned_project_ids: [] },
      secureKeys: { HELIUS_API_KEY: true, JUPITER_API_KEY: false },
      toolchain: null,
    }

    const sendAi = INTEGRATION_REGISTRY.find((integration) => integration.id === 'sendai-agent-kit')
    const helius = INTEGRATION_REGISTRY.find((integration) => integration.id === 'helius')

    expect(sendAi).toBeDefined()
    expect(helius).toBeDefined()
    expect(resolveIntegrationStatus(sendAi!, context).status).toBe('ready')
    expect(resolveIntegrationStatus(helius!, context).status).toBe('ready')
  })

  it('has ClawPump as a native DAEMON integration with API-key requirement and panel action', () => {
    const clawpump = INTEGRATION_REGISTRY.find((integration) => integration.id === 'clawpump')

    expect(clawpump).toBeDefined()
    expect(clawpump!.docsUrl).toBe('https://clawpump.tech/developers')
    expect(clawpump!.requirements).toContainEqual({
      type: 'secure-key',
      key: 'CLAWPUMP_API_KEY',
      label: 'ClawPump API key (cpk_...)',
    })
    expect(clawpump!.actions.map((action) => action.id)).toEqual([
      'open-clawpump-panel',
      'open-clawpump-docs',
    ])
  })

  it('has DegenTools as a native launch integration with MCP tool checks', async () => {
    const degentools = INTEGRATION_REGISTRY.find((integration) => integration.id === 'degentools')

    expect(degentools).toBeDefined()
    expect(degentools!.category).toBe('launch')
    expect(degentools!.docsUrl).toBe('https://degentools.co/docs')
    expect(degentools!.installCommand).toBe('npm install -g degentools')
    expect(degentools!.requirements).toContainEqual({
      type: 'secure-key',
      key: 'DEGENTOOLS_API_KEY',
      label: 'DegenTools API key (dgt_...)',
    })
    expect(degentools!.actions.map((action) => action.id)).toEqual([
      'open-degentools-panel',
      'check-degentools-tools',
      'open-degentools-docs',
    ])

    vi.stubGlobal('window', {
      daemon: {
        degentools: {
          tools: vi.fn(async () => ({ ok: true, data: { tools: [{ name: 'generate_meme' }] } })),
        },
        shell: { openExternal: vi.fn() },
      },
    })

    const context: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set(),
      walletReady: false,
      defaultWallet: null,
      secureKeys: { DEGENTOOLS_API_KEY: true },
      toolchain: null,
    }

    expect(resolveIntegrationStatus(degentools!, context).status).toBe('ready')
    const result = await runIntegrationAction('check-degentools-tools', context)
    expect(result.status).toBe('success')
    expect(result.title).toBe('DegenTools MCP online')
  })

  it('has Solflare as a wallet integration with SDK readiness', async () => {
    const solflare = INTEGRATION_REGISTRY.find((integration) => integration.id === 'solflare')

    expect(solflare).toBeDefined()
    expect(solflare!.category).toBe('wallet')
    expect(solflare!.docsUrl).toBe('https://docs.solflare.com/solflare/technical/integrate-solflare')
    expect(solflare!.installCommand).toContain('@solflare-wallet/sdk')
    expect(solflare!.actions.map((action) => action.id)).toEqual([
      'check-solflare-sdk',
      'open-solflare-docs',
    ])

    const context: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set(['@solflare-wallet/sdk']),
      walletReady: false,
      defaultWallet: null,
      secureKeys: {},
      toolchain: null,
    }

    const sdkCheck = await runIntegrationAction('check-solflare-sdk', context)
    expect(sdkCheck.status).toBe('success')
    expect(sdkCheck.items).toContain('@solflare-wallet/sdk')
  })

  it('has Zauth as an embedded x402 management integration', () => {
    const zauth = INTEGRATION_REGISTRY.find((integration) => integration.id === 'zauth')

    expect(zauth).toBeDefined()
    expect(zauth!.docsUrl).toBe('https://zauth.inc/provider-hub')
    expect(zauth!.requirements).toContainEqual({
      type: 'external-url',
      key: 'https://zauth.inc/database',
      label: 'Zauth x402 Database',
    })
    expect(zauth!.requirements).toContainEqual({
      type: 'external-url',
      key: 'https://zauth.inc/provider-hub',
      label: 'Zauth Provider Hub',
    })
    expect(zauth!.actions.map((action) => action.id)).toEqual([
      'open-zauth-database',
      'open-zauth-provider-hub',
    ])
  })

  it('keeps Metaplex aligned to Core, DAS, and agent-era docs', async () => {
    const metaplex = INTEGRATION_REGISTRY.find((integration) => integration.id === 'metaplex')

    expect(metaplex).toBeDefined()
    expect(metaplex!.docsUrl).toBe('https://www.metaplex.com/docs')
    expect(metaplex!.description).toContain('Core assets')
    expect(metaplex!.description).toContain('DAS reads')
    expect(metaplex!.description).toContain('agent identity')
    expect(metaplex!.installCommand).toContain('@metaplex-foundation/mpl-core')
    expect(metaplex!.installCommand).toContain('@metaplex-foundation/digital-asset-standard-api')
    expect(metaplex!.requirements).toContainEqual({
      type: 'package',
      key: '@metaplex-foundation/mpl-core',
      label: 'MPL Core package',
      optional: true,
    })
    expect(metaplex!.actions.map((action) => action.id)).toEqual([
      'check-nft-packages',
      'preview-core-agent-flow',
    ])

    const context: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set([
        '@metaplex-foundation/umi',
        '@metaplex-foundation/umi-bundle-defaults',
        '@metaplex-foundation/mpl-core',
        '@metaplex-foundation/mpl-token-metadata',
        '@metaplex-foundation/digital-asset-standard-api',
      ]),
      walletReady: false,
      defaultWallet: null,
      secureKeys: {},
      toolchain: null,
    }

    const packageCheck = await runIntegrationAction('check-nft-packages', context)
    expect(packageCheck.status).toBe('success')
    expect(packageCheck.detail).toContain('Core')
    expect(packageCheck.items).toContain('@metaplex-foundation/digital-asset-standard-api')
  })

  it('has IDLE Protocol as a DAEMON/Meterflow resource-router integration', async () => {
    const idle = INTEGRATION_REGISTRY.find((integration) => integration.id === 'idle-protocol')

    expect(idle).toBeDefined()
    expect(idle!.category).toBe('infra')
    expect(idle!.docsUrl).toBe('https://earnidle.com/docs')
    expect(idle!.requirements).toContainEqual({
      type: 'env',
      key: 'IDLE_REGISTRY_URL|PAYAI_DISCOVERY_URL',
      label: 'IDLE or PayAI discovery URL',
    })
    expect(idle!.requirements).toContainEqual({
      type: 'external-url',
      key: 'https://earnidle.com/resources',
      label: 'IDLE resource network',
    })
    expect(idle!.requirements).toContainEqual({
      type: 'mcp',
      key: 'x402-mcp',
      label: 'x402 MCP enabled',
      optional: true,
    })
    expect(idle!.actions.map((action) => action.id)).toEqual([
      'open-idle-resources',
      'open-idle-docs',
      'preview-idle-router',
    ])

    const context: IntegrationContext = {
      envFiles: [
        {
          fileName: '.env',
          filePath: 'C:/project/.env',
          vars: [
            { key: 'IDLE_REGISTRY_URL', value: 'https://gateway.earnidle.com/resources.json', isComment: false, isSecret: false, secretLabel: null, lineIndex: 0, raw: 'IDLE_REGISTRY_URL=https://gateway.earnidle.com/resources.json' },
          ],
        },
      ],
      mcps: [
        { name: 'x402-mcp', label: 'x402 MCP', description: 'payments', category: 'payments', enabled: true },
      ],
      packages: new Set(),
      walletReady: false,
      defaultWallet: null,
      secureKeys: {},
      toolchain: null,
    }

    expect(resolveIntegrationStatus(idle!, context).status).toBe('ready')
    const routeStack = await runIntegrationAction('preview-idle-router', context)
    expect(routeStack.status).toBe('success')
    expect(routeStack.title).toBe('IDLE execution prerequisites ready')
    expect(routeStack.items).toContain('x402 payment tooling available')
  })

  describe('SAID Protocol integration', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const baseContext: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set(),
      walletReady: true,
      defaultWallet: { id: 'wallet-1', name: 'Main Wallet', address: 'So11111111111111111111111111111111111111112', is_default: 1, created_at: 1, assigned_project_ids: [] },
      secureKeys: {},
      toolchain: null,
    }

    it('registers SAID as an agent identity integration', () => {
      const said = INTEGRATION_REGISTRY.find((integration) => integration.id === 'said-protocol')
      expect(said).toBeDefined()
      expect(said!.category).toBe('agent')
      expect(said!.docsUrl).toBe('https://www.saidprotocol.com/docs')
      expect(said!.installCommand).toContain('@said-protocol/agent')
      expect(said!.requirements).toContainEqual({
        type: 'wallet',
        key: 'default-wallet',
        label: 'Default DAEMON wallet (for register/verify signing)',
      })
      expect(said!.actions.map((action) => action.id)).toEqual([
        'check-said-identity',
        'open-said-directory',
        'open-said-docs',
        'preview-said-register',
      ])
      // register/verify/stake must stay gated behind confirmation, never auto-executed
      const register = said!.actions.find((action) => action.id === 'preview-said-register')
      expect(register!.kind).toBe('planned')
      expect(register!.risk).toBe('requires-confirmation')
    })

    it('reports a registered, verified identity with its trust score', async () => {
      stubDaemon({
        getIdentity: vi.fn(async () => ({
          ok: true,
          data: { registered: true, name: 'DAEMON Agent', isVerified: true, pda: 'PdA1', trustScore: 80, feedbackCount: 2 },
        })),
        getTrust: vi.fn(async () => ({ ok: true, data: { score: 88, verified: true, staked: true, reputation: 10 } })),
      })

      const result = await runIntegrationAction('check-said-identity', baseContext)
      expect(result.status).toBe('success')
      expect(result.title).toBe('SAID: DAEMON Agent')
      expect(result.detail).toContain('88/100')
      expect(result.detail).toContain('verified')
      expect(result.detail).toContain('staked')
      expect(result.items).toContain('PDA PdA1')
    })

    it('treats an unregistered wallet as actionable info, not an error', async () => {
      stubDaemon({
        getIdentity: vi.fn(async () => ({ ok: true, data: { registered: false, wallet: baseContext.defaultWallet!.address } })),
      })
      const result = await runIntegrationAction('check-said-identity', baseContext)
      expect(result.status).toBe('info')
      expect(result.title).toBe('Not registered on SAID')
    })

    it('surfaces lookup failures as errors', async () => {
      stubDaemon({
        getIdentity: vi.fn(async () => ({ ok: false, error: 'network down' })),
      })
      const result = await runIntegrationAction('check-said-identity', baseContext)
      expect(result.status).toBe('error')
      expect(result.detail).toBe('network down')
    })

    it('warns when no default wallet is set', async () => {
      stubDaemon({})
      const result = await runIntegrationAction('check-said-identity', { ...baseContext, defaultWallet: null, walletReady: false })
      expect(result.status).toBe('warning')
      expect(result.title).toBe('No wallet selected')
    })
  })

  describe('Subscriptions & Allowances integration', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    const baseContext: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set(),
      walletReady: true,
      defaultWallet: { id: 'wallet-1', name: 'Main Wallet', address: 'So11111111111111111111111111111111111111112', is_default: 1, created_at: 1, assigned_project_ids: [] },
      secureKeys: {},
      toolchain: null,
    }

    function stubAllowances(allowances: { getState?: unknown; getSubscription?: unknown }) {
      vi.stubGlobal('window', {
        daemon: {
          allowances: {
            getState: allowances.getState ?? vi.fn(),
            getSubscription: allowances.getSubscription ?? vi.fn(),
          },
          shell: { openExternal: vi.fn() },
        },
      })
    }

    it('registers as a wallet integration with only read-only and planned actions', () => {
      const integration = INTEGRATION_REGISTRY.find((entry) => entry.id === 'allowances')
      expect(integration).toBeDefined()
      expect(integration!.category).toBe('wallet')
      expect(integration!.docsUrl).toBe('https://solana.com/docs/payments/subscriptions/overview')
      expect(integration!.actions.map((action) => action.id)).toEqual([
        'check-allowance-state',
        'check-subscription-enrollment',
        'open-subscriptions-docs',
        'preview-grant-allowance',
        'preview-revoke-allowance',
      ])
      // No signing action ships in v1: every action is read-only or a gated preview.
      for (const action of integration!.actions) {
        expect(action.kind === 'safe-check' || action.kind === 'setup' || action.kind === 'planned').toBe(true)
        expect(action.risk).not.toBe('transaction')
      }
    })

    it('reports an active delegate and cap', async () => {
      stubAllowances({
        getState: vi.fn(async () => ({
          ok: true,
          data: { tokenAccountExists: true, hasDelegate: true, delegate: 'Del1', delegatedAmount: '5000000', tokenAccount: 'Ata1' },
        })),
      })
      const result = await runIntegrationAction('check-allowance-state', baseContext)
      expect(result.status).toBe('info')
      expect(result.title).toBe('Active allowance')
      expect(result.detail).toContain('5000000')
      expect(result.items).toContain('delegate Del1')
    })

    it('treats no delegate as a safe, no-allowance success', async () => {
      stubAllowances({
        getState: vi.fn(async () => ({ ok: true, data: { tokenAccountExists: true, hasDelegate: false, delegate: null, delegatedAmount: '0', tokenAccount: 'Ata1' } })),
      })
      const result = await runIntegrationAction('check-allowance-state', baseContext)
      expect(result.status).toBe('success')
      expect(result.title).toBe('No active allowance')
    })

    it('reports native subscription enrollment', async () => {
      stubAllowances({
        getSubscription: vi.fn(async () => ({ ok: true, data: { enrolled: true, subscriptionAuthority: 'Auth1' } })),
      })
      const result = await runIntegrationAction('check-subscription-enrollment', baseContext)
      expect(result.status).toBe('info')
      expect(result.title).toBe('Enrolled in native subscriptions')
      expect(result.items).toContain('authority Auth1')
    })

    it('keeps grant and revoke as non-executable previews', async () => {
      stubAllowances({})
      const grant = await runIntegrationAction('preview-grant-allowance', baseContext)
      expect(grant.title).toContain('preview only')
      expect(grant.detail).toContain('approve-checked')
      const revoke = await runIntegrationAction('preview-revoke-allowance', baseContext)
      expect(revoke.status).toBe('warning')
      expect(revoke.detail).toContain('no partial revoke')
    })

    it('warns when no default wallet is set', async () => {
      stubAllowances({})
      const result = await runIntegrationAction('check-allowance-state', { ...baseContext, defaultWallet: null, walletReady: false })
      expect(result.status).toBe('warning')
      expect(result.title).toBe('No wallet selected')
    })
  })
})
