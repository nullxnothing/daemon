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
})
