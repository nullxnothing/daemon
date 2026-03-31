import { ipcMain, shell, dialog } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ToolService from '../services/ToolService'
import type { ToolCreateInput } from '../shared/types'

export function registerToolHandlers() {
  ipcMain.handle('tools:list', ipcHandler(async () => {
    return ToolService.listTools()
  }))

  ipcMain.handle('tools:get', ipcHandler(async (_event, id: string) => {
    const tool = ToolService.getTool(id)
    if (!tool) throw new Error('Tool not found')
    return tool
  }))

  ipcMain.handle('tools:create', ipcHandler(async (_event, input: ToolCreateInput) => {
    return ToolService.scaffoldTool(input)
  }))

  ipcMain.handle('tools:update', ipcHandler(async (_event, id: string, data: Record<string, unknown>) => {
    return ToolService.updateTool(id, data)
  }))

  ipcMain.handle('tools:delete', ipcHandler(async (_event, id: string, removeFiles?: boolean) => {
    ToolService.deleteTool(id, removeFiles ?? false)
  }))

  ipcMain.handle('tools:import', ipcHandler(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Import Tool (select folder with manifest.json)',
    })
    if (result.canceled || !result.filePaths.length) return null
    return ToolService.importTool(result.filePaths[0])
  }))

  ipcMain.handle('tools:discover', ipcHandler(async () => {
    return ToolService.discoverTools()
  }))

  ipcMain.handle('tools:runCommand', ipcHandler(async (_event, id: string) => {
    const tool = ToolService.getTool(id)
    if (!tool) throw new Error('Tool not found')
    const cmd = ToolService.buildRunCommand(tool)
    ToolService.markToolRun(id)
    return { ...cmd, cwd: tool.tool_path, toolId: id }
  }))

  ipcMain.handle('tools:markRunning', ipcHandler(async (_event, toolId: string, terminalId: string, pid: number) => {
    ToolService.setRunning(toolId, terminalId, pid)
  }))

  ipcMain.handle('tools:markStopped', ipcHandler(async (_event, toolId: string) => {
    ToolService.clearRunning(toolId)
  }))

  ipcMain.handle('tools:status', ipcHandler(async (_event, id: string) => {
    return ToolService.getRunStatus(id)
  }))

  ipcMain.handle('tools:openFolder', ipcHandler(async (_event, id: string) => {
    const tool = ToolService.getTool(id)
    if (!tool) throw new Error('Tool not found')
    await shell.openPath(tool.tool_path)
  }))

  ipcMain.handle('tools:basePath', ipcHandler(async () => {
    return ToolService.getToolsBasePath()
  }))
}
