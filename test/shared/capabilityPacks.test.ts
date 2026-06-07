import { describe, it, expect } from 'vitest'
import {
  CAPABILITY_PACKS,
  CAPABILITY_PACKS_BY_ID,
  OPTIONAL_PACK_IDS,
  packToolIds,
  isCorePack,
  defaultEnabledPacks,
  PACK_IPC_DOMAINS,
} from '../../src/constants/capabilityPacks'
import { TOOL_REGISTRY_BY_ID } from '../../src/constants/toolRegistry'
import { INTEGRATION_REGISTRY } from '../../src/panels/IntegrationCommandCenter/registry'
import { PROFILE_PRESETS } from '../../src/constants/workspaceProfiles'

const INTEGRATION_IDS = new Set(INTEGRATION_REGISTRY.map((i) => i.id))

describe('capability packs — tool membership', () => {
  it('every pack toolId exists in TOOL_REGISTRY', () => {
    for (const pack of CAPABILITY_PACKS) {
      for (const toolId of pack.toolIds) {
        expect(TOOL_REGISTRY_BY_ID[toolId], `${pack.id} -> ${toolId}`).toBeDefined()
      }
    }
  })

  it('no tool belongs to more than one pack', () => {
    const seen = new Map<string, string>()
    for (const pack of CAPABILITY_PACKS) {
      for (const toolId of pack.toolIds) {
        expect(seen.has(toolId), `${toolId} in both ${seen.get(toolId)} and ${pack.id}`).toBe(false)
        seen.set(toolId, pack.id)
      }
    }
  })

  it('every pack member tool is an addon (not core)', () => {
    for (const pack of CAPABILITY_PACKS) {
      for (const toolId of pack.toolIds) {
        expect(TOOL_REGISTRY_BY_ID[toolId].moduleClass, `${toolId}`).toBe('addon')
      }
    }
  })
})

describe('capability packs — integration ids', () => {
  it('every explicit integrationId exists in INTEGRATION_REGISTRY', () => {
    for (const pack of CAPABILITY_PACKS) {
      for (const id of pack.integrationIds ?? []) {
        expect(INTEGRATION_IDS.has(id), `${pack.id} -> ${id}`).toBe(true)
      }
    }
  })
})

describe('capability packs — ipc domains', () => {
  it('pack ipcDomains match the shared manifest', () => {
    for (const pack of CAPABILITY_PACKS) {
      expect(pack.ipcDomains).toEqual(PACK_IPC_DOMAINS[pack.id])
    }
  })
})

describe('capability packs — status & defaults', () => {
  it('guard pack is core (always on)', () => {
    expect(isCorePack('guard')).toBe(true)
  })

  it('all packs default to enabled', () => {
    const defaults = defaultEnabledPacks()
    for (const pack of CAPABILITY_PACKS) {
      expect(defaults[pack.id]).toBe(true)
    }
  })

  it('optional pack ids exclude core packs', () => {
    expect(OPTIONAL_PACK_IDS).not.toContain('guard')
  })

  it('exposes a by-id lookup for every pack', () => {
    for (const pack of CAPABILITY_PACKS) {
      expect(CAPABILITY_PACKS_BY_ID[pack.id]).toBe(pack)
    }
  })
})

describe('capability packs — derived profile presets', () => {
  it('solana preset contains every Solana-facing pack tool', () => {
    const expected = packToolIds(['solana', 'wallet', 'launch', 'agent', 'markets'])
    for (const toolId of expected) {
      expect(PROFILE_PRESETS.solana, toolId).toContain(toolId)
    }
  })

  it('solana preset still includes the legacy tools asserted by callers', () => {
    for (const toolId of ['wallet', 'zauth', 'hackathon', 'agent-station', 'replay-engine']) {
      expect(PROFILE_PRESETS.solana).toContain(toolId)
    }
  })

  it('web preset excludes pack-owned Solana tools', () => {
    for (const toolId of ['wallet', 'zauth', 'token-launch', 'agent-station']) {
      expect(PROFILE_PRESETS.web).not.toContain(toolId)
    }
  })
})
