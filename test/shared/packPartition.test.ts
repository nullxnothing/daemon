import { describe, it, expect } from 'vitest'
import { integrationsForPack, integrationsForPackId } from '../../src/panels/IntegrationCommandCenter/packPartition'
import { CAPABILITY_PACKS_BY_ID } from '../../src/constants/capabilityPacks'

describe('integrationsForPack', () => {
  it('returns only rpc/agent integrations for the solana pack (plus explicit ids)', () => {
    const solanaPack = CAPABILITY_PACKS_BY_ID['solana']
    const result = integrationsForPack(solanaPack)
    for (const integration of result) {
      const matchesCategory = solanaPack.integrationCategories.includes(integration.category)
      const matchesId = solanaPack.integrationIds?.includes(integration.id) ?? false
      expect(matchesCategory || matchesId).toBe(true)
    }
  })

  it('solana pack includes jupiter (explicit integrationId)', () => {
    const solanaPack = CAPABILITY_PACKS_BY_ID['solana']
    const result = integrationsForPack(solanaPack)
    expect(result.some((i) => i.id === 'jupiter')).toBe(true)
  })

  it('solana pack includes at least one rpc-category integration', () => {
    const solanaPack = CAPABILITY_PACKS_BY_ID['solana']
    const result = integrationsForPack(solanaPack)
    expect(result.some((i) => i.category === 'rpc')).toBe(true)
  })

  it('wallet pack returns only wallet-category integrations', () => {
    const walletPack = CAPABILITY_PACKS_BY_ID['wallet']
    const result = integrationsForPack(walletPack)
    expect(result.length).toBeGreaterThan(0)
    for (const integration of result) {
      expect(integration.category).toBe('wallet')
    }
  })

  it('wallet pack does not include rpc integrations', () => {
    const walletPack = CAPABILITY_PACKS_BY_ID['wallet']
    const result = integrationsForPack(walletPack)
    expect(result.some((i) => i.category === 'rpc')).toBe(false)
  })

  it('wallet pack does not include defi integrations unless explicitly listed', () => {
    const walletPack = CAPABILITY_PACKS_BY_ID['wallet']
    const result = integrationsForPack(walletPack)
    const unexpectedDefi = result.filter(
      (i) => i.category === 'defi' && !(walletPack.integrationIds?.includes(i.id) ?? false),
    )
    expect(unexpectedDefi).toHaveLength(0)
  })
})

describe('integrationsForPackId', () => {
  it('delegates to integrationsForPack for solana', () => {
    const fromId = integrationsForPackId('solana')
    const fromPack = integrationsForPack(CAPABILITY_PACKS_BY_ID['solana'])
    expect(fromId.map((i) => i.id)).toEqual(fromPack.map((i) => i.id))
  })
})
