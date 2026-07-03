// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StepAiSafety } from '../../src/panels/Onboarding/steps/StepAiSafety'
import { StepFirstMission } from '../../src/panels/Onboarding/steps/StepFirstMission'
import { StepProject } from '../../src/panels/Onboarding/steps/StepProject'
import { FIRST_MISSION_PROMPT } from '../../src/lib/firstMission'
import { useOnboardingStore } from '../../src/store/onboarding'
import { useUIStore } from '../../src/store/ui'
import { useAriaStore } from '../../src/store/aria'

const markFunnelStep = vi.fn().mockResolvedValue({ ok: true, data: { marked: true } })
const createDemoWorkspace = vi.fn()
const ariaSend = vi.fn().mockResolvedValue({ ok: true })

function installBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      settings: {
        setOnboardingComplete: vi.fn().mockResolvedValue({ ok: true }),
        setOnboardingProgress: vi.fn().mockResolvedValue({ ok: true }),
        setLayout: vi.fn().mockResolvedValue({ ok: true }),
        markFunnelStep,
        getFunnel: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
      projects: { createDemoWorkspace },
      aria: {
        send: ariaSend,
        history: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        onToolEvent: () => () => {},
        onUiEffect: () => () => {},
      },
    },
  })
}

function resetStores() {
  useOnboardingStore.setState({
    wizardOpen: true,
    currentStepIndex: 3,
    progress: {
      profile: 'complete',
      claude: 'complete',
      project: 'complete',
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
  useUIStore.setState({ consoleDock: 'bottom', projects: [], activeProjectId: null, activeProjectPath: null })
  // Unique session per test: the aria store tracks in-flight sends per session in
  // module state, so a deliberately-unsettled send in one test must not block the next.
  useAriaStore.setState({ turns: [], isLoading: false, sessionId: `session-${sessionCounter++}` })
}
let sessionCounter = 0

afterEach(cleanup)

describe('StepAiSafety — the Approval Gate primer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBridge()
    resetStores()
  })

  it('previews a WRITE remember_fact card with frozen buttons', () => {
    render(<StepAiSafety />)
    expect(screen.getByText('WRITE')).toBeInTheDocument()
    expect(screen.getByText('remember_fact')).toBeInTheDocument()
    expect(screen.getByText('Save a project fact to memory')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve', hidden: true })).toBeDisabled()
  })

  it('states the three risk-tier rules', () => {
    render(<StepAiSafety />)
    expect(screen.getByText(/READ runs automatically/)).toBeInTheDocument()
    expect(screen.getByText(/WRITE stops and asks you/)).toBeInTheDocument()
    expect(screen.getByText(/SENSITIVE makes you type the tool name/)).toBeInTheDocument()
  })

  it('Continue completes the step, marks primer_done, and advances', async () => {
    render(<StepAiSafety />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(useOnboardingStore.getState().progress.ai).toBe('complete')
    expect(useOnboardingStore.getState().currentStepIndex).toBe(4)
    expect(markFunnelStep).toHaveBeenCalledWith('primer_done')
  })
})

describe('StepFirstMission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBridge()
    resetStores()
    useOnboardingStore.setState({ currentStepIndex: 4 })
  })

  it('states the promise and the fine print', () => {
    render(<StepFirstMission />)
    expect(screen.getByText(/One mission, ninety seconds/)).toBeInTheDocument()
    expect(screen.getByText(/nothing on-chain/)).toBeInTheDocument()
  })

  it('Run first mission closes the wizard, defers the tour offer, docks the console right, and fires the scripted turn', async () => {
    // Keep the mission turn in flight so the deferred-offer state is observable.
    ariaSend.mockReturnValueOnce(new Promise(() => {}))
    render(<StepFirstMission />)
    await userEvent.click(screen.getByTestId('mission-run'))

    const onboarding = useOnboardingStore.getState()
    expect(onboarding.wizardOpen).toBe(false)
    expect(onboarding.showTourOffer).toBe(false)
    expect(onboarding.deferTourOffer).toBe(true)
    expect(onboarding.progress.firstMission).toBe('complete')
    expect(useUIStore.getState().consoleDock).toBe('right')
    expect(markFunnelStep).toHaveBeenCalledWith('mission_started')
    await waitFor(() => expect(ariaSend).toHaveBeenCalled())
    expect(ariaSend.mock.calls[0][1]).toBe(FIRST_MISSION_PROMPT)
  })

  it('raises the deferred tour offer only after the mission turn settles', async () => {
    let settle: () => void = () => {}
    ariaSend.mockReturnValueOnce(new Promise<{ ok: boolean }>((resolve) => { settle = () => resolve({ ok: true }) }))
    render(<StepFirstMission />)
    await userEvent.click(screen.getByTestId('mission-run'))

    expect(useOnboardingStore.getState().showTourOffer).toBe(false)
    settle()
    await waitFor(() => expect(useOnboardingStore.getState().showTourOffer).toBe(true))
  })

  it('the skip path opens Solana Start and raises the tour offer immediately', async () => {
    const openWorkspaceTool = vi.fn()
    useUIStore.setState({ openWorkspaceTool })
    render(<StepFirstMission />)
    await userEvent.click(screen.getByRole('button', { name: 'Skip, explore on my own' }))

    expect(openWorkspaceTool).toHaveBeenCalledWith('project-readiness')
    const onboarding = useOnboardingStore.getState()
    expect(onboarding.wizardOpen).toBe(false)
    expect(onboarding.showTourOffer).toBe(true)
    expect(ariaSend).not.toHaveBeenCalled()
  })
})

describe('StepProject — demo workspace route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBridge()
    resetStores()
    useOnboardingStore.setState({ currentStepIndex: 2, progress: { ...useOnboardingStore.getState().progress, project: 'pending' } })
  })

  it('scaffolds, activates the project, marks the funnel, and advances', async () => {
    const project = { id: 'demo-1', name: 'daemon-first-mission', path: 'C:/Users/x/daemon-first-mission' }
    createDemoWorkspace.mockResolvedValue({ ok: true, data: project })
    render(<StepProject />)
    await userEvent.click(screen.getByTestId('wizard-demo-workspace'))

    await waitFor(() => expect(useOnboardingStore.getState().progress.project).toBe('complete'))
    expect(useUIStore.getState().activeProjectId).toBe('demo-1')
    expect(useUIStore.getState().projects.some((p) => p.id === 'demo-1')).toBe(true)
    expect(markFunnelStep).toHaveBeenCalledWith('demo_workspace_created')
    expect(markFunnelStep).toHaveBeenCalledWith('project_ready')
    expect(useOnboardingStore.getState().currentStepIndex).toBe(3)
  })

  it('surfaces a scaffold failure without advancing', async () => {
    createDemoWorkspace.mockResolvedValue({ ok: false, error: 'disk full' })
    render(<StepProject />)
    await userEvent.click(screen.getByTestId('wizard-demo-workspace'))

    await waitFor(() => expect(screen.getByText('disk full')).toBeInTheDocument())
    expect(useOnboardingStore.getState().progress.project).toBe('pending')
    expect(useOnboardingStore.getState().currentStepIndex).toBe(2)
  })

  it('"I have a repo, continue" completes without scaffolding', async () => {
    render(<StepProject />)
    await userEvent.click(screen.getByRole('button', { name: 'I have a repo, continue' }))
    expect(createDemoWorkspace).not.toHaveBeenCalled()
    expect(useOnboardingStore.getState().progress.project).toBe('complete')
    expect(markFunnelStep).toHaveBeenCalledWith('project_ready')
  })
})
