import { isToolDisableable } from '../constants/toolRegistry'

let loaded = false
let currentVisibility: Record<string, boolean> = {}

export function setToolVisibilityGuard(visibility: Record<string, boolean>, isLoaded = true) {
  currentVisibility = visibility
  loaded = isLoaded
}

export function canActivateTool(toolId: string): boolean {
  if (!isToolDisableable(toolId)) return true
  if (!loaded) return true
  if (!(toolId in currentVisibility)) return true
  return currentVisibility[toolId] !== false
}
