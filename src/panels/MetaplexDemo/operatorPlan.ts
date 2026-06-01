export type MetaplexLaunchType = 'bonding-curve' | 'launchpool' | 'presale' | 'auction'
export type MetaplexOperatorNetwork = 'devnet' | 'mainnet-beta'
export type DasInspectorMethod = 'getAsset' | 'getAssetsByOwner' | 'getAssetsByGroup' | 'searchAssets'

export interface AgentTokenOperatorDraft {
  agentName: string
  agentSymbol: string
  agentDescription: string
  assetUri: string
  launchType: MetaplexLaunchType
  network: MetaplexOperatorNetwork
  rpcUrl: string
  creatorFeeBps: number
  creatorFeeRecipient: string
  firstBuySol: string
}

export interface AgentTokenOperatorStage {
  id: string
  title: string
  metaplexFocus: 'Agent Registry' | 'Genesis' | 'Core' | 'DAS' | 'Wallet Boundary'
  userDecision: string
  daemonCheck: string
  proofRequired: string
  docsUrl: string
}

export interface AgentTokenOperatorPlan {
  id: string
  generatedAt: string
  status: 'preview-only'
  safetyBoundary: string
  draft: AgentTokenOperatorDraft
  warnings: string[]
  derivedAccounts: Array<{ label: string; value: string; source: string }>
  stages: AgentTokenOperatorStage[]
  walletApprovalGate: {
    requiredBefore: string[]
    irreversibleWarnings: string[]
  }
  proofRecordSchema: string[]
}

export interface MetaplexOperatorReceipt {
  id: string
  createdAt: string
  status: 'previewed' | 'blocked-before-signing' | 'ready-for-devnet-wallet'
  planId: string
  action: string
  network: MetaplexOperatorNetwork
  docs: string[]
  signatures: string[]
  postWriteReads: string[]
  notes: string[]
}

export interface DasInspectorInput {
  method: DasInspectorMethod
  rpcUrl: string
  assetId: string
  owner: string
  collection: string
}

export interface DasInspectorRequest {
  jsonrpc: '2.0'
  id: string
  method: DasInspectorMethod
  params: unknown
}

export const DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT: AgentTokenOperatorDraft = {
  agentName: 'DAEMON Operator Agent',
  agentSymbol: 'DOP',
  agentDescription: 'A devnet agent identity and token launch preview for the DAEMON x Metaplex operator workbench.',
  assetUri: 'https://example.com/daemon-agent-metadata.json',
  launchType: 'bonding-curve',
  network: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  creatorFeeBps: 100,
  creatorFeeRecipient: '[agent Core Asset Signer PDA or creator wallet]',
  firstBuySol: '0.1',
}

export const DEFAULT_DAS_INSPECTOR_INPUT: DasInspectorInput = {
  method: 'getAsset',
  rpcUrl: 'https://api.devnet.solana.com',
  assetId: '',
  owner: '',
  collection: '',
}

const SAFETY_BOUNDARY = 'Devnet Core asset creation is live only after signer selection and typed confirmation. Agent Registry registration, Genesis launch creation, set-token, creator-fee claims, and mainnet execution remain blocked.'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'metaplex-agent'
}

function normalizeSymbol(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'AGENT'
}

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

