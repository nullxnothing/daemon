import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { LspService } from '../services/LspService'
import type { LspDocumentInput, LspPosition } from '../shared/types'

export function registerLspHandlers() {
  ipcMain.handle('lsp:status', ipcHandler(async (_event, projectPath?: string) => {
    return LspService.status(projectPath)
  }))

  ipcMain.handle('lsp:open-document', ipcHandler(async (_event, input: LspDocumentInput) => {
    return LspService.openDocument(input)
  }))

  ipcMain.handle('lsp:change-document', ipcHandler(async (_event, input: LspDocumentInput) => {
    return LspService.changeDocument(input)
  }))

  ipcMain.handle('lsp:close-document', ipcHandler(async (_event, input: Pick<LspDocumentInput, 'projectPath' | 'filePath' | 'languageId'>) => {
    await LspService.closeDocument(input)
  }))

  ipcMain.handle('lsp:hover', ipcHandler(async (
    _event,
    projectPath: string,
    filePath: string,
    languageId: string,
    position: LspPosition,
  ) => {
    return LspService.hover(projectPath, filePath, languageId, position)
  }))

  ipcMain.handle('lsp:definition', ipcHandler(async (
    _event,
    projectPath: string,
    filePath: string,
    languageId: string,
    position: LspPosition,
  ) => {
    return LspService.definition(projectPath, filePath, languageId, position)
  }))

  ipcMain.handle('lsp:completion', ipcHandler(async (
    _event,
    projectPath: string,
    filePath: string,
    languageId: string,
    position: LspPosition,
  ) => {
    return LspService.completion(projectPath, filePath, languageId, position)
  }))

  ipcMain.handle('lsp:diagnostics', ipcHandler(async (_event, filePath: string) => {
    return LspService.diagnostics(filePath)
  }))

  ipcMain.handle('lsp:shutdown-project', ipcHandler(async (_event, projectPath: string) => {
    LspService.shutdownProject(projectPath)
  }))
}
