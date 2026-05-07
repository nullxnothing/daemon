import { useCallback, useState } from 'react'
import { Buffer } from 'buffer'
import { transact, type Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import type { WalletState } from '../types'

const APP_IDENTITY = {
  name: 'Daemon Seeker',
  uri: 'https://www.daemonide.tech',
  icon: 'favicon.ico',
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

      setWallet((current) => ({
        ...current,
        address: getFirstAccountAddress(authResult),
        authorizationToken: (authResult as any)?.auth_token ?? null,
        connecting: false,
        error: null,
      }))

      return { ok: true, authResult }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed'
      setWallet((current) => ({ ...current, connecting: false, error: message }))
      return { ok: false, error: message }
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
      return { ok: false, error: error instanceof Error ? error.message : 'Message signing failed' }
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
