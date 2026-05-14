import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import express from 'express'
import { createProductionDaemonAICloudGateway, getDaemonAICloudRuntimeReadiness } from './productionGateway'
import { createDaemonSubscriptionGateway } from './SubscriptionGateway'
import type { DaemonAICloudRuntimeReadiness } from './productionGateway'

export interface DaemonAICloudServerConfig {
  host: string
  port: number
  dbPath: string
  failOnMissingEnv: boolean
  readiness: DaemonAICloudRuntimeReadiness
}

export interface DaemonAICloudServerHandle {
  app: express.Express
  server: http.Server
  db: Database.Database
  config: DaemonAICloudServerConfig
  close(): Promise<void>
}

function parsePort(input: string | undefined, fallback: number): number {
  if (!input?.trim()) return fallback
  const port = Number(input)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid DAEMON AI Cloud port: ${input}`)
  }
  return port
}

function defaultDbPath(env: NodeJS.ProcessEnv): string {
  return env.DAEMON_AI_CLOUD_DB_PATH
    ?? env.DATABASE_PATH
    ?? path.join(process.cwd(), 'data', 'daemon-ai-cloud.db')
}

export function resolveDaemonAICloudServerConfig(env: NodeJS.ProcessEnv = process.env): DaemonAICloudServerConfig {
  return {
    host: env.DAEMON_AI_CLOUD_HOST?.trim() || '0.0.0.0',
    port: parsePort(env.PORT ?? env.DAEMON_AI_CLOUD_PORT, 4021),
    dbPath: defaultDbPath(env),
    failOnMissingEnv: env.DAEMON_AI_CLOUD_ALLOW_UNREADY !== '1',
    readiness: getDaemonAICloudRuntimeReadiness(env),
  }
}

export function createDaemonAICloudServerApp(db: Database.Database, env: NodeJS.ProcessEnv = process.env): express.Express {
  const app = express()
  app.get('/health/ready', (_req, res) => {
    const readiness = getDaemonAICloudRuntimeReadiness(env)
    res.status(readiness.ready ? 200 : 503).json({
      ok: readiness.ready,
      service: 'daemon-ai-cloud',
      ...readiness,
    })
  })
  app.use(createDaemonSubscriptionGateway({
    db,
    env,
    jwtSecret: env.DAEMON_PRO_JWT_SECRET?.trim() || env.DAEMON_AI_JWT_SECRET?.trim() || '',
  }))
  app.use(createProductionDaemonAICloudGateway(db, env))
  return app
}

export async function startDaemonAICloudServer(env: NodeJS.ProcessEnv = process.env): Promise<DaemonAICloudServerHandle> {
  const config = resolveDaemonAICloudServerConfig(env)
  if (!config.readiness.ready && config.failOnMissingEnv) {
    throw new Error(`DAEMON AI Cloud is not ready. Missing: ${config.readiness.missing.join(', ')}`)
  }

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
  const db = new Database(config.dbPath)
  const app = createDaemonAICloudServerApp(db, env)

  const server = await new Promise<http.Server>((resolve, reject) => {
    const nextServer = app.listen(config.port, config.host, () => resolve(nextServer))
    nextServer.once('error', reject)
  })

  return {
    app,
    server,
    db,
    config,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
      db.close()
    },
  }
}

function isDirectRun(): boolean {
  return process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
}

if (isDirectRun()) {
  startDaemonAICloudServer()
    .then(({ config }) => {
      console.log(`[daemon-ai-cloud] listening on http://${config.host}:${config.port}`)
      console.log(`[daemon-ai-cloud] providers=${config.readiness.providers.join(',') || 'none'} db=${config.dbPath}`)
    })
    .catch((error) => {
      console.error('[daemon-ai-cloud] failed to start:', error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
