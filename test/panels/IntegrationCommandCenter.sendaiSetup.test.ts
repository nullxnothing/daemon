import { describe, expect, it } from 'vitest'
import {
  createSendAiSetupPlan,
  mergeEnvExample,
  parsePackageInfo,
} from '../../src/panels/IntegrationCommandCenter/sendaiSetup'

describe('SendAI Agent Kit setup planner', () => {
  it('detects package manager and only installs missing packages', () => {
    const packageInfo = parsePackageInfo(JSON.stringify({
      packageManager: 'pnpm@9.15.3',
      dependencies: {
        'solana-agent-kit': '^2.0.0',
        '@solana-agent-kit/plugin-token': '^2.0.0',
      },
    }))

    const plan = createSendAiSetupPlan({
      packageInfo,
      lockfiles: {},
      envKeys: new Set(['RPC_URL']),
    })

    expect(plan.packageManager).toBe('pnpm')
    expect(plan.installCommand).toContain('pnpm add @solana-agent-kit/plugin-defi')
    expect(plan.installCommand).not.toContain('pnpm add solana-agent-kit')
    expect(plan.presentEnvKeys).toEqual(['RPC_URL'])
    expect(plan.missingEnvKeys).toContain('SOLANA_PRIVATE_KEY')
  })

  it('merges env example placeholders without duplicating existing keys', () => {
    const merged = mergeEnvExample('RPC_URL=https://rpc.example\n')

    expect(merged).toContain('# SendAI Solana Agent Kit')
    expect(merged).toContain('OPENAI_API_KEY=replace_with_model_provider_key')
    expect(merged).toContain('SOLANA_PRIVATE_KEY=replace_with_devnet_wallet_private_key_or_use_daemon_wallet')
    expect(merged.match(/^RPC_URL=/gm)).toHaveLength(1)
  })
})
