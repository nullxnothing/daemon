import { ipcMain } from 'electron'
import * as DaemonAIService from '../services/DaemonAIService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { DaemonAiChatRequest } from '../shared/types'

export function registerDaemonAIHandlers() {
  ipcMain.handle('daemon-ai:chat', ipcHandler(async (_event, input: DaemonAiChatRequest) => {
    return DaemonAIService.chat(input)
  }))

  ipcMain.handle('daemon-ai:stream-chat', ipcHandler(async (_event, input: DaemonAiChatRequest) => {
    return DaemonAIService.chat(input)
  }))

  ipcMain.handle('daemon-ai:usage', ipcHandler(async () => {
    return DaemonAIService.getUsage()
  }))

  ipcMain.handle('daemon-ai:models', ipcHandler(async () => {
    return DaemonAIService.getModels()
  }))

  ipcMain.handle('daemon-ai:features', ipcHandler(async () => {
    return DaemonAIService.getFeatures()
  }))

  ipcMain.handle('daemon-ai:summarize-context', ipcHandler(async (_event, input: DaemonAiChatRequest) => {
    return DaemonAIService.summarizeContext(input)
  }))
}
