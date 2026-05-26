// @vitest-environment happy-dom

import axe from 'axe-core'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingWizard } from '../../src/panels/Onboarding/OnboardingWizard'
import { useConfirmStore } from '../../src/store/confirm'
import { STEP_ORDER, useOnboardingStore } from '../../src/store/onboarding'
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

function resetStores(stepIndex = 0) {
  useConfirmStore.setState({ current: null })
  useWorkspaceProfileStore.setState({ profileName: 'custom', toolVisibility: {}, loaded: true })
  useOnboardingStore.setState({
    wizardOpen: true,
    currentStepIndex: stepIndex,
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

describe('Onboarding wizard accessibility', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStores()
  })

  it('renders as a named modal dialog with an accessible description', () => {
    render(<OnboardingWizard />)

    const dialog = screen.getByRole('dialog', { name: 'DAEMON' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('What are you building?')
  })

  it('keeps every wizard step free of automated axe violations', async () => {
    for (const [stepIndex] of STEP_ORDER.entries()) {
      resetStores(stepIndex)
      const { container, unmount } = render(<OnboardingWizard />)

      const results = await axe.run(container)
      expect(results.violations.map((violation) => violation.id)).toEqual([])

      unmount()
    }
  })
})
