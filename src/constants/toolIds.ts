import { DRAWER_TOOL_IDS } from './toolRegistry'

// Canonical list of drawer-managed built-in tools.
// Derived from the shared registry so visibility, profiles, and drawer behavior stay aligned.
export const BUILTIN_TOOL_IDS: string[] = [...DRAWER_TOOL_IDS]
