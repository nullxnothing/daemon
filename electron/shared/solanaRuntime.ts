export type SolanaRuntimeStatusLevel = 'live' | 'partial' | 'setup'

export interface SolanaExecutionCoverageItem {
  id: 'wallet-sends' | 'jupiter-swaps' | 'launch-adapters' | 'pumpfun' | 'recovery'
  label: string
  status: SolanaRuntimeStatusLevel
  detail: string
}

export type SolanaRuntimeUseCase = 'reads' | 'sends' | 'swaps' | 'launches' | 'recovery' | 'scaffolds'

export interface SolanaRuntimePreflightCheck {
  id: 'rpc-provider' | 'wallet-path' | 'swap-api' | 'execution-backend'
  label: string
  status: SolanaRuntimeStatusLevel
  detail: string
  requiredFor: SolanaRuntimeUseCase[]
}

export interface SolanaRuntimePreflight {
  ready: boolean
  checks: SolanaRuntimePreflightCheck[]
  blockers: string[]
}

export interface SolanaRuntimeExecutionPath {
  mode: 'rpc' | 'jito'
  label: string
  detail: string
  submitter: string
  confirmation: string
}

export interface SolanaRuntimeStatusSummary {
  rpc: {
    label: string
    detail: string
    status: SolanaRuntimeStatusLevel
  }
  walletPath: {
    label: string
    detail: string
    status: SolanaRuntimeStatusLevel
  }
  swapEngine: {
    label: string
    detail: string
    status: SolanaRuntimeStatusLevel
  }
  executionBackend: {
    label: string
    detail: string
    status: SolanaRuntimeStatusLevel
  }
  executionCoverage: SolanaExecutionCoverageItem[]
  troubleshooting: string[]
  preflight?: SolanaRuntimePreflight
  executionPath?: SolanaRuntimeExecutionPath
}

function getPreflight(
  runtime: SolanaRuntimeStatusSummary | SolanaRuntimePreflight | null | undefined
): SolanaRuntimePreflight | null {
  if (!runtime) return null
  return 'checks' in runtime ? runtime : runtime.preflight ?? null
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function getSolanaRuntimeBlockers(
  runtime: SolanaRuntimeStatusSummary | SolanaRuntimePreflight | null | undefined,
  useCase: SolanaRuntimeUseCase
): string[] {
  const preflight = getPreflight(runtime)
  if (!preflight && runtime && !('checks' in runtime)) {
    const blockers: string[] = []
    if (runtime.rpc.status === 'setup') blockers.push(runtime.rpc.detail)
    if (
      runtime.walletPath.status === 'setup' &&
      ['sends', 'swaps', 'launches', 'scaffolds'].includes(useCase)
    ) blockers.push(runtime.walletPath.detail)
    if (
      runtime.swapEngine.status === 'setup' &&
      ['swaps', 'scaffolds'].includes(useCase)
    ) blockers.push(runtime.swapEngine.detail)
    if (
      runtime.executionBackend.status === 'setup' &&
      ['sends', 'swaps', 'launches', 'recovery', 'scaffolds'].includes(useCase)
    ) blockers.push(runtime.executionBackend.detail)

    return unique(blockers)
  }
  if (!preflight) return []

  return unique(
    preflight.checks
      .filter((check) => check.status === 'setup' && check.requiredFor.includes(useCase))
      .map((check) => check.detail)
  )
}

export function isSolanaRuntimeUseCaseReady(
  runtime: SolanaRuntimeStatusSummary | SolanaRuntimePreflight | null | undefined,
  useCase: SolanaRuntimeUseCase
): boolean {
  return getSolanaRuntimeBlockers(runtime, useCase).length === 0
}
