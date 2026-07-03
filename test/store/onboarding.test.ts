import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.daemon before the store is imported
const markFunnelStepMock = vi.fn().mockResolvedValue({ ok: true, data: { marked: true } })
vi.stubGlobal('window', {
  daemon: {
    settings: {
      setOnboardingProgress: vi.fn().mockResolvedValue({ ok: true }),
      getOnboardingProgress: vi.fn().mockResolvedValue({ ok: true, data: null }),
      isOnboardingComplete: vi.fn().mockResolvedValue({ ok: true, data: false }),
      setOnboardingComplete: vi.fn().mockResolvedValue({ ok: true }),
      markFunnelStep: markFunnelStepMock,
      getFunnel: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    },
  },
})

import { useOnboardingStore, STEP_ORDER } from '../../src/store/onboarding'

function resetStore() {
  useOnboardingStore.setState({
    wizardOpen: false,
    currentStepIndex: 0,
    progress: {
      profile: 'pending',
      claude: 'pending',
      project: 'pending',
      ai: 'pending',
      firstMission: 'pending',
      tour: 'pending',
    },
    showResumeBanner: false,
    showTourOffer: false,
    deferTourOffer: false,
    tourActive: false,
    tourStepIndex: 0,
  })
  markFunnelStepMock.mockClear()
}

describe('useOnboardingStore — initial state', () => {
  beforeEach(resetStore)

  it('starts with wizard closed and step index 0', () => {
    const state = useOnboardingStore.getState()
    expect(state.wizardOpen).toBe(false)
    expect(state.currentStepIndex).toBe(0)
  })

  it('all steps are pending by default', () => {
    const { progress } = useOnboardingStore.getState()
    for (const id of STEP_ORDER) {
      expect(progress[id]).toBe('pending')
    }
  })
})

describe('useOnboardingStore — advanceStep', () => {
  beforeEach(resetStore)

  it('increments currentStepIndex by 1', () => {
    useOnboardingStore.getState().advanceStep()
    expect(useOnboardingStore.getState().currentStepIndex).toBe(1)
  })

  it('advances through all steps correctly', () => {
    const store = useOnboardingStore.getState()
    for (let i = 0; i < STEP_ORDER.length - 1; i++) {
      store.advanceStep()
    }
    expect(useOnboardingStore.getState().currentStepIndex).toBe(STEP_ORDER.length - 1)
  })

  it('closes wizard and shows tour offer after the last step', () => {
    useOnboardingStore.setState({ currentStepIndex: STEP_ORDER.length - 1, wizardOpen: true })
    useOnboardingStore.getState().advanceStep()
    const state = useOnboardingStore.getState()
    expect(state.wizardOpen).toBe(false)
    expect(state.showTourOffer).toBe(true)
  })
})

describe('useOnboardingStore — goToStep', () => {
  beforeEach(resetStore)

  it('sets the step index directly', () => {
    useOnboardingStore.getState().goToStep(3)
    expect(useOnboardingStore.getState().currentStepIndex).toBe(3)
  })

  it('clamps to 0 for negative values', () => {
    useOnboardingStore.getState().goToStep(-5)
    expect(useOnboardingStore.getState().currentStepIndex).toBe(0)
  })

  it('clamps to last step for values exceeding the step count', () => {
    useOnboardingStore.getState().goToStep(999)
    expect(useOnboardingStore.getState().currentStepIndex).toBe(STEP_ORDER.length - 1)
  })

  it('does not go below 0', () => {
    useOnboardingStore.getState().goToStep(0)
    expect(useOnboardingStore.getState().currentStepIndex).toBe(0)
  })
})

describe('useOnboardingStore — skipWizard', () => {
  beforeEach(resetStore)

  it('closes the wizard', () => {
    useOnboardingStore.setState({ wizardOpen: true })
    useOnboardingStore.getState().skipWizard()
    expect(useOnboardingStore.getState().wizardOpen).toBe(false)
  })

  it('marks the current step as skipped', () => {
    useOnboardingStore.setState({ currentStepIndex: 2 }) // 'project' step
    useOnboardingStore.getState().skipWizard()
    const { progress } = useOnboardingStore.getState()
    expect(progress.project).toBe('skipped')
  })

  it('does not alter other step progress', () => {
    useOnboardingStore.setState({ currentStepIndex: 0 })
    useOnboardingStore.getState().skipWizard()
    const { progress } = useOnboardingStore.getState()
    // Only 'profile' (index 0) should be skipped
    expect(progress.claude).toBe('pending')
    expect(progress.project).toBe('pending')
  })

  it('records the early-exit funnel mark', () => {
    useOnboardingStore.setState({ wizardOpen: true })
    useOnboardingStore.getState().skipWizard()
    expect(markFunnelStepMock).toHaveBeenCalledWith('wizard_exited_early')
  })

  it('hides the resume banner', () => {
    useOnboardingStore.setState({ showResumeBanner: true })
    useOnboardingStore.getState().skipWizard()
    expect(useOnboardingStore.getState().showResumeBanner).toBe(false)
  })
})

