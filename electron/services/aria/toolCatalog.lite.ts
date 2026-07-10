/**
 * DAEMON Lite tool catalog. Swapped in for toolCatalog.ts by a resolveId hook
 * in vite.lite.config.ts, so the Lite main bundle never imports the IDE/Solana
 * tool domains that pull heavy SDKs (raydium, metaplex, meteora, launchpads).
 *
 * v1.1 surface: planning + memory (chat), wallet reads + gated SOL transfer,
 * gated Jupiter swap, forensics scans, and the sandboxed preview browser.
 * Everything money-moving is `sensitive` risk → typed-confirm ApprovalCard.
 * The tool modules below only import @solana/web3.js (already shipped) +
 * WalletService/FeeService/RicoMapsService (fetch-based, no heavy SDK).
 */
import type { AriaTool } from './AriaTool'
import { planningTools } from './planningTools'
import { memoryTools } from './tools/memory'
import { walletTools } from './tools/wallet'
import { forensicsTools } from './tools/forensics'
import { liteTradeTools } from './tools/liteTrade'
import { litePreviewTools } from './tools/litePreview'

// Wallet tools the Lite app exposes: reads + SOL transfer + wallet creation.
// Excludes IDE-only project-assignment tools.
const LITE_WALLET_TOOL_NAMES = new Set(['read_wallet', 'transfer_sol', 'generate_wallet', 'set_default_wallet', 'store_helius_key'])

export const ARIA_TOOLS: AriaTool[] = [
  ...planningTools.filter((t) => t.name !== 'propose_patch'),
  ...memoryTools,
  ...walletTools.filter((t) => LITE_WALLET_TOOL_NAMES.has(t.name)),
  ...liteTradeTools,
  ...forensicsTools,
  ...litePreviewTools,
]

export function getTool(name: string): AriaTool | undefined {
  return ARIA_TOOLS.find((t) => t.name === name)
}
