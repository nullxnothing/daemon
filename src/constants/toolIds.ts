// Canonical list of all built-in drawer tool IDs.
// Keep in sync with BUILTIN_TOOLS in CommandDrawer.tsx.
// Includes both built-in tools and known plugin IDs that profiles need to filter.
export const BUILTIN_TOOL_IDS: string[] = [
  'starter', 'git', 'deploy', 'env', 'wallet', 'email',
  'browser', 'ports', 'processes', 'settings', 'image-editor',
  'solana-toolbox', 'block-scanner',
]
