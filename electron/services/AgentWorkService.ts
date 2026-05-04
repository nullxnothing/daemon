import crypto from 'node:crypto'
import simpleGit from 'simple-git'
import { PublicKey, type Keypair } from '@solana/web3.js'
import { getDb } from '../db/db'
import { loadKeypair } from './SolanaService'
import {
  agentWorkTaskIdToU64,
  getRegistryConnection,
  publishApproveWork,
  publishCreateTask,
  publishRejectWork,
  publishSettleTask,
  publishStartTaskSession,
  publishSubmitWorkReceipt,
} from './SessionRegistryService'
import type {
  Agent,
  AgentWorkCreateInput,
  AgentWorkSubmitInput,
  AgentWorkTask,
  Project,
  WalletListEntry,
} from '../shared/types'

const LAMPORTS_PER_SOL = 1_000_000_000
const DEFAULT_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000
const TASK_ESCROW_ACCOUNT_BYTES = 234

interface AgentWorkRow {
  id: string
  title: string
  prompt: string
  acceptance: string
  project_id: string | null
  project_name: string | null
  project_path: string | null
  wallet_id: string | null
  wallet_name: string | null
  wallet_address: string | null
  agent_id: string | null
  agent_name: string | null
  agent_wallet_id: string | null
  agent_wallet_address: string | null
  verifier_wallet: string | null
  repo_hash: string
  prompt_hash: string
  acceptance_hash: string
  bounty_lamports: number
  deadline_at: number | null
  onchain_task_id: string | null
  create_signature: string | null
  start_signature: string | null
  receipt_signature: string | null
  review_signature: string | null
  status: AgentWorkTask['status']
  session_id: string | null
  commit_hash: string | null
  diff_hash: string | null
  tests_hash: string | null
  artifact_uri: string | null
  submitted_at: number | null
  approved_at: number | null
  settled_signature: string | null
  created_at: number
  updated_at: number
}

interface WalletRow extends WalletListEntry {
  agent_id?: string | null
}

function hashHex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertPublicKey(value: string, label: string): void {
  try {
    new PublicKey(value)
  } catch {
    throw new Error(`${label} must be a valid Solana public key`)
  }
}

function getDefaultWallet(): WalletListEntry | null {
  const row = getDb().prepare(`
    SELECT id, name, address, is_default, wallet_type, created_at
    FROM wallets
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
  `).get() as WalletListEntry | undefined

  return row ?? null
}

function getWalletByAddress(address: string | null | undefined): WalletRow | null {
  if (!address) return null
  const row = getDb().prepare(`
    SELECT id, name, address, is_default, agent_id, wallet_type, created_at
    FROM wallets
    WHERE address = ?
  `).get(address) as WalletRow | undefined

  return row ?? null
}

function getProject(projectId: string | null | undefined): Project | null {
  if (!projectId) return null
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Project | undefined
  return row ?? null
}

function getWallet(walletId: string | null | undefined): WalletListEntry | null {
  if (!walletId) return null
  const row = getDb().prepare(`
    SELECT id, name, address, is_default, wallet_type, created_at
    FROM wallets
    WHERE id = ?
  `).get(walletId) as WalletListEntry | undefined

  return row ?? null
}

