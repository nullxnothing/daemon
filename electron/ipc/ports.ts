import { ipcMain } from 'electron'
import * as PortService from '../services/PortService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerPortHandlers() {
  ipcMain.handle('ports:scan', ipcHandler(async () => {
    return await PortService.scanListeningPorts()
  }))

  ipcMain.handle('ports:registered', ipcHandler(async () => {
    const listening = await PortService.scanListeningPorts()
    const registered = PortService.getRegisteredPorts()

    // Enrich with listening status
    const listeningPorts = new Set(listening.map((p) => p.port))
    for (const r of registered) {
      r.isListening = listeningPorts.has(r.port)
      const match = listening.find((l) => l.port === r.port)
      if (match) r.pid = match.pid
    }

    return registered
  }))

  ipcMain.handle('ports:register', ipcHandler(async (_event, port: number, projectId: string, serviceName: string) => {
    if (typeof port !== 'number' || port < 1 || port > 65535) throw new Error('Invalid port')
    PortService.registerPort(port, projectId, serviceName)
  }))

  ipcMain.handle('ports:unregister', ipcHandler(async (_event, port: number, projectId: string) => {
    PortService.unregisterPort(port, projectId)
  }))

  ipcMain.handle('ports:ghosts', ipcHandler(async () => {
    return await PortService.findGhostPorts()
  }))

  ipcMain.handle('ports:kill', ipcHandler(async (_event, port: number) => {
    if (typeof port !== 'number' || port < 1) throw new Error('Invalid port')
    await PortService.killPortProcess(port)
  }))
}
