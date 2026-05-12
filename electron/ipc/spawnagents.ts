import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SpawnAgents from '../services/SpawnAgentsService'

const eventStreamSubscribers = new Map<number, number>()
const trackedEventStreamSenders = new Set<number>()

function eventSubscriberCount() {
  let count = 0
  for (const value of eventStreamSubscribers.values()) count += value
  return count
}

function releaseEventStreamSender(senderId: number) {
  const hadSubscriber = eventStreamSubscribers.delete(senderId)
  trackedEventStreamSenders.delete(senderId)
  if (hadSubscriber && eventSubscriberCount() === 0) {
    SpawnAgents.stopEventStream()
  }
}

export function registerSpawnAgentsHandlers() {
  ipcMain.handle('spawnagents:list', ipcHandler(async (_event, ownerPubkey: string) => {
    return SpawnAgents.listAgents(ownerPubkey)
  }))

  ipcMain.handle('spawnagents:get', ipcHandler(async (_event, agentId: string) => {
    return SpawnAgents.getAgent(agentId)
  }))

  ipcMain.handle('spawnagents:trades', ipcHandler(async (_event, agentId: string, limit?: number, offset?: number) => {
    return SpawnAgents.getTrades(agentId, limit, offset)
  }))

  ipcMain.handle('spawnagents:positions', ipcHandler(async (_event, agentId: string) => {
    return SpawnAgents.getPositions(agentId)
  }))

  ipcMain.handle('spawnagents:public-profile', ipcHandler(async (_event, agentId: string) => {
    return SpawnAgents.getPublicProfile(agentId)
  }))

  ipcMain.handle('spawnagents:public-portfolio', ipcHandler(async (_event, agentId: string) => {
    return SpawnAgents.getPublicPortfolio(agentId)
  }))

  ipcMain.handle('spawnagents:events', ipcHandler(async (_event, since: number, agentId?: string, limit?: number) => {
    return SpawnAgents.getEvents(since, agentId, limit)
  }))

  ipcMain.handle('spawnagents:event-stream:start', ipcHandler((event) => {
    const senderId = event.sender.id
    const previousTotal = eventSubscriberCount()
    eventStreamSubscribers.set(senderId, (eventStreamSubscribers.get(senderId) ?? 0) + 1)

    if (!trackedEventStreamSenders.has(senderId)) {
      trackedEventStreamSenders.add(senderId)
      event.sender.once('destroyed', () => releaseEventStreamSender(senderId))
    }

    if (previousTotal === 0) {
      SpawnAgents.startEventStream()
    }

    return { subscribers: eventSubscriberCount() }
  }))

  ipcMain.handle('spawnagents:event-stream:stop', ipcHandler((event) => {
    const senderId = event.sender.id
    const current = eventStreamSubscribers.get(senderId) ?? 0

    if (current <= 1) {
      eventStreamSubscribers.delete(senderId)
    } else {
      eventStreamSubscribers.set(senderId, current - 1)
    }

    if (current > 0 && eventSubscriberCount() === 0) {
      SpawnAgents.stopEventStream()
    }

    return { subscribers: eventSubscriberCount() }
  }))

  ipcMain.handle('spawnagents:spawn-status', ipcHandler(async (_event, ref: string) => {
    return SpawnAgents.pollSpawnStatus(ref)
  }))

  ipcMain.handle('spawnagents:initiate-spawn', ipcHandler(async (_event, input: SpawnAgents.SpawnInput) => {
    return SpawnAgents.initiateSpawn(input)
  }))

  ipcMain.handle('spawnagents:initiate-spawn-child', ipcHandler(async (_event, parentAgentId: string, walletId: string, input: SpawnAgents.SpawnChildInput) => {
    return SpawnAgents.initiateSpawnChild(parentAgentId, walletId, input)
  }))

  ipcMain.handle('spawnagents:withdraw', ipcHandler(async (_event, agentId: string, walletId: string, amountSol: number) => {
    return SpawnAgents.withdraw(agentId, walletId, amountSol)
  }))

  ipcMain.handle('spawnagents:kill', ipcHandler(async (_event, agentId: string, walletId: string) => {
    return SpawnAgents.killAgent(agentId, walletId)
  }))

  ipcMain.handle('spawnagents:spawn-and-fund', ipcHandler(async (_event, walletId: string, input: SpawnAgents.SpawnInput) => {
    return SpawnAgents.spawnAndFund(walletId, input)
  }))

  ipcMain.handle('spawnagents:spawn-child-and-fund', ipcHandler(async (_event, parentAgentId: string, walletId: string, input: SpawnAgents.SpawnChildInput) => {
    return SpawnAgents.spawnChildAndFund(parentAgentId, walletId, input)
  }))
}
