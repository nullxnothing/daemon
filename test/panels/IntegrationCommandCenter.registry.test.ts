import { describe, expect, it } from 'vitest'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'
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

  it('wires Venum as an RPC integration with a free-key signup path', () => {
    const venum = INTEGRATION_REGISTRY.find((integration) => integration.id === 'venum')

    expect(venum).toBeDefined()
    expect(venum!.category).toBe('rpc')
    expect(venum!.docsUrl).toMatch(/venum\.dev/)
    expect(venum!.requirements).toContainEqual({
      type: 'secure-key',
      key: 'VENUM_API_KEY',
      label: 'Venum API key',
    })
    expect(venum!.requirements.some((requirement) => requirement.type === 'external-url' && requirement.key.includes('app.venum.dev'))).toBe(true)
    expect(venum!.actions.map((action) => action.id)).toContain('open-venum-signup')
    expect(venum!.actions.map((action) => action.id)).toContain('check-venum-key')
  })

  it('reports Venum key readiness from secure-key context', async () => {
    const base: IntegrationContext = {
      envFiles: [],
      mcps: [],
      packages: new Set(),
      walletReady: false,
      defaultWallet: null,
      secureKeys: {},
      toolchain: null,
    }

    const venum = INTEGRATION_REGISTRY.find((integration) => integration.id === 'venum')!
    // The signup link is an optional external-url requirement, so an unconfigured Venum reads as partial.
    expect(resolveIntegrationStatus(venum, base).status).toBe('partial')
    expect(resolveIntegrationStatus(venum, { ...base, secureKeys: { VENUM_API_KEY: true } }).status).toBe('ready')
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
})
