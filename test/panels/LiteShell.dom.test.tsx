// @vitest-environment happy-dom

import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LiteApp from '../../src/lite/LiteApp'
import { LiteOnboarding } from '../../src/lite/LiteOnboarding'
import { useAriaStore } from '../../src/store/aria'

let onboardingComplete = false
let storeKey: ReturnType<typeof vi.fn>
let verifyAll: ReturnType<typeof vi.fn>
let setOnboardingComplete: ReturnType<typeof vi.fn>

function installBridge() {
  storeKey = vi.fn().mockResolvedValue({ ok: true })
  verifyAll = vi.fn().mockResolvedValue({ ok: true, data: { claude: null, codex: null } })
  setOnboardingComplete = vi.fn((v: boolean) => {
    onboardingComplete = v
    return Promise.resolve({ ok: true })
  })
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      platform: 'win32',
      lite: {
        isOnboardingComplete: vi.fn(() => Promise.resolve({ ok: true, data: onboardingComplete })),
        setOnboardingComplete,
        getShowTools: vi.fn().mockResolvedValue({ ok: true, data: false }),
        setShowTools: vi.fn().mockResolvedValue({ ok: true }),
        getFlavorInfo: vi.fn().mockResolvedValue({ ok: true, data: { flavor: 'lite', version: '4.7.0', ideInstalled: false } }),
        openInIde: vi.fn().mockResolvedValue({ ok: true, data: { launched: false } }),
        popoutOpen: vi.fn().mockResolvedValue({ ok: true, data: { opened: true } }),
      },
      claude: {
        storeKey,
        listKeys: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        deleteKey: vi.fn().mockResolvedValue({ ok: true }),
      },
      provider: {
        verifyAll,
        getPreferences: vi.fn().mockResolvedValue({ ok: true, data: null }),
      },
      shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
      aria: {
        send: vi.fn().mockResolvedValue({ ok: true, data: { text: 'ok' } }),
        history: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        clear: vi.fn().mockResolvedValue({ ok: true }),
        models: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        approve: vi.fn(),
        patchDecision: vi.fn(),
        toolEffectResult: vi.fn(),
        onToolEvent: () => () => {},
        onUiEffect: () => () => {},
        sessions: {
          list: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 's1', title: 'First chat', project_id: null, created_at: 1, updated_at: Date.now(), archived: 0 }] }),
          create: vi.fn().mockResolvedValue({ ok: true, data: { id: 's2', title: null, project_id: null, created_at: 1, updated_at: Date.now(), archived: 0 } }),
          rename: vi.fn().mockResolvedValue({ ok: true }),
          archive: vi.fn().mockResolvedValue({ ok: true }),
          delete: vi.fn().mockResolvedValue({ ok: true }),
        },
      },
      memory: {
        approve: vi.fn().mockResolvedValue({ ok: true }),
        reject: vi.fn().mockResolvedValue({ ok: true }),
      },
      wallet: {
        dashboard: vi.fn().mockResolvedValue({ ok: true, data: { heliusConfigured: false, market: [], portfolio: { totalUsd: 0, delta24hUsd: 0, delta24hPct: 0, walletCount: 0 }, wallets: [], activeWallet: null, feed: [], recentActivity: [] } }),
        create: vi.fn().mockResolvedValue({ ok: true }),
        setDefault: vi.fn().mockResolvedValue({ ok: true }),
        searchJupiterTokens: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      forensics: {
        scan: vi.fn().mockResolvedValue({ ok: false, error: 'Helius API key not configured' }),
      },
    },
  })
}

describe('DAEMON Lite shell', () => {
  beforeEach(() => {
    onboardingComplete = false
    installBridge()
    useAriaStore.setState({ turns: [], isLoading: false, sessionId: 'global', sessions: [], availableModels: [] })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('gates on onboarding when the first-run flag is unset', async () => {
    render(<LiteApp />)
    expect(await screen.findByText('Your AI coding agent.')).toBeTruthy()
    expect(screen.queryByText('New Agent')).toBeNull()
  })

  it('renders the home shell (sidebar, composer, quick actions) once onboarded', async () => {
    onboardingComplete = true
    render(<LiteApp />)
    expect(await screen.findByText('New Agent')).toBeTruthy()
    expect(await screen.findByText('Explain code')).toBeTruthy()
    expect(screen.getByPlaceholderText(/Ask anything/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('First chat')).toBeTruthy())
  })

  it('quick actions prefill the composer', async () => {
    onboardingComplete = true
    render(<LiteApp />)
    fireEvent.click(await screen.findByText('Debug an error'))
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Ask anything/) as HTMLTextAreaElement
      expect(input.value).toContain('Help me debug this error')
    })
  })

  it('opens settings from the sidebar gear', async () => {
    onboardingComplete = true
    render(<LiteApp />)
    fireEvent.click(await screen.findByLabelText('Settings'))
    expect(await screen.findByText('API keys')).toBeTruthy()
  })

  it('reveals the Tools section and routes to the Scanner panel', async () => {
    onboardingComplete = true
    render(<LiteApp />)
    // Tools is collapsed by default (getShowTools → false).
    fireEvent.click(await screen.findByText('Tools'))
    fireEvent.click(await screen.findByText('Scanner'))
    expect(await screen.findByText(/check authorities, snipers, and bundles/)).toBeTruthy()
  })
})

describe('DAEMON Lite onboarding', () => {
  beforeEach(() => {
    onboardingComplete = false
    installBridge()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('rejects a malformed Anthropic key without storing it', async () => {
    const onDone = vi.fn()
    render(<LiteOnboarding onDone={onDone} />)
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'not-a-key' } })
    fireEvent.click(screen.getByText('Start chatting'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(storeKey).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('stores the key, verifies, flags completion, and finishes', async () => {
    const onDone = vi.fn()
    render(<LiteOnboarding onDone={onDone} />)
    fireEvent.change(screen.getByPlaceholderText('sk-ant-…'), { target: { value: 'sk-ant-test-123' } })
    fireEvent.click(screen.getByText('Start chatting'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(storeKey).toHaveBeenCalledWith('ANTHROPIC_API_KEY', 'sk-ant-test-123')
    expect(verifyAll).toHaveBeenCalled()
    expect(setOnboardingComplete).toHaveBeenCalledWith(true)
  })

  it('GLM path stores under ZAI_API_KEY without format gating', async () => {
    const onDone = vi.fn()
    render(<LiteOnboarding onDone={onDone} />)
    fireEvent.click(screen.getByText('GLM (Z.AI)'))
    fireEvent.change(screen.getByPlaceholderText('Paste your Z.AI key'), { target: { value: 'zai-key-1' } })
    fireEvent.click(screen.getByText('Start chatting'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(storeKey).toHaveBeenCalledWith('ZAI_API_KEY', 'zai-key-1')
  })
})
