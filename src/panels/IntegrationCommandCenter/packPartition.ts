import { INTEGRATION_REGISTRY, type IntegrationDefinition } from './registry'
import { CAPABILITY_PACKS_BY_ID, type CapabilityPack, type PackId } from '../../constants/capabilityPacks'

export function integrationsForPack(pack: CapabilityPack): IntegrationDefinition[] {
  return INTEGRATION_REGISTRY.filter(
    (i) => pack.integrationCategories.includes(i.category) || (pack.integrationIds?.includes(i.id) ?? false),
  )
}

export function integrationsForPackId(packId: PackId): IntegrationDefinition[] {
  const pack = CAPABILITY_PACKS_BY_ID[packId]
  return integrationsForPack(pack)
}
