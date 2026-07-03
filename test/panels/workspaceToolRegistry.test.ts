import { describe, expect, it } from 'vitest'
import { buildWorkspaceToolRegistry } from '../../src/panels/Editor/workspaceToolRegistry'
import { PLUGIN_REGISTRY } from '../../src/plugins/registry'
import { CAPABILITY_PACKS, defaultEnabledPacks } from '../../src/constants/capabilityPacks'

const NO_TOOLS = { builtinTools: [], toolIcons: {} }

describe('buildWorkspaceToolRegistry', () => {
  it('resolves pack-owned plugins from pack state even without a plugins DB row (Memory dead-click regression)', () => {
    const registry = buildWorkspaceToolRegistry({
      ...NO_TOOLS,
      plugins: [],
      enabledPacks: defaultEnabledPacks(),
    })

    expect(registry.get('memory')?.name).toBe('Memory')
    expect(registry.get('deploy')?.name).toBe('Deploy')
  })

  it('drops pack-owned plugins when the owning pack is disabled', () => {
    const registry = buildWorkspaceToolRegistry({
      ...NO_TOOLS,
      plugins: [],
      enabledPacks: { ...defaultEnabledPacks(), memory: false, sites: false },
    })

    expect(registry.has('memory')).toBe(false)
    expect(registry.has('deploy')).toBe(false)
  })

  it('resolves enabled plugin rows and skips disabled ones', () => {
    const registry = buildWorkspaceToolRegistry({
      ...NO_TOOLS,
      plugins: [
        { id: 'subscriptions', enabled: 1 },
        { id: 'memory', enabled: 0 },
      ],
      enabledPacks: { ...defaultEnabledPacks(), memory: false, sites: false },
    })

    expect(registry.has('subscriptions')).toBe(true)
    // Disabled row + disabled pack: memory stays out.
    expect(registry.has('memory')).toBe(false)
  })
})

describe('capability packs — plugin membership consistency', () => {
  it('every pack pluginId exists in PLUGIN_REGISTRY', () => {
    for (const pack of CAPABILITY_PACKS) {
      for (const pluginId of pack.pluginIds) {
        expect(PLUGIN_REGISTRY[pluginId], `${pack.id} -> ${pluginId}`).toBeDefined()
      }
    }
  })

  it('every plugin-typed Activity Bar slot resolves to a registered plugin', () => {
    for (const pack of CAPABILITY_PACKS) {
      const slotToolId = pack.activityBar?.toolId
      if (!slotToolId || !pack.pluginIds.includes(slotToolId)) continue
      expect(PLUGIN_REGISTRY[slotToolId], `${pack.id} -> ${slotToolId}`).toBeDefined()
    }
  })
})
