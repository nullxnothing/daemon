import { Router, type Request, type Response } from 'express'
import { requireSubscription } from '../middleware/requireSubscription.js'
import { getMcpSync, putMcpSync } from '../lib/db.js'
import type { McpSyncPayload } from '../types.js'

/**
 * Phase 2: hosted MCP config sync.
 *
 * GET  /v1/sync/mcp  → returns the wallet's most-recent stored MCP config (or null)
 * POST /v1/sync/mcp  → stores a new MCP config for the wallet (last-write-wins)
 *
 * Both endpoints require an active Pro subscription with the 'mcp-sync' feature.
 * The payload is the same McpSyncPayload shape the client stores locally, so
 * the round-trip is a straight serialization — no schema translation.
 *
 * Design choice: last-write-wins rather than CRDT. This is a dev-tool MCP config,
 * not a collaborative document. Conflict resolution is "whichever machine wrote
 * most recently wins," and the client keeps a local backup of the previous
 * config in case the user wants to revert.
 */

export const syncRouter = Router()

syncRouter.get('/mcp', requireSubscription(['mcp-sync']), (req: Request, res: Response) => {
  const wallet = req.subscription!.sub
  const payload = getMcpSync(wallet)
  res.json({ ok: true, data: payload })
})

syncRouter.post('/mcp', requireSubscription(['mcp-sync']), (req: Request, res: Response) => {
  const wallet = req.subscription!.sub
  const body = req.body as Partial<McpSyncPayload> | undefined

  if (!body || typeof body !== 'object') {
    res.status(400).json({ ok: false, error: 'Invalid body' })
    return
  }
  if (body.version !== 1) {
    res.status(400).json({ ok: false, error: 'Unsupported McpSyncPayload version' })
    return
  }
  if (!body.mcpServers || typeof body.mcpServers !== 'object') {
    res.status(400).json({ ok: false, error: 'mcpServers must be an object' })
    return
  }

  // Cap the payload size to prevent abuse — MCP configs are small by nature
  // and should never be more than a few KB.
  const serialized = JSON.stringify(body)
  if (serialized.length > 64 * 1024) {
    res.status(413).json({ ok: false, error: 'McpSyncPayload exceeds 64KB limit' })
    return
  }

  const normalized: McpSyncPayload = {
    version: 1,
    updatedAt: Date.now(),
    mcpServers: body.mcpServers,
  }
  putMcpSync(wallet, normalized)
  res.json({ ok: true, data: { updatedAt: normalized.updatedAt } })
})
