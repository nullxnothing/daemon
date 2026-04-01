import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as PumpFun from '../services/PumpFunService'

export function registerPumpFunHandlers() {
  ipcMain.handle('pumpfun:bonding-curve', ipcHandler(async (_event, mint: string) => {
    return await PumpFun.getBondingCurveState(mint)
  }))

  ipcMain.handle('pumpfun:create-token', ipcHandler(async (_event, input: PumpFun.TokenCreateInput) => {
    return await PumpFun.createToken(input)
  }))

  ipcMain.handle('pumpfun:buy', ipcHandler(async (_event, input: PumpFun.TradeInput) => {
    return await PumpFun.buyToken(input)
  }))

  ipcMain.handle('pumpfun:sell', ipcHandler(async (_event, input: PumpFun.TradeInput) => {
    return await PumpFun.sellToken(input)
  }))

  ipcMain.handle('pumpfun:collect-fees', ipcHandler(async (_event, walletId: string) => {
    return await PumpFun.collectCreatorFees(walletId)
  }))

  ipcMain.handle('pumpfun:pick-image', ipcHandler(async () => {
    return await PumpFun.pickImage()
  }))

  ipcMain.handle('pumpfun:has-keypair', ipcHandler(async (_event, walletId: string) => {
    return PumpFun.hasKeypair(walletId)
  }))

  ipcMain.handle('pumpfun:import-keypair', ipcHandler(async (_event, walletId: string) => {
    return await PumpFun.importKeypair(walletId)
  }))
}
