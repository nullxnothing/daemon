/**
 * Robinhood Chain docs knowledge for ARIA, distilled from docs.robinhood.com/chain.
 * One section per docs page; details keep every hard fact (IDs, URLs, addresses,
 * mechanics) and drop the prose. Last synced: 2026-07-10.
 */

export interface RhKnowledgeSection {
  topic: string
  title: string
  summary: string
  details: string
  sourceUrl: string
}

const DOCS = 'https://docs.robinhood.com/chain'

export const ROBINHOOD_CHAIN_KNOWLEDGE: RhKnowledgeSection[] = [
  {
    topic: 'overview',
    title: 'About Robinhood Chain',
    summary: 'Permissionless, EVM-compatible Arbitrum L2 optimized for tokenized real-world assets; live on mainnet with ETH gas.',
    details: `- Ethereum L2 built on Arbitrum Dedicated Blockchains (Nitro); posts data to Ethereum via blobs; ETH is the native gas token.
- Optimized for tokenized RWAs: equities, ETFs, private assets. Flagship product is Robinhood Stock Tokens.
- First-come, first-served sequencing by sequencer arrival time — no priority gas auctions.
- Fully EVM-compatible: Solidity/Vyper deploy unmodified; Hardhat, Foundry, ethers.js, viem, Wagmi work out of the box.
- First-class ERC-4337 account abstraction (gas sponsorship, batching, session keys).
- Ecosystem: Alchemy (recommended RPC + AA), LayerZero (bridge), Chainlink (oracles), Fireblocks/BitGo (custody), Allium (analytics), Uniswap (public DEX), Rialto (proprietary AMM), Morpho (lending), Lighter + Arcus (perps), Paxos USDG (stablecoin), Zerion (wallet data), CoinGecko (tracking).
- Status page: http://status.robinhoodchain.offchain.io/ · Support: chain-developers-group@robinhood.com`,
    sourceUrl: `${DOCS}/`,
  },
  {
    topic: 'connecting',
    title: 'Connecting to Robinhood Chain',
    summary: 'Chain IDs, RPC endpoints (public + providers), sequencer feeds, and explorers for mainnet and testnet.',
    details: `- Mainnet: chain ID 4663 · ETH gas · explorer https://robinhoodchain.blockscout.com
- Testnet: chain ID 46630 · ETH gas · explorer https://explorer.testnet.chain.robinhood.com
- Public RPC (rate-limited, not for production): mainnet https://rpc.mainnet.chain.robinhood.com · testnet https://rpc.testnet.chain.robinhood.com
- Sequencer feed: wss://feed.mainnet.chain.robinhood.com (testnet: wss://feed.testnet.chain.robinhood.com) · Sequencer: https://sequencer.mainnet.chain.robinhood.com
- Alchemy (recommended for production): https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY} (wss:// same host); testnet robinhood-testnet. Also supported: QuickNode ({ENDPOINT}.robinhood-mainnet.quiknode.pro/{TOKEN}), Blockdaemon, dRPC, Validation Cloud.
- Archive endpoints (for historical reads/indexing) available via providers such as Alchemy.`,
    sourceUrl: `${DOCS}/connecting`,
  },
  {
    topic: 'add-network-to-wallet',
    title: 'Add network to your wallet',
    summary: 'Wallet configuration values for MetaMask-style manual add; Robinhood Wallet supports the chain natively.',
    details: `- Works with any EVM wallet (MetaMask, Phantom, etc.). Robinhood Wallet (iOS/Android) supports it natively.
- Manual add — mainnet: chain ID 4663, RPC https://rpc.mainnet.chain.robinhood.com/, symbol ETH, explorer https://robinhoodchain.blockscout.com
- Manual add — testnet: chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com, symbol ETH, explorer https://explorer.testnet.chain.robinhood.com`,
    sourceUrl: `${DOCS}/add-network-to-wallet`,
  },
  {
    topic: 'bridging',
    title: 'Bridging',
    summary: 'Canonical Arbitrum bridge (trustless, 7-day withdrawal) plus fast third-party routes: Stargate/LayerZero, CCIP, Relay, Across, LiFi/0x.',
    details: `- Canonical bridge (trustless, security from Ethereum): https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum — deposits ~10 min; withdrawals: initiate on L2, wait 7-day challenge period, then claim on L1 (costs L1 gas).
- Deposits use Arbitrum retryable tickets: a failed L2 leg can be manually redeemed within 7 days — funds are not lost.
- Fast routes: LayerZero OFT / Stargate (WBTC, USDG, other OFTs, minutes) · Chainlink CCIP (programmable transfer + action) · Relay (intents, seconds, bridge-and-execute) · Across (intents, seconds) · LiFi / 0x (swap-and-bridge).
- Programmatic bridging: interact with the Delayed Inbox on L1 (see protocol-contracts). A bridged ERC-20 has a DIFFERENT address on L2 than on Ethereum — resolve via calculateL2TokenAddress on the L2 Gateway Router.`,
    sourceUrl: `${DOCS}/bridging`,
  },
  {
    topic: 'stock-tokens',
    title: 'Stock Tokens',
    summary: 'Tokenized debt securities (issuer: Robinhood Assets (Jersey) Ltd) giving economic exposure to US equities/ETFs as standard ERC-20s with Chainlink feeds.',
    details: `- Standard ERC-20, 18 decimals; one token per underlying equity/ETF identified by ticker. Held, transferred, and composed like any ERC-20.
- Legally: tokenized DEBT securities issued by Robinhood Assets (Jersey) Limited (RHJ). Economic exposure only — no legal/beneficial rights in the underlying. Not offered to US persons (Reg S); also restricted in UK, Canada, Switzerland. Prospectus: http://docs.robinhood.com/rhj
- Primary market: only Authorised Participants (at issuance, BBVI) can subscribe/redeem after KYB. Developers compose with existing tokens; there is no public mint.
- Corporate actions (dividends, splits) are handled by an onchain multiplier (ERC-8056 Scaled UI Amount): raw balanceOf()/totalSupply() stay fixed; uiMultiplier() (1e18 fixed-point) scales shares-per-token. Dividends are reinvested via the multiplier, so tokens track TOTAL return.
- Live per-token Chainlink price feeds; the feed price already includes the multiplier.
- Trading is RFQ at launch (e.g. 0x RFQ quoting vs USDG).`,
    sourceUrl: `${DOCS}/stock-tokens`,
  },
  {
    topic: 'building-with-stock-tokens',
    title: 'Building with Stock Tokens',
    summary: 'Integration patterns: ERC-20 ops, ERC-8056 multiplier math, UI-adjusted views, events, and price-feed usage.',
    details: `- All standard ERC-20 ops work unmodified (balanceOf/transfer/approve). 18 decimals.
- ERC-8056 interfaces: uiMultiplier() current multiplier (1e18 = 1.0, launch value 1e18); newUIMultiplier() + effectiveAt() expose a scheduled pending multiplier; balanceOfUI(account) and totalSupplyUI() return underlying-share-adjusted views; events UIMultiplierUpdated(old, new, effectiveAtTimestamp) and TransferWithScaledUI(from, to, value, uiValue).
- Conversion: underlying shares = raw amount x uiMultiplier / 1e18. Not a rebasing token.
- Price: each token has a Chainlink AggregatorV3Interface feed (latestRoundData(), typically 8 decimals). Feed price is multiplier-adjusted — do NOT apply the multiplier again. USD value = balance x price / 1e8 (for 8-decimal feeds).
- Use cases: portfolio display, RFQ trading widgets, lending collateral (e.g. Morpho), index baskets, yield vaults, price-triggered contracts, perps margin.
- Getting started: pick a token address from the registry, read balanceOf, read latestRoundData() on its feed, compose.`,
    sourceUrl: `${DOCS}/building-with-stock-tokens`,
  },
  {
    topic: 'token-contracts',
    title: 'Token Contracts (canonical addresses)',
    summary: 'Canonical mainnet addresses for WETH, USDG, 20 stock tokens, and 5 tokenized ETFs.',
    details: `- Canonical registry is bundled in ROBINHOOD_CHAIN_TOKENS and served by the rh_stock_tokens tool: WETH, USDG (core); AAPL, AMD, AMZN, BABA, BE, COIN, CRCL, CRWV, GOOGL, INTC, META, MSFT, MU, NVDA, ORCL, PLTR, SNDK, SPCX, TSLA, USAR (stocks); QQQ, SGOV, SLV, SPY, CUSO (ETFs).
- CRITICAL: a token with a matching name/ticker at a different address is NOT a Robinhood Stock Token — always verify against the canonical address list.
- WETH mainnet: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73 · USDG: 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`,
    sourceUrl: `${DOCS}/contracts`,
  },
  {
    topic: 'protocol-contracts',
    title: 'Protocol Contracts',
    summary: 'L1 core/messaging contracts, token-bridge gateways (L1+L2), Arbitrum precompiles, and misc deployments.',
    details: `- L1 core (Ethereum mainnet): Rollup 0x23A19d23e89166adedbDcB432518AB01e4272D94 · Sequencer Inbox 0xBd0D173EEb87D57A09521c24388a12789F33ba96 · CoreProxyAdmin 0x1232813BDd40aa9d53066A880dE78a4Be70B90FD
- L1 messaging: Delayed Inbox 0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D · Bridge 0xDf8755334ce7A73cCF6b581C02eA649AE3E864b3 · Outbox 0xf0ce991ea4A0d2400A4AB49b20ae333f6Dce3DE9
- L1 token bridge: Gateway Router 0x6a2E3a1e16FC29f27Ce61429746D558d656975bB · ERC20 Gateway 0x85001CC4867C5e1C22dA4B79BB8852B9e2a06da0 · Custom Gateway 0x9368EAEbFe6E063C69dcF8126711A6997E0eCeE1 · WETH Gateway 0xF7e12b9614b509C747ab4423bC4ACF923759Cf1B
- L2 token bridge: Gateway Router 0x1E324B9316138CA9a73F960213621AD1aaf01B89 · ERC20 Gateway 0xfd9b17206278C16DdaacF6AC8f05dBf97EdCb31e · Custom Gateway 0x912285144fC0f6e89d3Ed16F5Ab72f87A1878959 · WETH Gateway 0x1D187C3E2dA52D72BC9C41e3AbA0fdFa6a7bF055 · Proxy Admin 0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF
- Precompiles (standard Arbitrum addresses on both networks): ArbSys 0x...64 · ArbInfo 0x...65 · ArbAddressTable 0x...66 · ArbFunctionTable 0x...68 · ArbOwnerPublic 0x...6b · ArbGasInfo 0x...6C · ArbAggregator 0x...6D · ArbRetryableTx 0x...6E · ArbStatistics 0x...6F · ArbOwner 0x...70 · ArbWasm 0x...71 · ArbWasmCache 0x...72 · NodeInterface 0x...C8
- Misc L2: Multicall 0x2cAC2D899eCC914d704FeaAE33ac1bF36277DaD1 · Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3
- Testnet variants exist for all of the above (parent: Sepolia) — see the docs page for the full testnet table.`,
    sourceUrl: `${DOCS}/protocol-contracts`,
  },
  {
    topic: 'gas-and-fees',
    title: 'Gas & Fees',
    summary: 'ETH-denominated fees with two components: L2 execution gas plus an L1 data fee proportional to calldata size.',
    details: `- Fee = L2 execution (gas used x L2 gas price, low and stable) + L1 data fee (posting calldata to Ethereum, varies with L1 congestion).
- Both are bundled into normal gas — eth_estimateGas and wallet previews account for both automatically.
- Optimize by minimizing calldata: pack arguments, avoid unnecessary data, batch operations (AA batched UserOperations help).
- Query live gas pricing onchain via the ArbGasInfo precompile (0x...6C).`,
    sourceUrl: `${DOCS}/gas-and-fees`,
  },
  {
    topic: 'transaction-finality',
    title: 'Transaction Finality',
    summary: 'Three stages: sub-second sequencer soft confirmation, batch posted to Ethereum (minutes), Ethereum finality (~13 min after posting).',
    details: `- Soft confirmation: sequencer accepts/orders/executes, returns a receipt sub-second. Reversible only if the sequencer posts a different order. Fine for everyday UX.
- Posted to Ethereum: ordering fixed unless Ethereum itself reorgs. Minutes.
- Ethereum finality: ~13 minutes after posting — irreversible, full Ethereum security. Use for high-value/irreversible actions.
- Withdrawal delay (7-day challenge period) is separate from finality — it applies to canonical-bridge exits only.`,
    sourceUrl: `${DOCS}/transaction-finality`,
  },
  {
    topic: 'differences-from-ethereum',
    title: 'Differences from Ethereum',
    summary: 'Arbitrum Nitro quirks: block.number is L1-ish, no prevrandao randomness, aliased L1 senders, 96KB contracts, FCFS ordering, sequencer-level screening.',
    details: `- block.number returns an ESTIMATE of the L1 block number, updated periodically — use ArbSys(0x...64).arbBlockNumber() for the real L2 block.
- block.prevrandao / block.difficulty are constant — never use for randomness (use Chainlink VRF). blockhash(n) only reliable for recent blocks. block.coinbase is the network fee account.
- Address aliasing: an L1 contract calling L2 appears as its aliased address (original + fixed offset) in msg.sender — account for this in access control.
- Contract size: 96 KB max code (vs 24 KB on Ethereum), 192 KB max init code.
- Ordering: first-come first-served by sequencer arrival — priority fees do NOT reorder queued transactions.
- Transaction screening: sequencer-level compliance filtering — transactions associated with sanctioned addresses are excluded from inclusion. Reads (eth_call, eth_getLogs, balances) are unaffected.
- Fees have an L1 data component; gasleft()/estimation behave accordingly (see gas-and-fees).`,
    sourceUrl: `${DOCS}/differences-from-ethereum`,
  },
  {
    topic: 'cross-chain-messaging',
    title: 'Cross-Chain Messaging',
    summary: 'Arbitrum-native L1<->L2 messaging: retryable tickets down (minutes), ArbSys up (7-day challenge), via @arbitrum/sdk.',
    details: `- L1 -> L2: retryable tickets through the Delayed Inbox (0x1A07cc4BD17E0118BdB54D70990D2158AbAD7a2D); completes in minutes; failed L2 legs redeemable within 7 days.
- L2 -> L1: ArbSys precompile (0x...64) sendTxToL1; execute on L1 via the Outbox after the 7-day challenge period.
- Use @arbitrum/sdk; register the chain first with registerCustomArbitrumNetwork({ chainId: 4663, parentChainId: 1, confirmPeriodBlocks: 45818, ethBridge: { bridge, inbox, sequencerInbox, outbox, rollup } }).
- Address aliasing applies to L1->L2 calls; the SDK has applyAlias/undoAlias helpers.`,
    sourceUrl: `${DOCS}/cross-chain-messaging`,
  },
  {
    topic: 'account-abstraction',
    title: 'Account Abstraction',
    summary: 'First-class ERC-4337 plus EIP-7702; Alchemy-powered with ZeroDev and Privy alternatives; standard entrypoints deployed.',
    details: `- Supports ERC-4337 and EIP-7702 (EOAs delegating to contract code — smart-account features without migrating address).
- Providers: Alchemy (@alchemy/wallet-apis, Gas Manager sponsorship policies, chain export robinhoodMainnet in @alchemy/common/chains) · ZeroDev (Kernel accounts, https://rpc.zerodev.app/api/v3/{PROJECT_ID}/chain/4663) · Privy (embedded wallets). viem/chains also exports robinhoodMainnet.
- Entrypoints: v0.6.0 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 · v0.7.0 0x0000000071727De22E5E9d8BAf0edAc6f37da032 · v0.8.0 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
- SenderCreators: v0.6 0x7fc98430eAEdbb6070B35B39D798725049088348 · v0.7 0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C · v0.8 0x449ED7C3e6Fee6a97311d4b55475DF59C44AdD33
- Safe: Module Setup v0.3.0 0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47 · Safe 4337 Module v0.3.0 0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226
- Blockscout shows UserOps at https://robinhoodchain.blockscout.com/op/{hash}.`,
    sourceUrl: `${DOCS}/account-abstraction`,
  },
  {
    topic: 'oracles-and-price-feeds',
    title: 'Oracles & Price Feeds',
    summary: 'Chainlink AggregatorV3Interface feeds for crypto and every Stock Token; multiplier-adjusted prices, 24/5 updates, sequencer-uptime and pause checks.',
    details: `- All feeds implement AggregatorV3Interface (latestRoundData() via the feed proxy). Most USD feeds use 8 decimals — always call decimals(), never hardcode.
- Stock Token feeds return the PER-TOKEN price = underlying share price x uiMultiplier — already multiplier-adjusted; do not apply the multiplier again. Because dividends reinvest via the multiplier, the token tracks total return and drifts above the headline share price over time.
- Presentation math: underlying share price = feedPrice x 1e18 / uiMultiplier() · share-equivalent units = balance x uiMultiplier() / 1e18.
- Stock feeds update 24/5, following market hours.
- Feed addresses: read from Chainlink's Robinhood page (source of truth): https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood — do not hardcode.
- L2 hygiene: check the Chainlink L2 Sequencer Uptime Feed (status 0 = up, honor a grace period) before trusting prices; check staleness (updatedAt vs heartbeat); reject zero/negative answers.
- Corporate actions pause the oracle: read oraclePaused() on the token; treat true as "price temporarily unavailable" — but the flag is advisory, keep the staleness check as the primary guard.`,
    sourceUrl: `${DOCS}/oracles-and-price-feeds`,
  },
  {
    topic: 'deploy-smart-contracts',
    title: 'Deploy a Contract',
    summary: 'Standard Foundry/Hardhat deployment; verify against Blockscout (chain 4663 mainnet / 46630 testnet).',
    details: `- Foundry: forge create --rpc-url https://rpc.mainnet.chain.robinhood.com --private-key $PRIVATE_KEY --broadcast; verify with forge verify-contract --chain-id 4663 --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/
- Hardhat: network { url, chainId: 4663, accounts }; etherscan customChains apiURL https://robinhoodchain.blockscout.com/api (apiKey can be "empty"); npx hardhat verify --network robinhood <address>.
- Testnet: chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com, verifier https://explorer.testnet.chain.robinhood.com/api/ — deploy to testnet first.
- Needs ETH on Robinhood Chain for gas. Never commit a real private key; prefer a throwaway deployer for testing.`,
    sourceUrl: `${DOCS}/deploy-smart-contracts`,
  },
  {
    topic: 'run-a-full-node',
    title: 'Run a full node',
    summary: 'Arbitrum Nitro node (docker offchainlabs/nitro-node) needing L1 execution + beacon endpoints, the Robinhood genesis JSON, and heavy hardware.',
    details: `- Hardware: 8+ modern cores, 64 GB RAM (128 recommended), local NVMe sized (2 x chain size) + 20%.
- Requires an Ethereum L1 execution RPC AND an L1 beacon endpoint (for blob reads); L1 must be fully synced. Docker required.
- Run: docker run offchainlabs/nitro-node:v3.11 --parent-chain.connection.url=<L1_RPC> --parent-chain.blob-client.beacon-url=<BEACON> --chain.id=4663 --init.genesis-json-file=robinhood-genesis.json --http.addr=0.0.0.0 --http.port=8547 --http.api=net,web3,eth (ports 8547 HTTP / 8548 WS).
- Genesis config: https://cdn.robinhood.com/assets/generated_assets/hoodchain_docsite/chain-node-configs/robinhood-genesis.json (testnet config alongside).
- Optional: sequencer feed --node.feed.input.url=wss://feed.mainnet.chain.robinhood.com (must be wss://) · snapshot sync --init.url=<SNAPSHOT_URL>.
- Runs ArbOS 61. Validators: BoLD dispute resolution, permissioned allowlist, 1 WETH bond — contact Robinhood.
- Check sync with eth_syncing (false = synced); "nonce has already been used" errors mean the node is still syncing.`,
    sourceUrl: `${DOCS}/run-a-full-node`,
  },
  {
    topic: 'notices-and-upgrades',
    title: 'Notices & Upgrades',
    summary: 'ArbOS upgrade notice board; un-upgraded nodes stop cleanly at the activation block and resume after updating.',
    details: `- Runs Arbitrum Nitro; ArbOS upgrades activate onchain at scheduled times. Node operators must run a compatible Nitro version beforehand; an un-upgraded node stops cleanly and resumes after updating, no data loss.
- Most upgrades need no dApp/user action, but some include EVM behavior changes — review each notice.
- Notice table was empty as of the 2026-07-10 sync; monitor ${DOCS}/notices-and-upgrades.`,
    sourceUrl: `${DOCS}/notices-and-upgrades`,
  },
]

export function getKnowledgeSection(topic: string): RhKnowledgeSection | undefined {
  return ROBINHOOD_CHAIN_KNOWLEDGE.find((s) => s.topic === topic)
}

export function searchKnowledge(query: string): RhKnowledgeSection[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return ROBINHOOD_CHAIN_KNOWLEDGE.filter((s) =>
    [s.topic, s.title, s.summary, s.details].some((text) => text.toLowerCase().includes(needle)),
  )
}
