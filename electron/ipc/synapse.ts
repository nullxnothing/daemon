import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SynapseSap from '../services/SynapseSapService'
import type { SynapseSapDiscoveryInput, SynapseSapRegisterInput, SynapseSapCluster } from '../shared/types'

export function registerSynapseHandlers() {
  ipcMain.handle('synapse:status', ipcHandler(async (_event, input?: { cluster?: SynapseSapCluster }) => {
    return SynapseSap.status(input)
  }))

  ipcMain.handle('synapse:get-agent', ipcHandler(async (_event, wallet: string, input?: { cluster?: SynapseSapCluster }) => {
    if (!wallet?.trim()) throw new Error('wallet is required')
    return SynapseSap.getAgent(wallet.trim(), input)
  }))

  ipcMain.handle('synapse:discover-capability', ipcHandler(async (_event, input: SynapseSapDiscoveryInput) => {
    return SynapseSap.discoverByCapability(input)
  }))

  ipcMain.handle('synapse:discover-protocol', ipcHandler(async (_event, input: SynapseSapDiscoveryInput) => {
    return SynapseSap.discoverByProtocol(input)
  }))

  ipcMain.handle('synapse:register-agent', ipcHandler(async (_event, input: SynapseSapRegisterInput) => {
    return SynapseSap.registerAgent(input)
  }))
}
