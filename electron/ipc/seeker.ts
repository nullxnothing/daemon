import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import {
  addApproval,
  clearSession,
  createPairingSession,
  getRelayStatus,
  getSessionSnapshot,
  listSessions,
  startRelayServer,
  stopRelayServer,
  updateApprovalStatus,
  updateProjectSnapshot,
  type SeekerProjectSnapshot,
  type SeekerApprovalRequest,
} from '../services/SeekerRelayService'

export function registerSeekerHandlers() {
  ipcMain.handle('seeker:relay-start', ipcHandler(async (_event, port?: number) => {
    return startRelayServer(port)
  }))

  ipcMain.handle('seeker:relay-stop', ipcHandler(async () => {
    return stopRelayServer()
  }))

  ipcMain.handle('seeker:relay-status', ipcHandler(async () => {
    return getRelayStatus()
  }))

  ipcMain.handle('seeker:create-session', ipcHandler(async (_event, input?: {
    projectId?: string | null
    projectPath?: string | null
    projectName?: string | null
    project?: Partial<SeekerProjectSnapshot> | null
    seedDemoApprovals?: boolean
  }) => {
    return createPairingSession(input ?? {})
  }))

  ipcMain.handle('seeker:get-session', ipcHandler(async (_event, pairingCode: string) => {
    return getSessionSnapshot(pairingCode)
  }))

  ipcMain.handle('seeker:list-sessions', ipcHandler(async () => {
    return listSessions()
  }))

  ipcMain.handle('seeker:update-project', ipcHandler(async (_event, pairingCode: string, project: Partial<SeekerProjectSnapshot>) => {
    return updateProjectSnapshot(pairingCode, project)
  }))

  ipcMain.handle('seeker:add-approval', ipcHandler(async (_event, pairingCode: string, approval: Omit<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'> & Partial<Pick<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'>>) => {
    return addApproval(pairingCode, approval)
  }))

  ipcMain.handle('seeker:update-approval-status', ipcHandler(async (_event, pairingCode: string, approvalId: string, status: 'pending' | 'approved' | 'rejected') => {
    return updateApprovalStatus(pairingCode, approvalId, status)
  }))

  ipcMain.handle('seeker:clear-session', ipcHandler(async (_event, pairingCode: string) => {
    return clearSession(pairingCode)
  }))
}
