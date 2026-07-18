import type { MemeMarketSnapshot, MemeTechProjectProfile, TokenRiskPreflight } from '../../electron/services/meme-studio/types'

declare global {
  interface DaemonMemeStudio {
    detect: (projectPath: string) => Promise<IpcResponse<MemeTechProjectProfile>>
    marketContext: (mint: string) => Promise<IpcResponse<MemeMarketSnapshot>>
    tokenPreflight: (mint: string) => Promise<IpcResponse<TokenRiskPreflight>>
  }

  interface DaemonAPI {
    memeStudio: DaemonMemeStudio
  }
}

export {}
