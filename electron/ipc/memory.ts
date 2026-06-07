import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as MemoryService from '../services/MemoryService'
import * as MemoryExtraction from '../services/MemoryExtractionService'
import * as MemoryInjection from '../services/MemoryInjectionService'
import * as CheckRunner from '../services/CheckRunnerService'
import type {
  CheckDefinition,
  MemoryStatus,
  MemorySuggestionInput,
  MemoryUpdateInput,
  ProjectMemory,
} from '../shared/types'

export function registerMemoryHandlers() {
  ipcMain.handle('memory:list', ipcHandler(async (
    _event,
    projectId: string | null,
    opts?: { status?: MemoryStatus; kind?: ProjectMemory['kind'] },
  ) => {
    return MemoryService.listMemories(projectId ?? null, opts ?? {})
  }))

  ipcMain.handle('memory:suggest', ipcHandler(async (_event, input: MemorySuggestionInput) => {
    return MemoryService.createSuggestion(input)
  }))

  ipcMain.handle('memory:approve', ipcHandler(async (_event, id: string, approvedBy?: string) => {
    return MemoryService.approveMemory(id, approvedBy ?? 'user')
  }))

  ipcMain.handle('memory:update', ipcHandler(async (_event, id: string, patch: MemoryUpdateInput) => {
    return MemoryService.updateMemory(id, patch)
  }))

  ipcMain.handle('memory:reject', ipcHandler(async (_event, id: string) => {
    return MemoryService.rejectMemory(id)
  }))

  ipcMain.handle('memory:delete', ipcHandler(async (_event, id: string) => {
    MemoryService.deleteMemory(id)
  }))

  ipcMain.handle('memory:extract', ipcHandler(async (
    _event,
    projectPath: string,
    projectId: string | null,
  ) => {
    if (!projectPath?.trim()) throw new Error('projectPath is required')
    return MemoryExtraction.extractFromProject(projectPath, projectId ?? null)
  }))

  ipcMain.handle('memory:buildContextBundle', ipcHandler(async (
    _event,
    projectId: string | null,
    opts?: { charBudget?: number; sessionRef?: string | null },
  ) => {
    return MemoryInjection.buildContextBundle(projectId ?? null, opts ?? {})
  }))

  ipcMain.handle('checks:discover', ipcHandler(async (_event, projectPath: string) => {
    if (!projectPath?.trim()) throw new Error('projectPath is required')
    return CheckRunner.discoverChecks(projectPath)
  }))

  ipcMain.handle('checks:run', ipcHandler(async (
    _event,
    projectPath: string,
    check: CheckDefinition,
  ) => {
    if (!projectPath?.trim()) throw new Error('projectPath is required')
    return CheckRunner.runCheck(projectPath, check)
  }))
}
