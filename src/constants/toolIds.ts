import { TOOL_REGISTRY } from './toolRegistry'

// Canonical list of profile-managed built-in tools.
// Includes drawer tools and tab tools so shortcuts/pins cannot bypass visibility.
export const BUILTIN_TOOL_IDS: string[] = TOOL_REGISTRY.map((tool) => tool.id)
