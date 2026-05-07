import { useCallback, useState } from 'react'
import { Buffer } from 'buffer'
import { transact, type Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import type { WalletState } from '../types'

const APP_IDENTITY = {
  name: 'Daemon Seeker',
  uri: 'https://www.daemonide.tech',
  icon: 'https://www.daemonide.tech/icon-512.png',
}

const USER_CANCEL_PATTERNS = [
  'cancel',
  'declined',
  'reject',
  'user_disapproved',
  'no wallet',
  'no compatible wallet',
  'attempt_failed',
]

function classifyWalletError(raw: unknown) {
  const message = raw instanceof Error ? raw.message : String(raw ?? '')
  const lower = message.toLowerCase()
  if (USER_CANCEL_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return { kind: 'cancel' as const, message: 'Wallet request cancelled.' }
  }
  if (lower.includes('not_installed') || lower.includes('no_wallet_found')) {
    return {
      kind: 'no-wallet' as const,
      message: 'No Mobile Wallet Adapter compatible wallet was found. Install Phantom, Solflare, or Backpack on this device.',
    }
  }
  return { kind: 'error' as const, message: message || 'Wallet request failed' }
}

function getFirstAccountAddress(authResult: any) {
  const account = authResult?.accounts?.[0]
  return account?.display_address ?? account?.address ?? null
}

function getChain(cluster: WalletState['cluster']) {
  return cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet-beta'
}

export function useSeekerWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    authorizationToken: null,
    cluster: 'devnet',
    connecting: false,
    error: null,
  })

  const setCluster = useCallback((cluster: WalletState['cluster']) => {
    setWallet((current) => ({ ...current, cluster }))
  }, [])

  const connectWallet = useCallback(async () => {
    setWallet((current) => ({ ...current, connecting: true, error: null }))

    try {
      const authResult = await transact(async (mobileWallet: Web3MobileWallet) => {
        return mobileWallet.authorize({
          chain: getChain(wallet.cluster),
          identity: APP_IDENTITY,
        } as any)
      })
      const address = getFirstAccountAddress(authResult)
      const authorizationToken = (authResult as any)?.auth_token ?? null

      setWallet((current) => ({
        ...current,
        address,
        authorizationToken,
        connecting: false,
        error: null,
      }))

      return { ok: true, authResult, address, authorizationToken }
    } catch (error) {
      const classified = classifyWalletError(error)
      setWallet((current) => ({
        ...current,
        connecting: false,
        error: classified.kind === 'cancel' ? null : classified.message,
      }))
      return { ok: false, error: classified.message, kind: classified.kind }
    }
  }, [wallet.cluster])

  const signMessage = useCallback(async (message: string) => {
    if (!wallet.address) {
      return { ok: false, error: 'Connect a wallet first' }
    }

    try {
      const result = await transact(async (mobileWallet: Web3MobileWallet) => {
        const authResult = await mobileWallet.authorize({
          chain: getChain(wallet.cluster),
          identity: APP_IDENTITY,
          auth_token: wallet.authorizationToken ?? undefined,
        } as any)

        const address = (authResult as any)?.accounts?.[0]?.address
        if (!address) throw new Error('No authorized wallet address returned')

        return mobileWallet.signMessages({
          addresses: [address],
          payloads: [Buffer.from(message, 'utf8')],
        } as any)
      })

      return { ok: true, result }
    } catch (error) {
      const classified = classifyWalletError(error)
      return { ok: false, error: classified.message, kind: classified.kind }
    }
  }, [wallet.address, wallet.authorizationToken, wallet.cluster])

  const disconnectWallet = useCallback(async () => {
    const token = wallet.authorizationToken
    setWallet((current) => ({ ...current, address: null, authorizationToken: null, error: null }))

    if (!token) return { ok: true }

    try {
      await transact(async (mobileWallet: Web3MobileWallet) => {
        return mobileWallet.deauthorize({ auth_token: token } as any)
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Wallet disconnect failed' }
    }
  }, [wallet.authorizationToken])

  return {
    wallet,
    setCluster,
    connectWallet,
    disconnectWallet,
    signMessage,
  }
}