describe('useOnboardingStore — openWizard (firstIncomplete index)', () => {
  beforeEach(resetStore)

  it('opens wizard at first pending step when some are complete', () => {
    useOnboardingStore.setState({
      progress: {
        profile: 'complete',
        claude: 'complete',
        project: 'pending',
        ai: 'pending',
        firstMission: 'pending',
        tour: 'pending',
      },
    })
    useOnboardingStore.getState().openWizard()
    // 'project' is at index 2
    expect(useOnboardingStore.getState().currentStepIndex).toBe(2)
  })

  it('opens wizard at index 0 when all steps are pending', () => {
    useOnboardingStore.getState().openWizard()
    expect(useOnboardingStore.getState().currentStepIndex).toBe(0)
  })

  it('opens wizard at index 0 when all steps are complete (no incomplete found)', () => {
    useOnboardingStore.setState({
      progress: {
        profile: 'complete',
        claude: 'complete',
        project: 'complete',
        ai: 'complete',
        firstMission: 'complete',
        tour: 'complete',
      },
    })
    useOnboardingStore.getState().openWizard()
    expect(useOnboardingStore.getState().currentStepIndex).toBe(0)
  })

  it('hides the resume banner when opening wizard', () => {
    useOnboardingStore.setState({ showResumeBanner: true })
    useOnboardingStore.getState().openWizard()
    expect(useOnboardingStore.getState().showResumeBanner).toBe(false)
  })

  it('sets wizardOpen to true', () => {
    useOnboardingStore.getState().openWizard()
    expect(useOnboardingStore.getState().wizardOpen).toBe(true)
  })
})

describe('useOnboardingStore — first mission wizard exit', () => {
  beforeEach(resetStore)

  it('finishWizardForMission closes the wizard without raising the tour offer', () => {
    useOnboardingStore.setState({ wizardOpen: true, currentStepIndex: STEP_ORDER.length - 1 })
    useOnboardingStore.getState().finishWizardForMission()
    const state = useOnboardingStore.getState()
    expect(state.wizardOpen).toBe(false)
    expect(state.showTourOffer).toBe(false)
    expect(state.deferTourOffer).toBe(true)
    expect(state.progress.firstMission).toBe('complete')
  })

  it('raiseDeferredTourOffer shows the tour offer only when deferred', () => {
    useOnboardingStore.getState().raiseDeferredTourOffer()
    expect(useOnboardingStore.getState().showTourOffer).toBe(false)

    useOnboardingStore.setState({ deferTourOffer: true })
    useOnboardingStore.getState().raiseDeferredTourOffer()
    const state = useOnboardingStore.getState()
    expect(state.showTourOffer).toBe(true)
    expect(state.deferTourOffer).toBe(false)
  })

  it('raiseDeferredTourOffer is idempotent after the first raise', () => {
    useOnboardingStore.setState({ deferTourOffer: true })
    useOnboardingStore.getState().raiseDeferredTourOffer()
    useOnboardingStore.setState({ showTourOffer: false })
    useOnboardingStore.getState().raiseDeferredTourOffer()
    expect(useOnboardingStore.getState().showTourOffer).toBe(false)
  })
})

describe('useOnboardingStore — tour controls', () => {
  beforeEach(resetStore)

  it('startTour activates tour at step 0', () => {
    useOnboardingStore.getState().startTour()
    const state = useOnboardingStore.getState()
    expect(state.tourActive).toBe(true)
    expect(state.tourStepIndex).toBe(0)
  })

  it('advanceTour increments tourStepIndex', () => {
    useOnboardingStore.setState({ tourActive: true, tourStepIndex: 0 })
    useOnboardingStore.getState().advanceTour()
    expect(useOnboardingStore.getState().tourStepIndex).toBe(1)
  })

  it('retreatTour decrements tourStepIndex', () => {
    useOnboardingStore.setState({ tourActive: true, tourStepIndex: 3 })
    useOnboardingStore.getState().retreatTour()
    expect(useOnboardingStore.getState().tourStepIndex).toBe(2)
  })

  it('retreatTour does not go below 0', () => {
    useOnboardingStore.setState({ tourActive: true, tourStepIndex: 0 })
    useOnboardingStore.getState().retreatTour()
    expect(useOnboardingStore.getState().tourStepIndex).toBe(0)
  })
})
