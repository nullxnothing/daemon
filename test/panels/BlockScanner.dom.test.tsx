// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import BlockScanner from '../../src/panels/BlockScanner/BlockScanner'

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

    await userEvent.type(screen.getByPlaceholderText('Address or tx signature...'), '11111111111111111111111111111111')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(webview.getAttribute('src')).toBe('https://orbmarkets.io/account/11111111111111111111111111111111?cluster=devnet')
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
