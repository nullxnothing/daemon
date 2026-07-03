import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  settings: {
    markFunnelStep: vi.fn().mockResolvedValue({ ok: true, data: { marked: true } }),
    getFunnel: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  },
}))

vi.stubGlobal('window', { daemon: bridge })

import { FIRST_MISSION_PROMPT, getFunnel, isFirstMissionPending, markFunnelStep } from '../../src/lib/firstMission'

describe('FIRST_MISSION_PROMPT contract', () => {
  it('scripts the read tools, the single write, and the explicit engine ban', () => {
    expect(FIRST_MISSION_PROMPT).toContain('read_project_status')
    expect(FIRST_MISSION_PROMPT).toContain('read_wallet')
    expect(FIRST_MISSION_PROMPT).toContain('remember_fact')
    expect(FIRST_MISSION_PROMPT).toContain('Do not call run_engine_action')
    expect(FIRST_MISSION_PROMPT).toContain('Do not call any other write or run tool')
  })

  it('asks for the cluster to be named out loud (the devnet beat)', () => {
    expect(FIRST_MISSION_PROMPT).toMatch(/devnet or mainnet/)
  })

  it('never references mainnet-only or money tools', () => {
    expect(FIRST_MISSION_PROMPT).not.toMatch(/swap|transfer|airdrop|send_sol/i)
  })
})

describe('funnel helpers', () => {
  beforeEach(() => {
    bridge.settings.markFunnelStep.mockClear()
    bridge.settings.getFunnel.mockResolvedValue({ ok: true, data: {} })
  })

  it('markFunnelStep fires the IPC without awaiting it', () => {
    markFunnelStep('mission_started')
    expect(bridge.settings.markFunnelStep).toHaveBeenCalledWith('mission_started')
  })

  it('markFunnelStep swallows IPC rejections', () => {
    bridge.settings.markFunnelStep.mockRejectedValueOnce(new Error('db locked'))
    expect(() => markFunnelStep('wizard_opened')).not.toThrow()
  })

  it('getFunnel returns the record on success and null on failure', async () => {
    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: true, data: { app_first_launch: 123 } })
    expect(await getFunnel()).toEqual({ app_first_launch: 123 })

    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: false, error: 'nope' })
    expect(await getFunnel()).toBeNull()
  })

  it('isFirstMissionPending is true before any decision and false after either one', async () => {
    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: true, data: { mission_started: 1 } })
    expect(await isFirstMissionPending()).toBe(true)

    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: true, data: { approval_rejected: 2 } })
    expect(await isFirstMissionPending()).toBe(false)

    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: true, data: { approval_approved: 2 } })
    expect(await isFirstMissionPending()).toBe(false)
  })

  it('isFirstMissionPending fails closed when the funnel is unreadable', async () => {
    bridge.settings.getFunnel.mockResolvedValueOnce({ ok: false, error: 'nope' })
    expect(await isFirstMissionPending()).toBe(false)
  })
})
