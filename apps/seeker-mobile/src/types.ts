export type SessionStatus = 'idle' | 'pairing' | 'paired' | 'error'

export interface PairingSession {
  status: SessionStatus
  pairingCode: string
  relayUrl: string
  desktopId: string | null
  projectName: string
  updatedAt: number
}

export type ApprovalRisk = 'low' | 'medium' | 'high'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRequest {
  id: string
  title: string
  description: string
  risk: ApprovalRisk
  status: ApprovalStatus
  source: 'agent' | 'deploy' | 'wallet' | 'system'
  command?: string
  diffSummary?: string
  createdAt: number
}

export interface ProjectSnapshot {
  name: string
  readiness: number
  framework: string
  validatorOnline: boolean
  enabledIntegrations: number
  pendingApprovals: number
  lastDeploy?: string
  walletBalance?: string
}

export interface RelayEvent {
  type: 'pair' | 'approval.approve' | 'approval.reject' | 'wallet.connected' | 'wallet.sign-request' | 'notification.register'
  sessionCode: string
  payload?: Record<string, unknown>
}

export interface WalletState {
  address: string | null
  authorizationToken: string | null
  cluster: 'devnet' | 'mainnet-beta'
  connecting: boolean
  error: string | null
}
