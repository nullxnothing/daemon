/**
 * Bundled Robinhood Chain reference for ARIA — network constants and the
 * canonical token registry, distilled from docs.robinhood.com/chain.
 * Last synced: 2026-07-10. Addresses and feeds can move; the docs site is the
 * source of truth and rh_chain_rpc reads live state.
 */

export type RhNetworkId = 'mainnet' | 'testnet'

export interface RhChainNetwork {
  id: RhNetworkId
  name: string
  chainId: number
  rpcUrl: string
  sequencerFeedUrl: string
  explorerUrl: string
  parentChain: string
  gasToken: string
}

export const ROBINHOOD_CHAIN_DOCS_URL = 'https://docs.robinhood.com/chain/'
export const ROBINHOOD_CHAIN_STATUS_URL = 'http://status.robinhoodchain.offchain.io/'
export const ROBINHOOD_CHAIN_BRIDGE_URL =
  'https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum'
export const CHAINLINK_FEEDS_URL =
  'https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood'

export const ROBINHOOD_CHAIN_NETWORKS: RhChainNetwork[] = [
  {
    id: 'mainnet',
    name: 'Robinhood Chain',
    chainId: 4663,
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    sequencerFeedUrl: 'wss://feed.mainnet.chain.robinhood.com',
    explorerUrl: 'https://robinhoodchain.blockscout.com',
    parentChain: 'Ethereum',
    gasToken: 'ETH',
  },
  {
    id: 'testnet',
    name: 'Robinhood Chain Testnet',
    chainId: 46630,
    rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
    sequencerFeedUrl: 'wss://feed.testnet.chain.robinhood.com',
    explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
    parentChain: 'Ethereum Sepolia',
    gasToken: 'ETH',
  },
]

export function getRhNetwork(id: RhNetworkId): RhChainNetwork {
  const network = ROBINHOOD_CHAIN_NETWORKS.find((n) => n.id === id)
  if (!network) throw new Error(`Unknown Robinhood Chain network "${id}".`)
  return network
}

export type RhTokenKind = 'core' | 'stock' | 'etf'

export interface RhToken {
  symbol: string
  kind: RhTokenKind
  /** Canonical mainnet contract address. A same-ticker token at another address is NOT canonical. */
  address: string
}

/** Canonical mainnet token registry (docs.robinhood.com/chain/contracts). */
export const ROBINHOOD_CHAIN_TOKENS: RhToken[] = [
  { symbol: 'WETH', kind: 'core', address: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' },
  { symbol: 'USDG', kind: 'core', address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168' },
  { symbol: 'AAPL', kind: 'stock', address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
  { symbol: 'AMD', kind: 'stock', address: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC' },
  { symbol: 'AMZN', kind: 'stock', address: '0x12f190a9F9d7D37a250758b26824B97CE941bF54' },
  { symbol: 'BABA', kind: 'stock', address: '0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4' },
  { symbol: 'BE', kind: 'stock', address: '0x822CC93fFD030293E9842c30BBD678F530701867' },
  { symbol: 'COIN', kind: 'stock', address: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b' },
  { symbol: 'CRCL', kind: 'stock', address: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5' },
  { symbol: 'CRWV', kind: 'stock', address: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3' },
  { symbol: 'GOOGL', kind: 'stock', address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3' },
  { symbol: 'INTC', kind: 'stock', address: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681' },
  { symbol: 'META', kind: 'stock', address: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35' },
  { symbol: 'MSFT', kind: 'stock', address: '0xe93237C50D904957Cf27E7B1133b510C669c2e74' },
  { symbol: 'MU', kind: 'stock', address: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD' },
  { symbol: 'NVDA', kind: 'stock', address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' },
  { symbol: 'ORCL', kind: 'stock', address: '0xb0992820E760d836549ba69BC7598b4af75dEE03' },
  { symbol: 'PLTR', kind: 'stock', address: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A' },
  { symbol: 'SNDK', kind: 'stock', address: '0xB90A19fF0Af67f7779afF50A882A9CfF42446400' },
  { symbol: 'SPCX', kind: 'stock', address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa' },
  { symbol: 'TSLA', kind: 'stock', address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d' },
  { symbol: 'USAR', kind: 'stock', address: '0xd917B029C761D264c6A312BBbcDA868658eF86a6' },
  { symbol: 'QQQ', kind: 'etf', address: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68' },
  { symbol: 'SGOV', kind: 'etf', address: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5' },
  { symbol: 'SLV', kind: 'etf', address: '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f' },
  { symbol: 'SPY', kind: 'etf', address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C' },
  { symbol: 'CUSO', kind: 'etf', address: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344' },
]
