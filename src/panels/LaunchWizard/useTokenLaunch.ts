import { useState, useCallback } from 'react'
import { useBrowserStore } from '../../store/browser'
import { useUIStore } from '../../store/ui'

export interface LaunchParams {
  launchpad: LaunchpadId
  projectId?: string
  // Step 1 — Token details
  name: string
  symbol: string
  description: string
  imagePath: string | null
  twitter: string
  telegram: string
  website: string
  // Step 2 — Launch config
  initialBuySol: number
  slippageBps: number
  priorityFeeSol: number
  walletId: string
}

export interface LaunchResult {
  mint: string
  signature: string
  success: boolean
}

export type LaunchPhase =
  | 'idle'
  | 'creating'
  | 'done'
  | 'error'

interface LaunchState {
  phase: LaunchPhase
  result: LaunchResult | null
  error: string | null
}

export function useTokenLaunch() {
  const [state, setState] = useState<LaunchState>({
    phase: 'idle',
    result: null,
    error: null,
  })

  const launch = useCallback(async (params: LaunchParams): Promise<void> => {
    setState({ phase: 'creating', result: null, error: null })

    try {
      const res = await window.daemon.launch.createToken({
        launchpad: params.launchpad,
        projectId: params.projectId,
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imagePath: params.imagePath,
        twitter: params.twitter,
        telegram: params.telegram,
        website: params.website,
        initialBuySol: params.initialBuySol,
        slippageBps: params.slippageBps,
        priorityFeeSol: params.priorityFeeSol,
        walletId: params.walletId,
      })

      if (!res.ok || !res.data) {
        throw new Error((res as { ok: false; error: string }).error ?? 'Token creation failed')
      }

      const { signature, mint } = res.data

      if (params.launchpad === 'pumpfun' && mint) {
        const tokenUrl = `https://pump.fun/coin/${mint}`
        useBrowserStore.getState().setUrl(tokenUrl)
        useUIStore.getState().openBrowserTab()
      }

      setState({
        phase: 'done',
        result: { mint, signature, success: true },
        error: null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setState({ phase: 'error', result: null, error: message })
    }
  }, [])

  const reset = useCallback(() => {
    setState({ phase: 'idle', result: null, error: null })
  }, [])

  return { state, launch, reset }
}
