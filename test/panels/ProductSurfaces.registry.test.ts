import { describe, expect, it } from 'vitest'
import { DRAWER_TOOL_IDS } from '../../src/constants/toolRegistry'
import {
  PRODUCT_SURFACE_BY_ID,
  PRODUCT_SURFACES,
} from '../../src/constants/productSurfaces'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'

describe('product surface registry', () => {
  it('covers every drawer tool and active adjacent surface', () => {
    for (const toolId of DRAWER_TOOL_IDS) {
      expect(PRODUCT_SURFACE_BY_ID[toolId], toolId).toBeDefined()
    }

    expect(PRODUCT_SURFACE_BY_ID.browser).toBeDefined()
    expect(PRODUCT_SURFACE_BY_ID.subscriptions).toBeDefined()
  })

  it('has a primary action for every surface', () => {
    for (const surface of PRODUCT_SURFACES) {
      expect(surface.primaryAction.label, surface.id).not.toBe('')
      expect(surface.primaryAction.toolId, surface.id).not.toBe('')
      expect(surface.purpose, surface.id).not.toBe('')
    }
  })

  it('keeps integration links valid', () => {
    const integrationIds = new Set(INTEGRATION_REGISTRY.map((integration) => integration.id))

    for (const surface of PRODUCT_SURFACES) {
      if (surface.relatedIntegrationId) {
        expect(integrationIds.has(surface.relatedIntegrationId), surface.id).toBe(true)
      }
    }
  })
})
