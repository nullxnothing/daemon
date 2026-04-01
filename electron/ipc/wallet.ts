import { ipcMain } from 'electron'
import * as WalletService from '../services/WalletService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { WalletCreateInput, WalletGenerateInput, TransferSOLInput, TransferTokenInput } from '../shared/types'

export function registerWalletHandlers() {
  ipcMain.handle('wallet:dashboard', ipcHandler(async (_event, projectId?: string | null) => {
    return await WalletService.getDashboard(projectId)
  }))

  ipcMain.handle('wallet:list', ipcHandler(async () => {
    return WalletService.listWallets()
  }))

  ipcMain.handle('wallet:create', ipcHandler(async (_event, wallet: WalletCreateInput) => {
    return WalletService.createWallet(wallet.name, wallet.address)
  }))

  ipcMain.handle('wallet:delete', ipcHandler(async (_event, id: string) => {
    WalletService.deleteWallet(id)
  }))

  ipcMain.handle('wallet:set-default', ipcHandler(async (_event, id: string) => {
    WalletService.setDefaultWallet(id)
  }))

  ipcMain.handle('wallet:assign-project', ipcHandler(async (_event, projectId: string, walletId: string | null) => {
    WalletService.assignWalletToProject(projectId, walletId)
  }))

  ipcMain.handle('wallet:store-helius-key', ipcHandler(async (_event, value: string) => {
    await WalletService.storeHeliusKey(value)
  }))

  ipcMain.handle('wallet:delete-helius-key', ipcHandler(async () => {
    WalletService.deleteHeliusKey()
  }))

  ipcMain.handle('wallet:has-helius-key', ipcHandler(async () => {
    return WalletService.hasHeliusKey()
  }))

  ipcMain.handle('wallet:generate', ipcHandler(async (_event, input: WalletGenerateInput) => {
    return WalletService.generateWallet(input.name, input.walletType, input.agentId)
  }))

  ipcMain.handle('wallet:send-sol', ipcHandler(async (_event, input: TransferSOLInput) => {
    return await WalletService.transferSOL(input.fromWalletId, input.toAddress, input.amountSol)
  }))

  ipcMain.handle('wallet:send-token', ipcHandler(async (_event, input: TransferTokenInput) => {
    return await WalletService.transferToken(input.fromWalletId, input.toAddress, input.mint, input.amount)
  }))

  ipcMain.handle('wallet:balance', ipcHandler(async (_event, walletId: string) => {
    return await WalletService.getBalance(walletId)
  }))

  ipcMain.handle('wallet:agent-wallets', ipcHandler(async (_event, agentId?: string) => {
    return WalletService.listAgentWallets(agentId)
  }))

  ipcMain.handle('wallet:create-agent-wallet', ipcHandler(async (_event, agentId: string, agentName: string) => {
    return WalletService.createAgentWallet(agentId, agentName)
  }))

  ipcMain.handle('wallet:has-keypair', ipcHandler(async (_event, walletId: string) => {
    return WalletService.hasKeypair(walletId)
  }))

  ipcMain.handle('wallet:transaction-history', ipcHandler(async (_event, walletId: string, limit?: number) => {
    return WalletService.getTransactionHistory(walletId, limit)
  }))

  ipcMain.handle('wallet:export-private-key', ipcHandler(async (_event, walletId: string) => {
    return WalletService.exportPrivateKey(walletId)
  }))
}
