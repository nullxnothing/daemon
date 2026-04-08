import { ipcMain, dialog, clipboard } from 'electron'
import * as WalletService from '../services/WalletService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { ValidationService } from '../services/ValidationService'
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

  ipcMain.handle('wallet:rename', ipcHandler(async (_event, id: string, name: string) => {
    const trimmed = (name ?? '').trim().slice(0, 100)
    if (!trimmed) throw new Error('Wallet name cannot be empty')
    const db = (await import('../db/db')).getDb()
    db.prepare('UPDATE wallets SET name = ? WHERE id = ?').run(trimmed, id)
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

  ipcMain.handle('wallet:swap-quote', ipcHandler(async (_event, input: { inputMint: string; outputMint: string; amount: number; slippageBps: number }) => {
    return await WalletService.getSwapQuote(input.inputMint, input.outputMint, input.amount, input.slippageBps)
  }))

  ipcMain.handle('wallet:swap-execute', ipcHandler(async (_event, input: {
    walletId: string
    inputMint: string
    outputMint: string
    amount: number
    slippageBps: number
    rawQuoteResponse?: unknown
    // H1: server-side confirmation enforcement
    confirmedAt: number
    acknowledgedImpact: boolean
  }) => {
    // H1: confirmedAt must be a timestamp within the last 60 seconds
    const now = Date.now()
    if (typeof input.confirmedAt !== 'number' || input.confirmedAt <= 0) {
      throw new Error('Swap requires a confirmedAt timestamp')
    }
    const ageMs = now - input.confirmedAt
    if (ageMs < 0 || ageMs > 60_000) {
      throw new Error('Swap confirmation expired — please review the quote again')
    }

    // H1: if the quote has high price impact, acknowledgedImpact must be true
    if (input.rawQuoteResponse != null) {
      const quote = input.rawQuoteResponse as Record<string, unknown>
      const impactPct = parseFloat(String(quote.priceImpactPct ?? '0'))
      if (impactPct >= 5 && input.acknowledgedImpact !== true) {
        throw new Error('High price impact must be explicitly acknowledged before executing')
      }
    }

    return await WalletService.executeSwap(
      input.walletId,
      input.inputMint,
      input.outputMint,
      input.amount,
      input.slippageBps,
      input.rawQuoteResponse,
    )
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
    const safeLimitVal = Math.min(Math.max(limit ?? 50, 1), 200)
    return WalletService.getTransactionHistory(walletId, safeLimitVal)
  }))

  ipcMain.handle('wallet:export-private-key', ipcHandler(async (_event, walletId: string) => {
    if (!ValidationService.checkRateLimit('export-private-key', 3, 5 * 60 * 1000)) {
      throw new Error('Too many export attempts. Please wait 5 minutes.')
    }

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Export Key'],
      defaultId: 0,
      cancelId: 0,
      title: 'Export Private Key',
      message: 'This will expose your private key in plaintext.',
      detail: 'Only proceed if you understand the security implications.',
    })
    if (response === 0) throw new Error('Export cancelled by user')

    const keyString = await WalletService.exportPrivateKey(walletId)
    clipboard.writeText(keyString)
    // Auto-clear after 30 seconds if clipboard hasn't changed
    setTimeout(() => {
      if (clipboard.readText() === keyString) clipboard.writeText('')
    }, 30000)
    return true
  }))
}
