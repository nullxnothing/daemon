/**
 * Settings + integration tools: change settings, run integration checks,
 * enable/disable integrations.
 */
import * as SettingsService from '../../SettingsService'
import type { AriaTool } from '../AriaTool'

/** Boolean UI settings the model may flip via change_setting. */
const BOOL_SETTING_KEYS = new Set(['showMarketTape', 'showTitlebarWallet', 'lowPowerMode'])

export const settingsTools: AriaTool[] = [
  {
    name: 'change_setting',
    description: 'Change a DAEMON setting. Boolean keys: showMarketTape, showTitlebarWallet, lowPowerMode. Or set wallet infrastructure (cluster: devnet|testnet|mainnet-beta, rpcProvider: helius|quicknode|custom|public).',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        value: {},
        cluster: { type: 'string' },
        rpcProvider: { type: 'string' },
      },
    },
    async handler(input) {
      const key = String(input.key ?? '')
      if (BOOL_SETTING_KEYS.has(key)) {
        SettingsService.setBooleanSetting(key, Boolean(input.value))
        return { ok: true, summary: `Set ${key} = ${Boolean(input.value)}.` }
      }
      if (key === 'walletInfrastructure' || input.cluster || input.rpcProvider) {
        const current = SettingsService.getWalletInfrastructureSettings()
        const next = {
          ...current,
          ...(input.cluster ? { cluster: input.cluster as typeof current.cluster } : {}),
          ...(input.rpcProvider ? { rpcProvider: input.rpcProvider as typeof current.rpcProvider } : {}),
        }
        SettingsService.setWalletInfrastructureSettings(next)
        return { ok: true, summary: `Updated wallet infrastructure (${next.cluster} · ${next.rpcProvider}).` }
      }
      return { ok: false, summary: `Setting "${key}" is not changeable from ARIA.` }
    },
  },
  {
    name: 'run_integration_check',
    description: 'Run a read-only safe-check for an integration action id (e.g. check-helius-key). Read-only only.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { actionId: { type: 'string' } }, required: ['actionId'] },
    async handler(input, ctx) {
      const actionId = String(input.actionId ?? '')
      const data = await ctx.runUiEffect({ type: 'run_integration', actionId }, true)
      return { ok: true, summary: `Ran integration check ${actionId}.`, data }
    },
  },
  {
    name: 'enable_integration',
    description: 'Enable a DAEMON integration by id (e.g. helius, jupiter, sendai-agent-kit).',
    kind: 'edit',
    risk: 'write',
    input: { type: 'object', properties: { integrationId: { type: 'string' } }, required: ['integrationId'] },
    async handler(input, ctx) {
      const integrationId = String(input.integrationId ?? '')
      await ctx.runUiEffect({ type: 'set_integration_enabled', integrationId, enabled: true }, false)
      return { ok: true, summary: `Enabled ${integrationId}.`, uiEffect: { type: 'set_integration_enabled', integrationId, enabled: true } }
    },
  },
  {
    name: 'disable_integration',
    description: 'Disable a DAEMON integration by id.',
    kind: 'edit',
    risk: 'write',
    input: { type: 'object', properties: { integrationId: { type: 'string' } }, required: ['integrationId'] },
    async handler(input, ctx) {
      const integrationId = String(input.integrationId ?? '')
      await ctx.runUiEffect({ type: 'set_integration_enabled', integrationId, enabled: false }, false)
      return { ok: true, summary: `Disabled ${integrationId}.`, uiEffect: { type: 'set_integration_enabled', integrationId, enabled: false } }
    },
  },
]
