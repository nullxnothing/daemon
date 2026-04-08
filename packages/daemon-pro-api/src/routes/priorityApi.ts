import { Router, type Request, type Response } from 'express'
import { requireSubscription } from '../middleware/requireSubscription.js'
import { incrementPriorityApiUsage, getPriorityApiUsage } from '../lib/db.js'

/**
 * Priority AI endpoints — stub handlers for the paid AI features discussed in
 * the #2 monetization plan. Each endpoint:
 *
 *   1. Is gated by requireSubscription(['priority-api'])
 *   2. Checks the current month's call count against the JWT's quota
 *   3. Increments the count on success
 *   4. Returns a payload (currently stubbed — real AI calls land in a follow-up)
 *
 * The quota lives server-side (per-wallet, per-month) rather than in the JWT
 * because it changes per-request. The JWT only carries the ceiling; the count
 * is authoritative in the DB.
 *
 * GET  /v1/priority/quota     → current month's usage + remaining
 * POST /v1/priority/explain-tx → stub: explain a Solana signature
 * POST /v1/priority/audit-idl  → stub: audit an Anchor IDL
 */

export const priorityApiRouter = Router()

priorityApiRouter.get('/quota', requireSubscription(['priority-api']), (req: Request, res: Response) => {
  const wallet = req.subscription!.sub
  const quota = req.subscription!.quota
  const used = getPriorityApiUsage(wallet)
  res.json({
    ok: true,
    data: {
      quota,
      used,
      remaining: Math.max(0, quota - used),
    },
  })
})

function checkAndIncrement(req: Request, res: Response): boolean {
  const wallet = req.subscription!.sub
  const quota = req.subscription!.quota
  const used = getPriorityApiUsage(wallet)
  if (used >= quota) {
    res.status(429).json({
      ok: false,
      error: `Monthly quota exceeded (${used}/${quota}). Quota resets at month boundary.`,
    })
    return false
  }
  incrementPriorityApiUsage(wallet)
  return true
}

priorityApiRouter.post('/explain-tx', requireSubscription(['priority-api']), (req: Request, res: Response) => {
  if (!checkAndIncrement(req, res)) return

  const body = req.body as { signature?: string } | undefined
  const signature = String(body?.signature ?? '').trim()
  if (!signature) {
    res.status(400).json({ ok: false, error: 'signature required' })
    return
  }

  // TODO [production]: wire this to the real parsing pipeline by importing the
  // logic from electron/services/TradeParser.ts into this package (shared workspace)
  // and fetching the tx via Helius before handing off to a summarizer.
  res.json({
    ok: true,
    data: {
      signature,
      summary: `Stub explanation for ${signature} — real parser integration pending.`,
      kind: 'stub',
    },
  })
})

priorityApiRouter.post('/audit-idl', requireSubscription(['priority-api']), (req: Request, res: Response) => {
  if (!checkAndIncrement(req, res)) return

  const body = req.body as { idl?: unknown } | undefined
  if (!body || !body.idl) {
    res.status(400).json({ ok: false, error: 'idl required' })
    return
  }

  res.json({
    ok: true,
    data: {
      findings: [],
      summary: 'Stub audit — real Anchor IDL static checks land in a follow-up.',
      kind: 'stub',
    },
  })
})
