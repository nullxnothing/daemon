import * as PumpFun from '../../PumpFunService'
import type { TokenLaunchAdapter } from '../types'

export const pumpFunLaunchAdapter: TokenLaunchAdapter = {
  definition: {
    id: 'pumpfun',
    name: 'Pump.fun',
    description: 'Bonding curve launch on Pump.fun V2',
    status: 'available',
    enabled: true,
    reason: null,
  },
  async preflight() {
    return [{
      id: 'pumpfun-launch',
      label: 'Pump.fun Program',
      status: 'pass',
      detail: 'Pump.fun launch flow is available with the current runtime configuration.',
    }]
  },
  async createLaunch(input) {
    const result = await PumpFun.createToken({
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      imagePath: input.imagePath,
      initialBuyAmountSol: input.initialBuySol,
      mayhemMode: input.mayhemMode ?? false,
      walletId: input.walletId,
    })

    return {
      signature: result.signature,
      mint: result.mint,
      metadataUri: result.metadataUri,
      poolAddress: null,
      bondingCurveAddress: result.bondingCurveAddress,
      protocolReceipts: {
        metadataUri: result.metadataUri,
        bondingCurveAddress: result.bondingCurveAddress,
        associatedBondingCurveAddress: result.associatedBondingCurveAddress,
      },
    }
  },
}
