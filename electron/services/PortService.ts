import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
import { getDb } from '../db/db'
import type { ListeningPort, RegisteredPort, GhostPort } from '../shared/types'

export type { ListeningPort, RegisteredPort, GhostPort }

export async function scanListeningPorts(): Promise<ListeningPort[]> {
  const ports: ListeningPort[] = []

  if (process.platform === 'win32') {
    const output = await execAsync('netstat -ano | findstr LISTENING')
    const pidNames = await getPidNames()

    for (const line of output.split('\n')) {
      const match = line.trim().match(/TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
      if (!match) continue
      const port = parseInt(match[2], 10)
      const pid = parseInt(match[3], 10)
      if (port === 0 || pid === 0) continue

      ports.push({
        port,
        pid,
        address: match[1],
        processName: pidNames.get(pid) ?? null,
      })
    }
  } else {
    const output = await execAsync("lsof -i -P -n | grep LISTEN")
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 9) continue
      const portMatch = parts[8]?.match(/:(\d+)$/)
      if (!portMatch) continue

      ports.push({
        port: parseInt(portMatch[1], 10),
        pid: parseInt(parts[1], 10),
        address: parts[8].replace(`:${portMatch[1]}`, ''),
        processName: parts[0],
      })
    }
  }

  // Dedupe by port (keep first occurrence)
  const seen = new Set<number>()
  return ports.filter((p) => {
    if (seen.has(p.port)) return false
    seen.add(p.port)
    return true
  })
}

export function getRegisteredPorts(): RegisteredPort[] {
  const db = getDb()
  const rows = db.prepare(`
    SELECT p.port, p.project_id, p.service_name, p.pid, pr.name as project_name
    FROM ports p
    LEFT JOIN projects pr ON p.project_id = pr.id
    ORDER BY p.port
  `).all() as Array<{ port: number; project_id: string; service_name: string; pid: number | null; project_name: string }>

  return rows.map((r) => ({
    port: r.port,
    projectId: r.project_id,
    projectName: r.project_name ?? 'Unknown',
    serviceName: r.service_name,
    pid: r.pid,
    isListening: false, // Will be enriched by caller
  }))
}

export function registerPort(port: number, projectId: string, serviceName: string): void {
  const db = getDb()
  db.prepare(
    'INSERT OR REPLACE INTO ports (port, project_id, service_name, registered_at) VALUES (?,?,?,?)'
  ).run(port, projectId, serviceName, Date.now())
}

export function unregisterPort(port: number, projectId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM ports WHERE port = ? AND project_id = ?').run(port, projectId)
}

export async function findGhostPorts(): Promise<GhostPort[]> {
  const listening = await scanListeningPorts()
  const registered = getRegisteredPorts()
  const registeredPorts = new Set(registered.map((r) => r.port))

  // System ports (below 1024) and common system services are not ghosts
  return listening.filter((p) => p.port >= 1024 && !registeredPorts.has(p.port))
}

export async function killPortProcess(port: number): Promise<void> {
  const listening = await scanListeningPorts()
  const target = listening.find((p) => p.port === port)
  if (!target) throw new Error(`No process listening on port ${port}`)

  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/PID', String(target.pid), '/F'])
  } else {
    process.kill(target.pid, 'SIGTERM')
  }
}

// Helpers — shell commands below are hardcoded static strings, not user input.

function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
      resolve(err ? '' : stdout)
    })
  })
}

async function getPidNames(): Promise<Map<number, string>> {
  const output = await execAsync('tasklist /FO CSV /NH')
  const map = new Map<number, string>()
  for (const line of output.split('\n')) {
    const match = line.match(/"([^"]+)","(\d+)"/)
    if (match) map.set(parseInt(match[2], 10), match[1])
  }
  return map
}