export function buildAgentTokenOperatorPlan(input: AgentTokenOperatorDraft, generatedAt = new Date().toISOString()): AgentTokenOperatorPlan {
  const draft: AgentTokenOperatorDraft = {
    ...input,
    agentName: input.agentName.trim() || DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT.agentName,
    agentSymbol: normalizeSymbol(input.agentSymbol),
    agentDescription: input.agentDescription.trim() || DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT.agentDescription,
    assetUri: input.assetUri.trim() || DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT.assetUri,
    creatorFeeBps: Number.isFinite(input.creatorFeeBps) ? Math.max(0, Math.min(1000, Math.round(input.creatorFeeBps))) : 0,
    creatorFeeRecipient: input.creatorFeeRecipient.trim() || DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT.creatorFeeRecipient,
    firstBuySol: input.firstBuySol.trim() || '0',
    rpcUrl: input.rpcUrl.trim() || DEFAULT_AGENT_TOKEN_OPERATOR_DRAFT.rpcUrl,
  }
  const warnings = [
    'Agent token linking is treated as irreversible and must stay behind an explicit wallet approval screen.',
    'Mainnet execution is blocked in this slice. Use devnet until Metaplex has reviewed the flow.',
    'Creator-fee claims are separate receipt events, not implied per swap.',
  ]
  if (!isLikelySolanaAddress(draft.creatorFeeRecipient)) {
    warnings.push('Creator fee recipient is a placeholder; replace it with an agent PDA or creator wallet before signing.')
  }
  if (!/^https?:\/\//.test(draft.assetUri)) {
    warnings.push('Agent asset URI must be a public HTTP(S) metadata URL before a live write can run.')
  }
  if (draft.network !== 'devnet') {
    warnings.push('Mainnet selected in draft, but execution remains disabled until the wallet gate and receipts are complete.')
  }

  return {
    id: `metaplex-agent-token-${slugify(draft.agentName)}-${generatedAt.slice(0, 10)}`,
    generatedAt,
    status: 'preview-only',
    safetyBoundary: SAFETY_BOUNDARY,
    draft,
    warnings,
    derivedAccounts: [
      {
        label: 'Core Agent Asset',
        value: 'Generated signer at execution time',
        source: 'Metaplex Core create asset',
      },
      {
        label: 'Agent Identity PDA',
        value: 'Derived from Core asset through Agent Registry',
        source: 'Metaplex Agent Registry',
      },
      {
        label: 'Asset Signer PDA',
        value: draft.creatorFeeRecipient.includes('PDA') ? draft.creatorFeeRecipient : 'Derived if creator fees route to agent asset signer',
        source: 'Agentic Commerce / Genesis',
      },
      {
        label: 'Token Mint',
        value: 'Generated only after Genesis wallet approval',
        source: 'Metaplex Genesis',
      },
    ],
    stages: [
      {
        id: 'agent-core-asset',
        title: 'Create agent Core asset preview',
        metaplexFocus: 'Core',
        userDecision: `Confirm agent name, symbol, metadata URI (${draft.assetUri}), and authority.`,
        daemonCheck: 'Validate metadata shape and show the Core asset signer boundary.',
        proofRequired: 'Core asset public key, metadata URI, transaction preview, signature, and post-write getAsset read.',
        docsUrl: 'https://www.metaplex.com/docs/smart-contracts/core',
      },
      {
        id: 'agent-registry',
        title: 'Register Agent Identity',
        metaplexFocus: 'Agent Registry',
        userDecision: 'Approve executive profile, agent wallet, and delegation scope.',
        daemonCheck: 'Derive the Agent Identity PDA and warn before delegation is attached.',
        proofRequired: 'Agent Identity PDA, executive delegate, signature, confirmation, and account read.',
        docsUrl: 'https://www.metaplex.com/docs/agents',
      },
      {
        id: 'genesis-launch-config',
        title: 'Build Genesis launch config',
        metaplexFocus: 'Genesis',
        userDecision: `Choose ${draft.launchType}, first buy, creator fees, and Raydium graduation assumptions.`,
        daemonCheck: 'Separate launchpool, presale, auction, and bonding-curve states before wallet approval.',
        proofRequired: 'Launch config, token image, creator-fee wallet, launch page, and transaction preview.',
        docsUrl: 'https://www.metaplex.com/docs/smart-contracts/genesis',
      },
      {
        id: 'set-token-warning',
        title: 'Set token boundary',
        metaplexFocus: 'Wallet Boundary',
        userDecision: 'Read and confirm that each agent can permanently link only one token.',
        daemonCheck: 'Block the set-token transaction until the user confirms the irreversible warning.',
        proofRequired: 'Confirmation text, wallet approval record, token mint, and agent-token account read.',
        docsUrl: 'https://www.metaplex.com/docs/agents/create-agent-token',
      },
      {
        id: 'post-write-das',
        title: 'Verify with DAS',
        metaplexFocus: 'DAS',
        userDecision: 'Review the post-write state before DAEMON marks the flow complete.',
        daemonCheck: 'Run getAsset/searchAssets reads and compare before/after state.',
        proofRequired: 'DAS response, explorer link, signature, slot, and receipt file path.',
        docsUrl: 'https://www.metaplex.com/docs/dev-tools/das-api',
      },
    ],
    walletApprovalGate: {
      requiredBefore: ['create Core asset', 'register agent identity', 'create Genesis launch', 'set token', 'claim creator fees'],
      irreversibleWarnings: [
        'Agent token binding is permanent for the agent.',
        'Creator-fee recipient mistakes route revenue to the wrong wallet/PDA.',
        'Mainnet launches can create public markets and cannot be treated as a preview.',
      ],
    },
    proofRecordSchema: [
      'action',
      'network',
      'docsUrl',
      'request',
      'transactionPreview',
      'walletApproval',
      'signature',
      'confirmation',
      'postWriteReads',
      'explorerLinks',
      'notes',
    ],
  }
}

export function buildOperatorReceipt(plan: AgentTokenOperatorPlan, createdAt = new Date().toISOString()): MetaplexOperatorReceipt {
  return {
    id: `${plan.id}-receipt-${createdAt.replace(/[:.]/g, '-')}`,
    createdAt,
    status: 'previewed',
    planId: plan.id,
    action: 'agent-token-operator-preview',
    network: plan.draft.network,
    docs: Array.from(new Set(plan.stages.map((stage) => stage.docsUrl))),
    signatures: [],
    postWriteReads: [],
    notes: [
      'Stored by DAEMON before signing.',
      'This receipt proves the plan was reviewed; it is not an execution receipt.',
      plan.safetyBoundary,
    ],
  }
}

export function buildDasInspectorRequest(input: DasInspectorInput): DasInspectorRequest | null {
  if (input.method === 'getAsset') {
    if (!input.assetId.trim()) return null
    return {
      jsonrpc: '2.0',
      id: 'daemon-metaplex-getAsset',
      method: 'getAsset',
      params: { id: input.assetId.trim() },
    }
  }
  if (input.method === 'getAssetsByOwner') {
    if (!input.owner.trim()) return null
    return {
      jsonrpc: '2.0',
      id: 'daemon-metaplex-getAssetsByOwner',
      method: 'getAssetsByOwner',
      params: { ownerAddress: input.owner.trim(), page: 1, limit: 10 },
    }
  }
  if (input.method === 'getAssetsByGroup') {
    if (!input.collection.trim()) return null
    return {
      jsonrpc: '2.0',
      id: 'daemon-metaplex-getAssetsByGroup',
      method: 'getAssetsByGroup',
      params: { groupKey: 'collection', groupValue: input.collection.trim(), page: 1, limit: 10 },
    }
  }
  if (!input.owner.trim() && !input.collection.trim()) return null
  return {
    jsonrpc: '2.0',
    id: 'daemon-metaplex-searchAssets',
    method: 'searchAssets',
    params: {
      ownerAddress: input.owner.trim() || undefined,
      grouping: input.collection.trim() ? ['collection', input.collection.trim()] : undefined,
      page: 1,
      limit: 10,
    },
  }
}
