// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import BlockScanner from '../../src/panels/BlockScanner/BlockScanner'
import { BLOCK_SCANNER_HANDOFF_KEY } from '../../src/lib/surfaceHandoffs'

function getWebview(container: HTMLElement): Element {
  const webview = container.querySelector('webview')
  if (!webview) throw new Error('webview not rendered')
  return webview
}

function failLoad(webview: Element, errorCode: number, errorDescription = 'load failed') {
  const event = new Event('did-fail-load') as Event & {
    errorCode: number
    errorDescription: string
  }
  event.errorCode = errorCode
  event.errorDescription = errorDescription
  fireEvent(webview, event)
}

describe('BlockScanner', () => {
  it('loads Orb through a single src state path and navigates clusters/searches', async () => {
    const { container } = render(<BlockScanner />)
    const webview = getWebview(container)

    expect(webview.getAttribute('src')).toBe('https://orbmarkets.io')

    await userEvent.click(screen.getByRole('button', { name: 'Devnet' }))
    expect(webview.getAttribute('src')).toBe('https://orbmarkets.io/?cluster=devnet')

    await userEvent.type(screen.getByPlaceholderText('Wallet, mint, program ID, tx signature, or explorer URL'), '11111111111111111111111111111111')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(webview.getAttribute('src')).toBe('https://orbmarkets.io/account/11111111111111111111111111111111?cluster=devnet')
  })

  it('blocks malformed scanner input before navigating', async () => {
    const { container } = render(<BlockScanner />)
    const webview = getWebview(container)

    await userEvent.type(screen.getByPlaceholderText('Wallet, mint, program ID, tx signature, or explorer URL'), 'not a signature')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(screen.getByRole('status')).toHaveTextContent('Paste a base58 Solana address, token mint, program ID, or transaction signature.')
    expect(webview.getAttribute('src')).toBe('https://orbmarkets.io')
  })

  it('consumes a queued dashboard handoff', async () => {
    window.localStorage.setItem(BLOCK_SCANNER_HANDOFF_KEY, JSON.stringify({
      value: '11111111111111111111111111111111',
      cluster: 'devnet',
    }))

    const { container } = render(<BlockScanner />)
    const webview = getWebview(container)

    await waitFor(() => {
      expect(webview.getAttribute('src')).toBe('https://orbmarkets.io/account/11111111111111111111111111111111?cluster=devnet')
    })
    expect(window.localStorage.getItem(BLOCK_SCANNER_HANDOFF_KEY)).toBeNull()
  })

  it('ignores aborted Electron webview loads but reports real failures', () => {
    const { container } = render(<BlockScanner />)
    const webview = getWebview(container)

    failLoad(webview, -3, 'ERR_ABORTED')
    expect(screen.queryByText('Orb could not finish loading.')).not.toBeInTheDocument()

    failLoad(webview, -105, 'ERR_NAME_NOT_RESOLVED')
    expect(screen.getByText('Orb could not finish loading.')).toBeInTheDocument()
    expect(screen.getByText('ERR_NAME_NOT_RESOLVED (-105)')).toBeInTheDocument()
  })
})
