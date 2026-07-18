/**
 * IDE implementation of the ARIA host port. Installed once from src/main.tsx;
 * carries the useUIStore / terminal / ui-effect couplings so store/aria.ts
 * stays shell-agnostic and Lite bundles never pull IDE stores.
 */
import { useUIStore } from './ui'
import { useAppActions } from './appActions'
import { buildAriaSnapshot } from '../lib/ariaContext'
import { applyUiEffect, runUiEffectWithData } from '../lib/ariaUiEffects'
import { daemon } from '../lib/daemonBridge'
import type { AriaHost, AriaHostProviderId } from './ariaHost'

async function openProviderLoginTerminal(provider: AriaHostProviderId): Promise<string> {
  const ui = useUIStore.getState()
  if (!ui.activeProjectId || !ui.activeProjectPath) {
    throw new Error('Open a project before launching a login terminal.')
  }
  const startupCommand = provider === 'codex' ? 'codex login' : 'claude'
  const res = await daemon.terminal.create({
    cwd: ui.activeProjectPath,
    startupCommand,
    userInitiated: true,
  })
  if (!res.ok || !res.data) throw new Error(res.error ?? 'Login terminal did not start')
  ui.setCenterMode('canvas')
  ui.addTerminal(ui.activeProjectId, res.data.id, provider === 'codex' ? 'Codex Login' : 'Claude Login', res.data.agentId)
  useAppActions.getState().focusTerminal()
  return `Opened ${provider} login terminal. Complete sign-in, then Verify.`
}

export const ideAriaHost: AriaHost = {
  activeProjectId: () => useUIStore.getState().activeProjectId ?? null,
  buildSnapshot: buildAriaSnapshot,
  applyUiEffect,
  runUiEffectWithData,
  openProviderLoginTerminal,
}
