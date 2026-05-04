import { describe, expect, it } from 'vitest'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'
import { runIntegrationAction } from '../../src/panels/IntegrationCommandCenter/actionRunner'
import type { IntegrationContext } from '../../src/panels/IntegrationCommandCenter/status'
import { SOLANA_INTEGRATION_CATALOG, SOLANA_PROTOCOL_PACKS } from '../../src/panels/SolanaToolbox/catalog'

const TODAY_INTEGRATIONS = [
  {
    id: 'light-protocol',
    label: 'Light Protocol',
    catalogId: 'light-protocol',
    packId: 'light',
    actionId: 'check-light-package',
    packages: ['@lightprotocol/stateless.js', '@lightprotocol/compressed-token'],
  },
  {
    id: 'magicblock',
    label: 'MagicBlock',
    catalogId: 'magicblock',
    packId: 'magicblock',
    actionId: 'check-magicblock-package',
    packages: ['@magicblock-labs/ephemeral-rollups-sdk'],
  },
  {
    id: 'debridge',
    label: 'deBridge',
    catalogId: 'debridge',
    packId: 'debridge',
    actionId: 'check-debridge-package',
    packages: ['@debridge-finance/dln-client'],
  },
  {
    id: 'squads',
    label: 'Squads',
    catalogId: 'squads',
    packId: 'squads',
    actionId: 'check-squads-package',
    packages: ['@sqds/multisig'],
  },
] as const

function createContext(packages: string[]): IntegrationContext {
  return {
    envFiles: [
      {
        fileName: '.env',
        filePath: 'C:/project/.env',
        vars: [
          {
            key: 'RPC_URL',
            value: 'https://rpc.example',
            isComment: false,
            isSecret: false,
            secretLabel: null,
            lineIndex: 0,
            raw: 'RPC_URL=https://rpc.example',
          },
        ],
      },
    ],
    mcps: [],
    packages: new Set(packages),
    walletReady: false,
    defaultWallet: null,
    secureKeys: {},
    toolchain: null,
  }
}

describe('Solana ecosystem integrations', () => {
  it('wires today integrations into the toolbox catalog, protocol packs, and command center', () => {
    for (const item of TODAY_INTEGRATIONS) {
      const registry = INTEGRATION_REGISTRY.find((entry) => entry.id === item.id)
      expect(registry, item.id).toBeDefined()
      expect(registry?.name).toBe(item.label)
      expect(registry?.installCommand).toBeTruthy()
      for (const pkg of item.packages) expect(registry?.installCommand).toContain(pkg)
      expect(registry?.actions.some((action) => action.id === item.actionId)).toBe(true)

      const catalog = SOLANA_INTEGRATION_CATALOG.find((entry) => entry.id === item.catalogId)
      expect(catalog, item.catalogId).toBeDefined()
      expect(catalog?.label).toBe(item.label)
      expect(catalog?.skill).toBeTruthy()

      const pack = SOLANA_PROTOCOL_PACKS.find((entry) => entry.id === item.packId)
      expect(pack, item.packId).toBeDefined()
      expect(pack?.label).toBe(item.label)
      for (const pkg of item.packages) expect(pack?.installHint).toContain(pkg)
    }
  })

  it('reports package readiness for today integrations', async () => {
    for (const item of TODAY_INTEGRATIONS) {
      const missing = await runIntegrationAction(item.actionId, createContext([]))
      expect(missing.status, item.id).toBe('warning')
      for (const pkg of item.packages) expect(missing.items).toContain(pkg)

      const ready = await runIntegrationAction(item.actionId, createContext([...item.packages]))
      expect(ready.status, item.id).toBe('success')
      for (const pkg of item.packages) expect(ready.items).toContain(pkg)
    }
  })
})
