import type { ComponentType, LazyExoticComponent } from 'react'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { TOOL_TO_PACK } from '../../constants/capabilityPacks'

export interface WorkspaceToolEntry {
  name: string
  component: LazyExoticComponent<ComponentType>
  Icon: ComponentType<{ size?: number }>
}

interface BuildRegistryInput {
  builtinTools: Array<{ id: string; name: string; component: LazyExoticComponent<ComponentType>; icon: ComponentType<{ size?: number }> }>
  toolIcons: Record<string, ComponentType<{ size?: number }>>
  plugins: Array<{ id: string; enabled: number | boolean }>
  enabledPacks: Record<string, boolean>
}

/**
 * Resolves every tool id that may appear as a center-panel tab.
 *
 * Pack-owned plugins (memory, deploy) are resolved from pack state as well as
 * plugin rows: the Activity Bar renders their icon purely from the pack
 * toggle, so the tab registry must recognize them even when the plugins DB
 * row is missing or stale — otherwise the icon click is a silent dead end.
 */
export function buildWorkspaceToolRegistry(input: BuildRegistryInput): Map<string, WorkspaceToolEntry> {
  const toolMap = new Map<string, WorkspaceToolEntry>()

  for (const tool of input.builtinTools) {
    toolMap.set(tool.id, {
      name: tool.name,
      component: tool.component,
      Icon: input.toolIcons[tool.id] ?? tool.icon,
    })
  }

  for (const plugin of input.plugins) {
    if (!plugin.enabled) continue
    const manifest = PLUGIN_REGISTRY[plugin.id]
    if (!manifest) continue
    toolMap.set(plugin.id, {
      name: manifest.name,
      component: manifest.component,
      Icon: manifest.icon,
    })
  }

  for (const [pluginId, manifest] of Object.entries(PLUGIN_REGISTRY)) {
    if (toolMap.has(pluginId)) continue
    const packId = TOOL_TO_PACK[pluginId]
    if (!packId || input.enabledPacks[packId] === false) continue
    toolMap.set(pluginId, {
      name: manifest.name,
      component: manifest.component,
      Icon: manifest.icon,
    })
  }

  return toolMap
}
