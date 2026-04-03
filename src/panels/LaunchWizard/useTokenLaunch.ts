import { useState, useCallback } from 'react'

export interface LaunchParams {
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
  | 'uploading'
  | 'creating'
  | 'confirming'
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
    setState({ phase: 'uploading', result: null, error: null })

    try {
      // The PumpFunService handles IPFS upload + token creation in one call.
      // We drive the phase transitions by timing — uploading -> creating -> confirming.
      const createTimer = setTimeout(() => {
        setState((s) => s.phase === 'uploading' ? { ...s, phase: 'creating' } : s)
      }, 2000)

      const confirmTimer = setTimeout(() => {
        setState((s) => s.phase === 'creating' ? { ...s, phase: 'confirming' } : s)
      }, 5000)

      const res = await window.daemon.pumpfun.createToken({
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imagePath: params.imagePath,
        initialBuyAmountSol: params.initialBuySol,
        mayhemMode: false,
        walletId: params.walletId,
      })

      clearTimeout(createTimer)
      clearTimeout(confirmTimer)

      if (!res.ok || !res.data) {
        throw new Error((res as { ok: false; error: string }).error ?? 'Token creation failed')
      }

      const { signature } = res.data

      // Save to launched_tokens via IPC
      await window.daemon.launch.saveToken({
        walletId: params.walletId,
        mint: '',
        name: params.name,
        symbol: params.symbol,
        imagePath: params.imagePath ?? undefined,
        launchpad: 'pumpfun',
        createSignature: signature,
        initialBuySol: params.initialBuySol,
      })

      setState({
        phase: 'done',
        result: { mint: '', signature, success: true },
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
