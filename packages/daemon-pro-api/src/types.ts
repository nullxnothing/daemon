/**
 * Shared types between the Daemon Pro API and the open DAEMON client.
 *
 * These shapes form the contract between the two. Keep them stable — any
 * breaking change here requires a version bump of the /v1 route prefix and
 * a corresponding update on the client side.
 *
 * The client imports these definitions from @daemon/shared so both halves
 * agree on the wire format. This file is the source of truth.
 */

export type ProFeature =
  | 'arena'          // Arena access (submit + view curated submissions)
  | 'pro-skills'     // Pro tool pack downloads
  | 'mcp-sync'       // Hosted MCP config sync across machines
  | 'priority-api'   // Priority / quota-free access to paid AI endpoints

export interface SubscriptionJwtPayload {
  /** Wallet address of the subscriber */
  sub: string
  /** Issued-at, seconds since epoch */
  iat: number
  /** Expiry, seconds since epoch */
  exp: number
  /** Monthly call quota for priority-api endpoints */
  quota: number
  /** Features unlocked by this subscription */
  features: ProFeature[]
  /** Subscription tier ('pro' for MVP — room to add 'team', 'enterprise' later) */
  tier: 'pro'
}

/** 402 Payment Required response body shape (compatible with x402 protocol) */
export interface PaymentRequiredBody {
  x402Version: 1
  accepts: Array<{
    scheme: 'exact'
    network: string
    maxAmountRequired: string
    resource: string
    description: string
    mimeType: 'application/json'
    payTo: string
    maxTimeoutSeconds: number
    asset: 'USDC'
    extra?: Record<string, unknown>
  }>
  error?: string
}

export interface SubscribeSuccessBody {
  ok: true
  jwt: string
  expiresAt: number // ms since epoch
  features: ProFeature[]
  tier: 'pro'
}

export interface StatusResponseBody {
  active: boolean
  expiresAt: number | null
  features: ProFeature[]
  quotaRemaining: number | null
  tier: 'pro' | null
}

/** Arena submission — what the server sends to the client */
export interface ArenaSubmission {
  id: string
  title: string
  author: {
    handle: string
    wallet: string
  }
  description: string
  category: 'tool' | 'agent' | 'skill' | 'mcp' | 'grind-recipe'
  themeWeek: string | null
  submittedAt: number
  status: 'submitted' | 'featured' | 'winner' | 'shipped'
  votes: number
  githubUrl?: string
  previewImage?: string
}

/** Arena submission payload — what the client sends when submitting */
export interface ArenaSubmissionInput {
  title: string
  description: string
  category: ArenaSubmission['category']
  githubUrl: string
}

/** MCP sync payload — mirrors the client's local MCP config shape */
export interface McpSyncPayload {
  version: 1
  updatedAt: number
  mcpServers: Record<string, {
    command: string
    args: string[]
    env?: Record<string, string>
  }>
}

/** Pro skill pack manifest entry */
export interface ProSkillManifestEntry {
  id: string
  name: string
  version: string
  description: string
  downloadUrl: string
  sha256: string
  size: number
  updatedAt: number
}

export interface ProSkillManifest {
  version: 1
  skills: ProSkillManifestEntry[]
}
