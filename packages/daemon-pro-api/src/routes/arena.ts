import { Router, type Request, type Response } from 'express'
import crypto from 'node:crypto'
import { requireSubscription } from '../middleware/requireSubscription.js'
import {
  listArenaSubmissions,
  insertArenaSubmission,
  voteForArenaSubmission,
  type ArenaSubmissionRow,
} from '../lib/db.js'
import type { ArenaSubmission, ArenaSubmissionInput } from '../types.js'

/**
 * Phase 3: Arena viewer + submission.
 *
 * The Arena is the curated community-submission pipeline. Free users see
 * nothing (the Pro panel shows an upgrade prompt); Pro subscribers see all
 * submissions, can submit their own, and can vote on others.
 *
 * Submissions currently store only the minimum viable metadata: title,
 * description, category, github URL, submitting wallet. Curation status
 * ('submitted' | 'featured' | 'winner' | 'shipped') is advanced manually by
 * the team (no self-promotion). Votes are advisory — they surface community
 * signal but don't automatically promote a submission.
 *
 * Votes are one-per-wallet-per-submission, enforced by the arena_votes table's
 * composite primary key.
 */

export const arenaRouter = Router()

/**
 * GET /v1/arena/public
 *
 * Public read-only endpoint consumed by the marketing website
 * (daemon-landing.vercel.app). Returns a trimmed subset of arena submissions
 * so the website can render a "live arena" section without requiring auth or
 * leaking private metadata.
 *
 * We expose only the fields meant for public consumption:
 *   id, title, category, status, votes, submittedAt, author.handle (truncated),
 *   githubUrl (if present)
 *
 * We deliberately OMIT:
 *   full wallet address, description (HTML injection risk on website without sanitization),
 *   themeWeek notes
 *
 * Cache-Control: public, max-age=60 so the website can CDN-cache aggressively.
 * Anyone bursting requests will hit their own CDN, not our server.
 */
arenaRouter.get('/public', (_req: Request, res: Response) => {
  const rows = listArenaSubmissions(20)
  const publicData = rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    votes: row.votes,
    submittedAt: row.submitted_at,
    author: {
      handle: row.wallet.slice(0, 6) + '…' + row.wallet.slice(-4),
    },
    githubUrl: row.github_url ?? null,
  }))
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.json({ ok: true, data: publicData })
})

function rowToSubmission(row: ArenaSubmissionRow): ArenaSubmission {
  return {
    id: row.id,
    title: row.title,
    author: {
      handle: row.wallet.slice(0, 6) + '…' + row.wallet.slice(-4),
      wallet: row.wallet,
    },
    description: row.description,
    category: row.category as ArenaSubmission['category'],
    themeWeek: row.theme_week,
    submittedAt: row.submitted_at,
    status: row.status as ArenaSubmission['status'],
    votes: row.votes,
    githubUrl: row.github_url ?? undefined,
  }
}

const VALID_CATEGORIES = new Set(['tool', 'agent', 'skill', 'mcp', 'grind-recipe'])
const MAX_TITLE_LEN = 100
const MAX_DESCRIPTION_LEN = 2000
const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/.*)?$/

arenaRouter.get('/submissions', requireSubscription(['arena']), (_req: Request, res: Response) => {
  const rows = listArenaSubmissions(50)
  res.json({ ok: true, data: rows.map(rowToSubmission) })
})

arenaRouter.post('/submit', requireSubscription(['arena']), (req: Request, res: Response) => {
  const wallet = req.subscription!.sub
  const body = req.body as Partial<ArenaSubmissionInput> | undefined

  if (!body || typeof body !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid body' })
    return
  }

  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  const category = String(body.category ?? '').trim()
  const githubUrl = String(body.githubUrl ?? '').trim()

  if (!title || title.length > MAX_TITLE_LEN) {
    res.status(400).json({ ok: false, error: `title required (≤${MAX_TITLE_LEN} chars)` })
    return
  }
  if (!description || description.length > MAX_DESCRIPTION_LEN) {
    res.status(400).json({ ok: false, error: `description required (≤${MAX_DESCRIPTION_LEN} chars)` })
    return
  }
  if (!VALID_CATEGORIES.has(category)) {
    res.status(400).json({ ok: false, error: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}` })
    return
  }
  if (!GITHUB_URL_RE.test(githubUrl)) {
    res.status(400).json({ ok: false, error: 'githubUrl must be a valid https://github.com/… URL' })
    return
  }

  const id = crypto.randomUUID()
  insertArenaSubmission({
    id,
    wallet,
    title,
    description,
    category,
    theme_week: null,
    github_url: githubUrl,
    submitted_at: Date.now(),
  })

  res.status(201).json({ ok: true, data: { id } })
})

arenaRouter.post('/vote/:submissionId', requireSubscription(['arena']), (req: Request, res: Response) => {
  const wallet = req.subscription!.sub
  const submissionId = req.params.submissionId
  if (!submissionId) {
    res.status(400).json({ ok: false, error: 'submissionId required' })
    return
  }

  const ok = voteForArenaSubmission(wallet, submissionId)
  if (!ok) {
    res.status(409).json({ ok: false, error: 'Already voted on this submission' })
    return
  }
  res.json({ ok: true, data: { voted: true } })
})
