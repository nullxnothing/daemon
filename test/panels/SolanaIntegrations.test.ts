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

  it('reports Venum key readiness from secure-key context', async () => {
    const missing = await runIntegrationAction('check-venum-key', createContext([]))
    expect(missing.title).toBe('Venum key')
    expect(missing.status).toBe('info')

    const ready = await runIntegrationAction('check-venum-key', {
      ...createContext([]),
      secureKeys: { VENUM_API_KEY: true },
    })
    expect(ready.status).toBe('success')
  })

  it('asks for a Venum key before running the live price check', async () => {
    const result = await runIntegrationAction('check-venum-price', createContext([]))
    expect(result.title).toBe('Venum price feed')
    expect(result.status).toBe('info')
  })

  it('lists Venum as a guided provider in the toolbox catalog', () => {
    const venum = SOLANA_INTEGRATION_CATALOG.find((entry) => entry.id === 'venum-provider')
    expect(venum).toBeDefined()
    expect(venum?.area).toBe('Providers')
    expect(venum?.docsUrl).toMatch(/venum\.dev/)
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

  it('lists Solflare in the wallet catalog', () => {
    const solflare = SOLANA_INTEGRATION_CATALOG.find((entry) => entry.id === 'solflare-wallet')

    expect(solflare).toBeDefined()
    expect(solflare?.label).toBe('Solflare')
    expect(solflare?.area).toBe('Wallets')
    expect(solflare?.docsUrl).toContain('docs.solflare.com')
  })
})
