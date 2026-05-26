// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingWizard } from '../../src/panels/Onboarding/OnboardingWizard'
import { useConfirmStore } from '../../src/store/confirm'
import { useOnboardingStore } from '../../src/store/onboarding'
import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      settings: {
        setOnboardingComplete: vi.fn().mockResolvedValue({ ok: true }),
        setOnboardingProgress: vi.fn().mockResolvedValue({ ok: true }),
        setPinnedTools: vi.fn().mockResolvedValue({ ok: true }),
        setWorkspaceProfile: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })
}

function resetStores() {
  useConfirmStore.setState({ current: null })
  useWorkspaceProfileStore.setState({ profileName: 'custom', toolVisibility: {}, loaded: true })
  useOnboardingStore.setState({
    wizardOpen: true,
    currentStepIndex: 0,
    progress: {
      profile: 'pending',
      project: 'pending',
      runtime: 'pending',
      ai: 'pending',
      firstRun: 'pending',
      tour: 'pending',
    },
    showResumeBanner: false,
    showTourOffer: false,
    tourActive: false,
    tourStepIndex: 0,
  })
}

describe('Onboarding wizard keyboard behavior', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStores()
  })

  it('moves initial focus into the dialog and traps Tab navigation', async () => {
    render(<OnboardingWizard />)

    const firstChoice = screen.getByRole('button', { name: /Web Development/ })
    await waitFor(() => expect(firstChoice).toHaveFocus())

    const skipSetup = screen.getByRole('button', { name: 'Skip setup, explore first' })
    skipSetup.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(firstChoice).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(skipSetup).toHaveFocus()
  })

  it('advances with keyboard activation and opens the skip confirmation on Escape', async () => {
    render(<OnboardingWizard />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Web Development/ })).toHaveFocus())
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(useOnboardingStore.getState().currentStepIndex).toBe(1))
    expect(screen.getByRole('dialog', { name: 'DAEMON' })).toHaveAccessibleDescription('Open or scaffold a Solana workspace')

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'DAEMON' }), { key: 'Escape' })
    expect(useConfirmStore.getState().current?.title).toBe('Exit setup?')
  })
})
