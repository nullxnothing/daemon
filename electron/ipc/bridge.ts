/**
 * Bridge IPC — approval round-trips between the bridge gateway (main) and the
 * renderer approval surface, plus server lifecycle and project registration.
 *
 * Parallel to ipc/aria.ts on purpose: aria's pending-approval map is keyed to
 * chat-transcript turns and its events route to the initiating sender; bridge
 * approvals have no turn, broadcast to every window, and carry a timeout.
 * `bridge:approve` is renderer-only (trusted sender) — the shim can never
 * resolve an approval.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain, BrowserWindow } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { isTrustedSender } from '../security/ipcSender'
import * as McpConfig from '../services/McpConfig'
import { ensureBridgeToken, writeBridgeRuntimeInfo, rotateBridgeToken, bridgeInfoFile } from '../services/bridge/bridgeToken'
import { startBridgeServer, stopBridgeServer, getBridgeStatus } from '../services/bridge/BridgeServerService'
import { listBridgeTools, executeBridgeCall, type BridgeCallRequest } from '../services/bridge/BridgeToolGateway'
import type { BridgeToolEvent } from '../shared/types'

const pendingBridgeApprovals = new Map<string, (approved: boolean) => void>()

function emitToRenderer(event: BridgeToolEvent) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('bridge:event', event)
  }
}

function focusAppWindow() {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.focus()
}

/** Block until the user decides in DAEMON's UI. The gateway adds the timeout. */
function requestBridgeApproval(req: { callId: string; name: string; risk: 'read' | 'write' | 'sensitive'; summary: string; input: unknown }): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pendingBridgeApprovals.set(req.callId, resolve)
    emitToRenderer({ kind: 'approval-request', callId: req.callId, name: req.name, risk: req.risk, summary: req.summary, input: req.input, source: 'bridge' })
    focusAppWindow()
  })
}

export function cancelBridgeApproval(callId: string): void {
  pendingBridgeApprovals.delete(callId)
  emitToRenderer({ kind: 'approval-expired', callId })
}

export function cancelAllBridgeApprovals(): void {
  for (const [callId, resolve] of pendingBridgeApprovals) {
    resolve(false)
    emitToRenderer({ kind: 'approval-expired', callId })
  }
  pendingBridgeApprovals.clear()
}

function executeCall(req: BridgeCallRequest) {
  return executeBridgeCall(req, {
    requestApproval: requestBridgeApproval,
    cancelApproval: cancelBridgeApproval,
    emit: emitToRenderer,
  })
}

export async function startBridge(): Promise<void> {
  const userData = app.getPath('userData')
  const { token, file } = ensureBridgeToken(userData)
  const status = await startBridgeServer({
    token,
    tokenFile: file,
    version: app.getVersion(),
    listTools: listBridgeTools,
    executeCall,
  })
  if (status.running) {
    writeBridgeRuntimeInfo(userData, { port: status.port, token, version: app.getVersion() })
  }
}

export async function stopBridge(): Promise<void> {
  cancelAllBridgeApprovals()
  await stopBridgeServer()
}

function resolveShimPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bridge', 'daemon-bridge-shim.mjs')
    : path.join(process.env.APP_ROOT ?? app.getAppPath(), 'dist-bridge', 'daemon-bridge-shim.mjs')
}

/** Offline tool list so the shim can complete the MCP handshake before DAEMON is up. */
function writeToolsSnapshot(userData: string): void {
  const file = path.join(path.dirname(bridgeInfoFile(userData)), 'bridge-tools.json')
  fs.writeFileSync(file, JSON.stringify(listBridgeTools(), null, 2), 'utf8')
}

export function registerBridgeHandlers(): void {
  ipcMain.handle('bridge:status', ipcHandler(async () => getBridgeStatus()))

  ipcMain.handle('bridge:rotate-token', ipcHandler(async () => {
    const userData = app.getPath('userData')
    const token = rotateBridgeToken(userData)
    await stopBridge()
    const status = await startBridgeServer({
      token,
      tokenFile: bridgeInfoFile(userData),
      version: app.getVersion(),
      listTools: listBridgeTools,
      executeCall,
    })
    if (status.running) writeBridgeRuntimeInfo(userData, { port: status.port, token, version: app.getVersion() })
    return status
  }))

  ipcMain.handle('bridge:register-project', ipcHandler(async (_event, projectPath: string) => {
    if (!projectPath || typeof projectPath !== 'string') throw new Error('Project path required')
    const shimPath = resolveShimPath()
    if (!fs.existsSync(shimPath)) {
      throw new Error('Bridge shim not built — run "pnpm run build:bridge" first.')
    }
    const userData = app.getPath('userData')
    McpConfig.addRegistryMcp(
      'daemon-bridge',
      JSON.stringify({ command: 'node', args: [shimPath], env: { DAEMON_BRIDGE_INFO: bridgeInfoFile(userData) } }),
      'DAEMON Bridge — user-gated wallet, launch, and memory tools',
      false,
    )
    McpConfig.toggleProjectMcp(projectPath, 'daemon-bridge', true)
    writeToolsSnapshot(userData)
    return getBridgeStatus()
  }))

  // Raw channel (not ipcHandler): mirrors aria:approve. Guard the sender frame —
  // only DAEMON's own renderer may resolve approvals.
  ipcMain.on('bridge:approve', (event, callId: string, approved: boolean) => {
    if (!isTrustedSender(event)) return
    const resolve = pendingBridgeApprovals.get(callId)
    if (resolve) {
      pendingBridgeApprovals.delete(callId)
      resolve(Boolean(approved))
    }
  })
}
