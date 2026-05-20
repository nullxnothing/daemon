import { describe, expect, it } from 'vitest'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'
import { runIntegrationAction } from '../../src/panels/IntegrationCommandCenter/actionRunner'
import { resolveIntegrationStatus, type IntegrationContext } from '../../src/panels/IntegrationCommandCenter/status'

describe('Integration Command Center registry', () => {
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

  it('has SpawnAgents as a native DAEMON integration with wallet requirement and panel action', () => {
    const spawnAgents = INTEGRATION_REGISTRY.find((integration) => integration.id === 'spawnagents')

    expect(spawnAgents).toBeDefined()
    expect(spawnAgents!.docsUrl).toBe('https://spawnagents.fun/how')
    expect(spawnAgents!.requirements).toContainEqual({
      type: 'wallet',
      key: 'default-wallet',
      label: 'DAEMON wallet with keypair (for signing agent actions)',
    })
    expect(spawnAgents!.actions.map((action) => action.id)).toEqual([
      'open-spawnagents-panel',
      'open-spawnagents-live',
    ])
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
      key: 'IDLE_REGISTRY_URL',
      label: 'IDLE resource registry URL',
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
})
