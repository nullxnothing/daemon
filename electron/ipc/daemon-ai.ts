import { ipcMain } from 'electron'
import * as DaemonAIAgentService from '../services/DaemonAIAgentService'
import * as DaemonAIService from '../services/DaemonAIService'
import * as PatchProposalService from '../services/PatchProposalService'
import * as ToolApprovalService from '../services/ToolApprovalService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type {
  DaemonAiAgentRunInput,
  DaemonAiChatRequest,
  DaemonAiPatchApplyInput,
  DaemonAiPatchDecisionInput,
  DaemonAiPatchProposalInput,
  DaemonAiToolApprovalDecisionInput,
  DaemonAiToolCallInput,
} from '../shared/types'

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

  ipcMain.handle('daemon-ai:create-agent-run', ipcHandler(async (_event, input: DaemonAiAgentRunInput) => {
    return DaemonAIAgentService.createAgentRun(input)
  }))

  ipcMain.handle('daemon-ai:get-agent-run', ipcHandler(async (_event, runId: string) => {
    return DaemonAIAgentService.getAgentRun(runId)
  }))

  ipcMain.handle('daemon-ai:list-agent-runs', ipcHandler(async (_event, limit?: number) => {
    return DaemonAIAgentService.listAgentRuns(limit)
  }))

  ipcMain.handle('daemon-ai:cancel-agent-run', ipcHandler(async (_event, runId: string) => {
    return DaemonAIAgentService.cancelAgentRun(runId)
  }))

  ipcMain.handle('daemon-ai:request-tool-approval', ipcHandler(async (_event, input: DaemonAiToolCallInput) => {
    return ToolApprovalService.requestToolApproval(input)
  }))

  ipcMain.handle('daemon-ai:approve-tool-call', ipcHandler(async (_event, input: DaemonAiToolApprovalDecisionInput) => {
    return ToolApprovalService.decideToolApproval(input)
  }))

  ipcMain.handle('daemon-ai:list-tool-approvals', ipcHandler(async (_event, runId: string) => {
    return ToolApprovalService.listToolApprovals(runId)
  }))

  ipcMain.handle('daemon-ai:create-patch-proposal', ipcHandler(async (_event, input: DaemonAiPatchProposalInput) => {
    return PatchProposalService.createPatchProposal(input)
  }))

  ipcMain.handle('daemon-ai:get-patch-proposal', ipcHandler(async (_event, proposalId: string) => {
    return PatchProposalService.getPatchProposal(proposalId)
  }))

  ipcMain.handle('daemon-ai:list-patch-proposals', ipcHandler(async (_event, runId: string) => {
    return PatchProposalService.listPatchProposals(runId)
  }))

  ipcMain.handle('daemon-ai:decide-patch-proposal', ipcHandler(async (_event, input: DaemonAiPatchDecisionInput) => {
    return PatchProposalService.decidePatchProposal(input)
  }))

  ipcMain.handle('daemon-ai:apply-patch-proposal', ipcHandler(async (_event, input: DaemonAiPatchApplyInput) => {
    return PatchProposalService.applyPatchProposal(input)
  }))
}
