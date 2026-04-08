import express, { type Request, type Response, type NextFunction } from 'express'
import { config } from './config.js'
import { getDb } from './lib/db.js'
import { subscribeRouter } from './routes/subscribe.js'
import { syncRouter } from './routes/sync.js'
import { arenaRouter } from './routes/arena.js'
import { proSkillsRouter } from './routes/proSkills.js'
import { priorityApiRouter } from './routes/priorityApi.js'
import { initializeSubscribePayments } from './lib/x402.js'

/**
 * Daemon Pro API — entry point.
 *
 * Wiring order matters:
 *   1. JSON body parser with a generous-but-finite limit
 *   2. CORS allowlist (tight in production, open in dev)
 *   3. /v1/health (unauth, for Railway/Fly health checks)
 *   4. /v1/subscribe (public — starts the 402 handshake)
 *   5. All other /v1 routes (gated by requireSubscription middleware)
 *   6. Catch-all 404
 *   7. Error handler
 */

export function createApp(): express.Express {
  const app = express()

  app.use(express.json({ limit: '256kb' }))

  // CORS — simple allowlist implementation, no extra dep needed
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    } else if (config.allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*')
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Payment, PAYMENT-SIGNATURE',
    )
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Expose-Headers',
      'WWW-Authenticate, PAYMENT-REQUIRED, PAYMENT-RESPONSE',
    )
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  // Eagerly initialize the DB (fails fast on schema issues)
  getDb()

  app.get('/v1/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: {
        service: 'daemon-pro-api',
        version: '0.1.0',
        network: config.network,
        priceUsdc: config.priceUsdc,
      },
    })
  })

  app.use('/v1/subscribe', subscribeRouter)
  app.use('/v1/sync', syncRouter)
  app.use('/v1/arena', arenaRouter)
  app.use('/v1/pro-skills', proSkillsRouter)
  app.use('/v1/priority', priorityApiRouter)

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'Not found' })
  })

  // Top-level error handler — makes sure nothing leaks stack traces
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[daemon-pro-api] unhandled error:', err.message, err.stack)
    res.status(500).json({ ok: false, error: 'Internal server error' })
  })

  return app
}
