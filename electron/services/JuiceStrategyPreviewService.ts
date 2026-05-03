import * as JuiceService from './JuiceService'

export interface JuiceStrategyPreviewInput {
  targetPnlUsd: number
  maxCrowdLevel: number
  scoutLimit?: number
}

export interface JuiceStrategySellCandidate {
  wallet: JuiceService.JuiceWallet
  pnl: JuiceService.JuiceWalletPnl
  reason: string
}

export interface JuiceStrategyEntryCandidate {
  token: JuiceService.JuiceScoutToken
  mintDetails: JuiceService.JuiceMintDetails
  reason: string
}

export interface JuiceStrategySkippedCandidate {
  token: JuiceService.JuiceScoutToken
  reason: string
}

export interface JuiceStrategyPreview {
  targetPnlUsd: number
  maxCrowdLevel: number
  scoutLimit: number
  sellCandidates: JuiceStrategySellCandidate[]
  entryCandidates: JuiceStrategyEntryCandidate[]
  skipped: JuiceStrategySkippedCandidate[]
  generatedAt: number
}

function formatUsd(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export async function buildStrategyPreview(input: JuiceStrategyPreviewInput): Promise<JuiceStrategyPreview> {
  const targetPnlUsd = Number.isFinite(input.targetPnlUsd) ? Math.max(0, input.targetPnlUsd) : 0
  const maxCrowdLevel = Number.isFinite(input.maxCrowdLevel) ? Math.max(0, input.maxCrowdLevel) : 3
  const scoutLimit = Number.isFinite(input.scoutLimit ?? 5) ? Math.max(1, Math.min(20, input.scoutLimit ?? 5)) : 5

  const [wallets, scoutingReport] = await Promise.all([
    JuiceService.listWallets(),
    JuiceService.getScoutingReport(),
  ])

  const pnlResults = await Promise.allSettled(
    wallets.filter((wallet) => wallet.isActive).map(async (wallet) => ({
      wallet,
      pnl: await JuiceService.getPnl(wallet.id),
    }))
  )

  const sellCandidates = pnlResults.flatMap((result): JuiceStrategySellCandidate[] => {
    if (result.status !== 'fulfilled') return []
    const { wallet, pnl } = result.value
    if (pnl.pnl.totalUsd < targetPnlUsd) return []
    return [{
      wallet,
      pnl,
      reason: `PNL is at or above ${formatUsd(targetPnlUsd)} target`,
    }]
  })

  const inspected = await Promise.allSettled(
    scoutingReport.tokens.slice(0, scoutLimit).map(async (token) => ({
      token,
      mintDetails: await JuiceService.getMintDetails(token.mint),
    }))
  )

  const entryCandidates: JuiceStrategyEntryCandidate[] = []
  const skipped: JuiceStrategySkippedCandidate[] = []

  inspected.forEach((result, index) => {
    const token = scoutingReport.tokens[index]
    if (!token) return

    if (result.status !== 'fulfilled') {
      skipped.push({ token, reason: result.reason instanceof Error ? result.reason.message : 'Mint details unavailable' })
      return
    }

    const { mintDetails } = result.value
    if (mintDetails.overcrowdingLevel > maxCrowdLevel) {
      skipped.push({ token, reason: `Crowding level ${mintDetails.overcrowdingLevel} is above max ${maxCrowdLevel}` })
      return
    }

    entryCandidates.push({
      token,
      mintDetails,
      reason: `Grade ${token.grade}, score ${token.score}/${token.maxScore}, crowding ${mintDetails.overcrowdingLevel}/${maxCrowdLevel}`,
    })
  })

  return {
    targetPnlUsd,
    maxCrowdLevel,
    scoutLimit,
    sellCandidates,
    entryCandidates,
    skipped,
    generatedAt: Date.now(),
  }
}