function getAgentWallet(agentId: string | null | undefined, agentWalletId: string | null | undefined): WalletRow | null {
  if (agentWalletId) {
    const row = getDb().prepare(`
      SELECT id, name, address, is_default, agent_id, wallet_type, created_at
      FROM wallets
      WHERE id = ?
    `).get(agentWalletId) as WalletRow | undefined
    if (!row) throw new Error('Agent wallet not found')
    return row
  }

  if (!agentId) return null
  const row = getDb().prepare(`
    SELECT id, name, address, is_default, agent_id, wallet_type, created_at
    FROM wallets
    WHERE wallet_type = 'agent' AND agent_id = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(agentId) as WalletRow | undefined

  return row ?? null
}

function getAgent(agentId: string | null | undefined): Agent | null {
  if (!agentId) return null
  const row = getDb().prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Agent | undefined
  return row ?? null
}

function getOnchainTaskId(task: AgentWorkTask): bigint {
  return task.onchain_task_id ? BigInt(task.onchain_task_id) : agentWorkTaskIdToU64(task.id)
}

async function withLoadedKeypair<T>(walletIds: Array<string | null | undefined>, fn: (keypair: Keypair, walletId: string) => Promise<T>): Promise<T> {
  let lastError: Error | null = null
  for (const walletId of walletIds) {
    if (!walletId) continue
    let keypair: Keypair | null = null
    try {
      keypair = loadKeypair(walletId)
      return await fn(keypair, walletId)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    } finally {
      keypair?.secretKey.fill(0)
    }
  }

  throw lastError ?? new Error('No signing wallet is available for this agent work task')
}

function rowToTask(row: AgentWorkRow): AgentWorkTask {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    acceptance: row.acceptance,
    project_id: row.project_id,
    project_name: row.project_name,
    project_path: row.project_path,
    wallet_id: row.wallet_id,
    wallet_name: row.wallet_name,
    wallet_address: row.wallet_address,
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    agent_wallet_id: row.agent_wallet_id,
    agent_wallet_address: row.agent_wallet_address,
    verifier_wallet: row.verifier_wallet,
    repo_hash: row.repo_hash,
    prompt_hash: row.prompt_hash,
    acceptance_hash: row.acceptance_hash,
    bounty_lamports: row.bounty_lamports,
    bounty_sol: row.bounty_lamports / LAMPORTS_PER_SOL,
    deadline_at: row.deadline_at,
    onchain_task_id: row.onchain_task_id,
    create_signature: row.create_signature,
    start_signature: row.start_signature,
    receipt_signature: row.receipt_signature,
    review_signature: row.review_signature,
    status: row.status,
    session_id: row.session_id,
    commit_hash: row.commit_hash,
    diff_hash: row.diff_hash,
    tests_hash: row.tests_hash,
    artifact_uri: row.artifact_uri,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    settled_signature: row.settled_signature,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function selectSql(): string {
  return `
    SELECT
      t.*,
      p.name AS project_name,
      p.path AS project_path,
      w.name AS wallet_name,
      w.address AS wallet_address,
      a.name AS agent_name
    FROM agent_work_tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN wallets w ON w.id = t.wallet_id
    LEFT JOIN agents a ON a.id = t.agent_id
  `
}

function getTaskOrThrow(taskId: string): AgentWorkTask {
  const row = getDb().prepare(`${selectSql()} WHERE t.id = ?`).get(taskId) as AgentWorkRow | undefined
  if (!row) throw new Error('Agent work task not found')
  return rowToTask(row)
}

export function listTasks(limit = 50): AgentWorkTask[] {
  const rows = getDb().prepare(`
    ${selectSql()}
    ORDER BY t.created_at DESC
    LIMIT ?
  `).all(limit) as AgentWorkRow[]

  return rows.map(rowToTask)
}

export function createTask(input: AgentWorkCreateInput): AgentWorkTask {
  const title = input.title.trim()
  const prompt = input.prompt.trim()
  const acceptance = input.acceptance.trim()

  if (!title) throw new Error('Task title is required')
  if (!prompt) throw new Error('Task prompt is required')
  if (!acceptance) throw new Error('Acceptance criteria are required')

  const project = getProject(input.projectId)
  if (input.projectId && !project) throw new Error('Project not found')

  const wallet = getWallet(input.walletId) ?? getDefaultWallet()
  if (!wallet) throw new Error('Create or select a wallet before funding agent work')

  const agent = getAgent(input.agentId)
  if (input.agentId && !agent) throw new Error('Agent not found')
  const agentWallet = getAgentWallet(agent?.id ?? input.agentId ?? null, input.agentWalletId)

  const bountySol = Number.isFinite(input.bountySol) ? Math.max(0, input.bountySol) : 0
  const bountyLamports = Math.round(bountySol * LAMPORTS_PER_SOL)
  const now = Date.now()
  const deadlineAt = input.deadlineAt ?? now + DEFAULT_DEADLINE_MS
  const verifierWallet = input.verifierWallet?.trim() || wallet.address
  assertPublicKey(verifierWallet, 'Verifier wallet')
  const repoMaterial = project
    ? `${project.id}:${project.path}:${project.git_remote ?? ''}`
    : `no-project:${title}`

  const id = crypto.randomUUID()
  const repoHash = hashHex(repoMaterial)
  const promptHash = hashHex(prompt)
  const acceptanceHash = hashHex(acceptance)
  const status: AgentWorkTask['status'] = 'draft'

  getDb().prepare(`
    INSERT INTO agent_work_tasks (
      id, title, prompt, acceptance, project_id, wallet_id, agent_id, agent_wallet_id, agent_wallet_address, verifier_wallet,
      repo_hash, prompt_hash, acceptance_hash, bounty_lamports, deadline_at, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    prompt,
    acceptance,
    project?.id ?? null,
    wallet.id,
    agent?.id ?? null,
    agentWallet?.id ?? null,
    agentWallet?.address ?? null,
    verifierWallet,
    repoHash,
    promptHash,
    acceptanceHash,
    bountyLamports,
    deadlineAt,
    status,
    now,
    now,
  )

  return getTaskOrThrow(id)
}

export async function fundTask(taskId: string): Promise<AgentWorkTask> {
  const task = getTaskOrThrow(taskId)
  if (task.status !== 'draft') throw new Error('Only draft tasks can be funded on-chain')
  if (task.create_signature) throw new Error('Task is already funded on-chain')
  if (!task.wallet_id || !task.wallet_address) throw new Error('Task needs a funding wallet')
  if (!task.agent_wallet_address) throw new Error('Task needs an agent wallet before on-chain funding')
  if (!task.deadline_at) throw new Error('Task needs a deadline before on-chain funding')
  if (task.bounty_lamports <= 0) throw new Error('On-chain agent work requires a bounty greater than zero')
  const deadlineAt = task.deadline_at

  assertPublicKey(task.wallet_address, 'Funding wallet')
  assertPublicKey(task.agent_wallet_address, 'Agent wallet')
  assertPublicKey(task.verifier_wallet ?? '', 'Verifier wallet')

  const onchainTaskId = getOnchainTaskId(task)
  const signature = await withLoadedKeypair([task.wallet_id], async (ownerKeypair) => {
    if (ownerKeypair.publicKey.toBase58() !== task.wallet_address) {
      throw new Error('Funding wallet keypair does not match the task owner address')
    }

    const connection = getRegistryConnection()
    const rentLamports = await connection.getMinimumBalanceForRentExemption(TASK_ESCROW_ACCOUNT_BYTES)
    const feeBufferLamports = 50_000
    const requiredLamports = task.bounty_lamports + rentLamports + feeBufferLamports
    const balance = await connection.getBalance(ownerKeypair.publicKey)
    if (balance < requiredLamports) {
      throw new Error(
        `Insufficient devnet SOL: have ${(balance / LAMPORTS_PER_SOL).toFixed(4)}, need ${(requiredLamports / LAMPORTS_PER_SOL).toFixed(4)} for bounty, rent, and fees`
      )
    }

    return publishCreateTask({
      walletKeypair: ownerKeypair,
      taskId: onchainTaskId,
      repoHash: task.repo_hash,
      promptHash: task.prompt_hash,
      acceptanceHash: task.acceptance_hash,
      bountyLamports: BigInt(task.bounty_lamports),
      deadlineAtMs: deadlineAt,
      verifier: task.verifier_wallet ?? task.wallet_address,
      agent: task.agent_wallet_address!,
    })
  })

  const now = Date.now()
  getDb().prepare(`
    UPDATE agent_work_tasks
    SET status = 'funded', onchain_task_id = ?, create_signature = ?, updated_at = ?
    WHERE id = ?
  `).run(onchainTaskId.toString(), signature, now, taskId)

  return getTaskOrThrow(taskId)
}

export async function startTask(taskId: string, sessionId: string | null): Promise<AgentWorkTask> {
  const task = getTaskOrThrow(taskId)
  if (task.status !== 'draft' && task.status !== 'funded') {
    throw new Error('Only draft or funded tasks can be started')
  }

  let startSignature = task.start_signature
  if (task.create_signature && !startSignature) {
    if (!task.wallet_address) throw new Error('Task owner wallet is missing')
    if (!task.agent_wallet_id || !task.agent_wallet_address) throw new Error('Task needs a signing agent wallet')

    startSignature = await withLoadedKeypair([task.agent_wallet_id], async (agentKeypair) => {
      if (agentKeypair.publicKey.toBase58() !== task.agent_wallet_address) {
        throw new Error('Agent wallet keypair does not match the task agent address')
      }

      return publishStartTaskSession({
        agentKeypair,
        owner: task.wallet_address!,
        taskId: getOnchainTaskId(task),
      })
    })
  }

  getDb().prepare(`
    UPDATE agent_work_tasks
    SET status = 'running', session_id = ?, start_signature = COALESCE(?, start_signature), updated_at = ?
    WHERE id = ?
  `).run(sessionId, startSignature ?? null, Date.now(), taskId)

  return getTaskOrThrow(taskId)
}

export async function submitReceipt(taskId: string, input: AgentWorkSubmitInput = {}): Promise<AgentWorkTask> {
  const task = getTaskOrThrow(taskId)
  if (task.status !== 'running') {
    throw new Error('Only running tasks can receive work receipts')
  }

  let head = ''
  let diff = ''
  let statusMaterial = ''

  if (task.project_path) {
    const git = simpleGit(task.project_path)
    try { head = (await git.revparse(['HEAD'])).trim() } catch {}
    try { diff = await git.diff(['HEAD']) } catch {
      try { diff = await git.diff() } catch {}
    }
    try {
      const status = await git.status()
      statusMaterial = JSON.stringify({
        current: status.current,
        files: status.files.map((file) => ({ path: file.path, index: file.index, workingDir: file.working_dir })),
      })
    } catch {}
  }

  const artifactUri = input.artifactUri?.trim() || `daemon://agent-work/${task.id}`
  const testsMaterial = `${task.acceptance}\n${input.testsOutput?.trim() ?? ''}`
  const commitHash = hashHex(head || `${task.id}:uncommitted`)
  const diffHash = hashHex(diff || statusMaterial || `${task.id}:no-diff`)
  const testsHash = hashHex(testsMaterial)
  const artifactHash = hashHex(artifactUri)
  let receiptSignature = task.receipt_signature

  if (task.create_signature && !receiptSignature) {
    if (!task.wallet_address) throw new Error('Task owner wallet is missing')
    if (!task.agent_wallet_id || !task.agent_wallet_address) throw new Error('Task needs a signing agent wallet')

    receiptSignature = await withLoadedKeypair([task.agent_wallet_id], async (agentKeypair) => {
      if (agentKeypair.publicKey.toBase58() !== task.agent_wallet_address) {
        throw new Error('Agent wallet keypair does not match the task agent address')
      }

      return publishSubmitWorkReceipt({
        agentKeypair,
        owner: task.wallet_address!,
        taskId: getOnchainTaskId(task),
        commitHash,
        diffHash,
        testsHash,
        artifactHash,
      })
    })
  }

  const now = Date.now()

  getDb().prepare(`
    UPDATE agent_work_tasks
    SET
      status = 'submitted',
      commit_hash = ?,
      diff_hash = ?,
      tests_hash = ?,
      artifact_uri = ?,
      receipt_signature = COALESCE(?, receipt_signature),
      submitted_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    commitHash,
    diffHash,
    testsHash,
    artifactUri,
    receiptSignature ?? null,
    now,
    now,
    taskId,
  )

  return getTaskOrThrow(taskId)
}

async function reviewTask(taskId: string, verdict: 'approved' | 'rejected'): Promise<AgentWorkTask> {
  const task = getTaskOrThrow(taskId)
  if (task.status !== 'submitted') throw new Error('Only submitted work can be reviewed')

  let reviewSignature = task.review_signature
  if (task.create_signature && !reviewSignature) {
    if (!task.wallet_address) throw new Error('Task owner wallet is missing')
    const verifierWallet = getWalletByAddress(task.verifier_wallet)

    reviewSignature = await withLoadedKeypair([verifierWallet?.id, task.wallet_id], async (verifierKeypair) => {
      const publish = verdict === 'approved' ? publishApproveWork : publishRejectWork
      return publish({
        verifierKeypair,
        owner: task.wallet_address!,
        taskId: getOnchainTaskId(task),
      })
    })
  }

  const now = Date.now()

  getDb().prepare(`
    UPDATE agent_work_tasks
    SET status = ?, approved_at = ?, review_signature = COALESCE(?, review_signature), updated_at = ?
    WHERE id = ?
  `).run(verdict, verdict === 'approved' ? now : null, reviewSignature ?? null, now, taskId)

  return getTaskOrThrow(taskId)
}

export function approveTask(taskId: string): Promise<AgentWorkTask> {
  return reviewTask(taskId, 'approved')
}

export function rejectTask(taskId: string): Promise<AgentWorkTask> {
  return reviewTask(taskId, 'rejected')
}

export async function settleTask(taskId: string, signature?: string | null): Promise<AgentWorkTask> {
  const task = getTaskOrThrow(taskId)
  if (task.status !== 'approved' && task.status !== 'rejected') {
    throw new Error('Only approved or rejected work can be settled')
  }

  const now = Date.now()
  let settlementProof = signature?.trim() || ''

  if (!settlementProof && task.create_signature) {
    if (!task.wallet_address || !task.wallet_id) throw new Error('Task owner wallet is missing')
    if (!task.agent_wallet_address) throw new Error('Task agent wallet is missing')

    settlementProof = await withLoadedKeypair([task.wallet_id], async (authorityKeypair) => {
      return publishSettleTask({
        authorityKeypair,
        owner: task.wallet_address!,
        agent: task.agent_wallet_address!,
        taskId: getOnchainTaskId(task),
      })
    })
  }

  if (!settlementProof) {
    settlementProof = `local:${hashHex(`${taskId}:${now}`).slice(0, 32)}`
  }

  getDb().prepare(`
    UPDATE agent_work_tasks
    SET status = 'settled', settled_signature = ?, updated_at = ?
    WHERE id = ?
  `).run(settlementProof, now, taskId)

  return getTaskOrThrow(taskId)
}
