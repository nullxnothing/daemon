import { ipcMain } from 'electron'
import * as PortService from '../services/PortService'

export function registerPortHandlers() {
  ipcMain.handle('ports:scan', async () => {
    try {
      const ports = await PortService.scanListeningPorts()
      return { ok: true, data: ports }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ports:registered', async () => {
    try {
      const listening = await PortService.scanListeningPorts()
      const registered = PortService.getRegisteredPorts()

      // Enrich with listening status
      const listeningPorts = new Set(listening.map((p) => p.port))
      for (const r of registered) {
        r.isListening = listeningPorts.has(r.port)
        const match = listening.find((l) => l.port === r.port)
        if (match) r.pid = match.pid
      }

      return { ok: true, data: registered }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ports:register', async (_event, port: number, projectId: string, serviceName: string) => {
    try {
      if (typeof port !== 'number' || port < 1 || port > 65535) return { ok: false, error: 'Invalid port' }
      PortService.registerPort(port, projectId, serviceName)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ports:unregister', async (_event, port: number, projectId: string) => {
    try {
      PortService.unregisterPort(port, projectId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ports:ghosts', async () => {
    try {
      const ghosts = await PortService.findGhostPorts()
      return { ok: true, data: ghosts }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('ports:kill', async (_event, port: number) => {
    try {
      if (typeof port !== 'number' || port < 1) return { ok: false, error: 'Invalid port' }
      await PortService.killPortProcess(port)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
