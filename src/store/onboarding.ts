import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'

export type OnboardingStepId = 'profile' | 'claude' | 'gmail' | 'vercel' | 'railway'

export interface OnboardingState {
  // Wizard
  wizardOpen: boolean
  currentStepIndex: number
  progress: OnboardingProgress
  showResumeBanner: boolean
  showTourOffer: boolean

  // Tour
  tourActive: boolean
  tourStepIndex: number

  // Wizard actions
  openWizard: () => void
  closeWizard: () => void
  setStepStatus: (id: OnboardingStepId | 'tour', status: OnboardingStepStatus) => void
  advanceStep: () => void
  goToStep: (index: number) => void
  skipWizard: () => void
  dismissBanner: () => void
  dismissTourOffer: () => void

  // Tour actions
  startTour: () => void
  advanceTour: () => void
  retreatTour: () => void
  endTour: () => void

  // Persistence
  loadProgress: () => Promise<void>
  saveProgress: () => Promise<void>
}

const STEP_ORDER: OnboardingStepId[] = ['profile', 'claude', 'gmail', 'vercel', 'railway']
const TOUR_STEPS_COUNT = 7

const DEFAULT_PROGRESS: OnboardingProgress = {
  profile: 'pending',
  claude: 'pending',
  gmail: 'pending',
  vercel: 'pending',
  railway: 'pending',
  tour: 'pending',
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  wizardOpen: false,
  currentStepIndex: 0,
  progress: { ...DEFAULT_PROGRESS },
  showResumeBanner: false,
  showTourOffer: false,
  tourActive: false,
  tourStepIndex: 0,

  openWizard: () => {
    const { progress } = get()
    const firstIncomplete = STEP_ORDER.findIndex((id) => progress[id] === 'pending')
    set({
      wizardOpen: true,
      currentStepIndex: firstIncomplete >= 0 ? firstIncomplete : 0,
      showResumeBanner: false,
    })
  },

  closeWizard: () => set({ wizardOpen: false }),

  setStepStatus: (id, status) => {
    const newProgress = { ...get().progress, [id]: status }
    set({ progress: newProgress })
    daemon.settings.setOnboardingProgress(newProgress).catch(() => {})
  },

  advanceStep: () => {
    const { currentStepIndex } = get()
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STEP_ORDER.length) {
      set({ currentStepIndex: nextIndex })
    } else {
      // All steps done — close wizard, offer tour
      set({ wizardOpen: false, showTourOffer: true })
    }
  },

  goToStep: (index) => set({ currentStepIndex: Math.max(0, Math.min(index, STEP_ORDER.length - 1)) }),

  skipWizard: () => {
    // Mark the current step as skipped so loadProgress() can distinguish a skip
    // from a fresh install — ensures the resume banner appears on next launch.
    const { currentStepIndex, progress } = get()
    const currentStepId = STEP_ORDER[currentStepIndex]
    const updatedProgress = { ...progress, [currentStepId]: 'skipped' as const }
    set({ wizardOpen: false, showResumeBanner: false, progress: updatedProgress })
    get().saveProgress()
  },

  dismissBanner: () => {
    set({ showResumeBanner: false })
    daemon.settings.setOnboardingComplete(true)
  },

  dismissTourOffer: () => {
    set({ showTourOffer: false })
    daemon.settings.setOnboardingComplete(true)
  },

  startTour: () => set({ tourActive: true, tourStepIndex: 0, showTourOffer: false }),

  advanceTour: () => {
    const { tourStepIndex } = get()
    if (tourStepIndex >= TOUR_STEPS_COUNT - 1) {
      get().endTour()
    } else {
      set({ tourStepIndex: tourStepIndex + 1 })
    }
  },

  retreatTour: () => set((s) => ({ tourStepIndex: Math.max(0, s.tourStepIndex - 1) })),

  endTour: () => {
    set({ tourActive: false, tourStepIndex: 0 })
    const state = get()
    state.setStepStatus('tour', 'complete')
    daemon.settings.setOnboardingComplete(true)
  },

  loadProgress: async () => {
    try {
      const [progressRes, completeRes] = await Promise.all([
        daemon.settings.getOnboardingProgress(),
        daemon.settings.isOnboardingComplete(),
      ])

      const isComplete = completeRes.ok && completeRes.data === true
      if (isComplete) return

      const progress = progressRes.ok && progressRes.data ? progressRes.data : { ...DEFAULT_PROGRESS }
      const hasIncomplete = STEP_ORDER.some((id) => progress[id] === 'pending')
      const hasAnyProgress = STEP_ORDER.some((id) => progress[id] !== 'pending')

      if (hasIncomplete && hasAnyProgress) {
        set({ progress, showResumeBanner: true })
      } else if (hasIncomplete && !hasAnyProgress) {
        set({ progress, wizardOpen: true, currentStepIndex: 0 })
      }
    } catch {
      // DB may not be ready — fall back to showing wizard
      set({ wizardOpen: true, currentStepIndex: 0 })
    }
  },

  saveProgress: async () => {
    const { progress } = get()
    await daemon.settings.setOnboardingProgress(progress).catch(() => {})
  },
}))

export { STEP_ORDER }
