import type { EnvFile, WalletListEntry } from '../../types/daemon'
import type { SolanaMcpEntry, SolanaToolchainStatus } from '../../store/solanaToolbox'
import type { IntegrationDefinition, IntegrationRequirement, IntegrationStatus } from './registry'

export interface IntegrationContext {
  envFiles: EnvFile[]
  mcps: SolanaMcpEntry[]
  packages: Set<string>
  walletReady: boolean
  defaultWallet: WalletListEntry | null
  secureKeys: Record<string, boolean>
  toolchain: SolanaToolchainStatus | null
}

export interface RequirementState extends IntegrationRequirement {
  ready: boolean
  detail: string
}

export interface IntegrationStatusSummary {
  status: IntegrationStatus
  readyRequired: number
  totalRequired: number
  requirements: RequirementState[]
}

function hasEnvKey(envFiles: EnvFile[], key: string): boolean {
  return envFiles.some((file) => file.vars.some((envVar) => !envVar.isComment && envVar.key === key && envVar.value.trim().length > 0))
}

function hasPackage(packages: Set<string>, key: string): boolean {
  return packages.has(key)
}

function getRequirementState(requirement: IntegrationRequirement, context: IntegrationContext): RequirementState {
  if (requirement.type === 'env') {
    const ready = hasEnvKey(context.envFiles, requirement.key)
    return { ...requirement, ready, detail: ready ? 'Found in project env' : 'Missing from project env' }
  }

  if (requirement.type === 'secure-key') {
    const ready = Boolean(context.secureKeys[requirement.key])
    return { ...requirement, ready, detail: ready ? 'Stored in DAEMON' : 'Not stored yet' }
  }

  if (requirement.type === 'mcp') {
    const mcp = context.mcps.find((entry) => entry.name === requirement.key)
    const ready = Boolean(mcp?.enabled)
    return { ...requirement, ready, detail: ready ? 'Enabled for this project' : mcp ? 'Available but disabled' : 'Not detected' }
  }

  if (requirement.type === 'package') {
    const ready = hasPackage(context.packages, requirement.key)
    return { ...requirement, ready, detail: ready ? 'Installed in package.json' : 'Not in package.json' }
  }

  if (requirement.type === 'wallet') {
    return {
      ...requirement,
      ready: context.walletReady,
      detail: context.walletReady ? `Default wallet: ${context.defaultWallet?.name ?? 'configured'}` : 'No default wallet',
    }
  }

  if (requirement.type === 'toolchain') {
    const nodeReady = true
    return { ...requirement, ready: nodeReady, detail: 'DAEMON runtime available' }
  }

  return { ...requirement, ready: false, detail: 'Unknown requirement' }
}

export function resolveIntegrationStatus(
  integration: IntegrationDefinition,
  context: IntegrationContext,
): IntegrationStatusSummary {
  const requirements = integration.requirements.map((requirement) => getRequirementState(requirement, context))
  const required = requirements.filter((requirement) => !requirement.optional)
  const readyRequired = required.filter((requirement) => requirement.ready).length
  const totalRequired = required.length
  const optionalReady = requirements.some((requirement) => requirement.optional && requirement.ready)

  let status: IntegrationStatus = 'missing'
  if (totalRequired === 0 || readyRequired === totalRequired) {
    status = 'ready'
  } else if (readyRequired > 0 || optionalReady) {
    status = 'partial'
  }

  return {
    status,
    readyRequired,
    totalRequired,
    requirements,
  }
}

export function summarizeRegistry(integrations: IntegrationDefinition[], context: IntegrationContext) {
  const summaries = integrations.map((integration) => resolveIntegrationStatus(integration, context))
  return {
    ready: summaries.filter((summary) => summary.status === 'ready').length,
    partial: summaries.filter((summary) => summary.status === 'partial').length,
    missing: summaries.filter((summary) => summary.status === 'missing').length,
    safeActions: integrations.reduce((count, integration) => (
      count + integration.actions.filter((action) => action.kind === 'safe-check' && action.risk === 'read-only').length
    ), 0),
  }
}
