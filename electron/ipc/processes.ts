import { ipcMain } from 'electron'
import { exec, execFile } from 'node:child_process'
import pidusage from 'pidusage'
import { getDb } from '../db/db'
import { getAllSessionIds, getSession } from './terminal'
import type { ProcessInfo, OrphanProcess } from '../shared/types'

export function registerProcessHandlers() {
  // List all DAEMON-managed sessions with resource stats
  ipcMain.handle('process:list', async () => {
    try {
      const db = getDb()
      const sessionIds = getAllSessionIds()
      const results: ProcessInfo[] = []

      const sessions: Array<{ id: string; pid: number; agentId: string | null }> = []

      for (const id of sessionIds) {
        const session = getSession(id)
        if (!session) continue
        sessions.push({ id, pid: session.pty.pid, agentId: session.agentId })
      }

      if (sessions.length === 0) return { ok: true, data: [] }

      // Single JOIN query instead of N+1 per-session lookups
      const placeholders = sessions.map(() => '?').join(',')
      const dbRows = db.prepare(`
        SELECT s.*, a.name as agent_name, a.model, p.name as project_name, p.path as project_path
        FROM active_sessions s
        LEFT JOIN agents a ON s.agent_id = a.id
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.id IN (${placeholders})
      `).all(...sessions.map((s) => s.id)) as Array<{
        id: string
        project_id: string | null
        agent_id: string | null
        started_at: number
        agent_name: string | null
        model: string | null
        project_name: string | null
        project_path: string | null
      }>

      const dbRowMap = new Map<string, (typeof dbRows)[number]>()
      for (const row of dbRows) dbRowMap.set(row.id, row)

      // Batch pidusage calls in parallel
      const pids = sessions.map((s) => s.pid)
      const statsResults = await Promise.all(
        pids.map((pid) => pidusage(pid).catch(() => ({ cpu: 0, memory: 0 })))
      )
      const stats = new Map<number, { cpu: number; memory: number }>()
      pids.forEach((pid, i) => stats.set(pid, statsResults[i]))

      for (const { id, pid, agentId } of sessions) {
        const pidStats = stats.get(pid) ?? { cpu: 0, memory: 0 }
        const row = dbRowMap.get(id)

        results.push({
          id,
          pid,
          name: row?.agent_name ?? 'Terminal',
          agentId,
          agentName: row?.agent_name ?? null,
          projectId: row?.project_id ?? null,
          projectName: row?.project_name ?? null,
          projectPath: row?.project_path ?? null,
          model: row?.model ?? null,
          memory: pidStats.memory,
          cpu: pidStats.cpu,
          startedAt: row?.started_at ?? Date.now(),
        })
      }

      return { ok: true, data: results }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Scan for orphaned Claude processes not managed by DAEMON
  ipcMain.handle('process:orphans', async () => {
    try {
      const managedPids = new Set<number>()
      for (const id of getAllSessionIds()) {
        const session = getSession(id)
        if (session) managedPids.add(session.pty.pid)
      }

      const orphans: OrphanProcess[] = []

      if (process.platform === 'win32') {
        const output = await new Promise<string>((resolve) => {
          exec('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
            resolve(err ? '' : stdout)
          })
        })

        for (const line of output.split('\n')) {
          const match = line.match(/"([^"]*claude[^"]*)","(\d+)","[^"]*","[^"]*","([\d,]+ K)"/i)
          if (match) {
            const pid = parseInt(match[2], 10)
            if (!managedPids.has(pid)) {
              const memStr = match[3].replace(/[, K]/g, '')
              orphans.push({
                pid,
                name: match[1],
                memory: parseInt(memStr, 10) * 1024, // KB to bytes
              })
            }
          }
        }
      }

      return { ok: true, data: orphans }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Kill a process
  ipcMain.handle('process:kill', async (_event, pid: number) => {
    try {
      // Validate PID is a safe integer
      if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
        return { ok: false, error: 'Invalid PID' }
      }

      if (process.platform === 'win32') {
        // Graceful first — use execFile (no shell) to prevent injection
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/PID', String(pid)], { timeout: 3000 }, () => resolve())
        })

        // Check if still alive after 3s
        await new Promise((r) => setTimeout(r, 3000))
        try {
          await pidusage(pid)
          // Still alive — force kill
          execFile('taskkill', ['/PID', String(pid), '/F'], { timeout: 3000 })
        } catch {
          // Already dead — good
        }
      } else {
        process.kill(pid, 'SIGTERM')
        await new Promise((r) => setTimeout(r, 3000))
        try { process.kill(pid, 'SIGKILL') } catch {}
      }

      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
