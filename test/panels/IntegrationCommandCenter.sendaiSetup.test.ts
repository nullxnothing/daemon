import { describe, expect, it } from 'vitest'
import {
  buildFirstSolanaAgentFile,
  createFirstAgentPlan,
  createSendAiSetupPlan,
  mergeEnvExample,
  normalizeProjectInstallCommand,
  parsePackageInfo,
  upsertPackageJsonScript,
} from '../../src/panels/IntegrationCommandCenter/sendaiSetup'

describe('SendAI Agent Kit setup planner', () => {
  it('detects package manager and only installs missing packages', () => {
    const packageInfo = parsePackageInfo(JSON.stringify({
      packageManager: 'pnpm@9.15.3',
      dependencies: {
        'solana-agent-kit': '^2.0.0',
        '@solana-agent-kit/plugin-token': '^2.0.0',
        '@solana/web3.js': '^1.98.0',
      },
      scripts: {
        test: 'vitest',
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
    expect(plan.installCommand).toContain('bs58')
    expect(plan.presentEnvKeys).toEqual(['RPC_URL'])
    expect(plan.missingEnvKeys).toContain('SOLANA_PRIVATE_KEY')
  })

  it('normalizes install commands for workspace roots and package managers', () => {
    expect(normalizeProjectInstallCommand(
      'pnpm add @lightprotocol/stateless.js @lightprotocol/compressed-token',
      { packageManager: 'pnpm', pnpmWorkspaceRoot: true },
    )).toBe('pnpm add -w @lightprotocol/stateless.js @lightprotocol/compressed-token')

    expect(normalizeProjectInstallCommand(
      'pnpm add -w @lightprotocol/stateless.js',
      { packageManager: 'pnpm', pnpmWorkspaceRoot: true },
    )).toBe('pnpm add -w @lightprotocol/stateless.js')

    expect(normalizeProjectInstallCommand(
      'pnpm add @lightprotocol/stateless.js',
      { packageManager: 'npm', pnpmWorkspaceRoot: true },
    )).toBe('npm install @lightprotocol/stateless.js')

    expect(normalizeProjectInstallCommand(
      'npx skills add sendaifun/skills',
      { packageManager: 'pnpm', pnpmWorkspaceRoot: true },
    )).toBe('npx skills add sendaifun/skills')
  })

  it('adds the pnpm workspace-root flag to generated setup installs', () => {
    const packageInfo = parsePackageInfo(JSON.stringify({
      packageManager: 'pnpm@9.15.3',
      dependencies: {},
    }))

    const plan = createSendAiSetupPlan({
      packageInfo,
      lockfiles: { pnpm: true },
      envKeys: new Set(),
      pnpmWorkspaceRoot: true,
    })

    expect(plan.installCommand).toContain('pnpm add -w solana-agent-kit')
  })

  it('merges env example placeholders without duplicating existing keys', () => {
    const merged = mergeEnvExample('RPC_URL=https://rpc.example\n')

    expect(merged).toContain('# SendAI Solana Agent Kit')
    expect(merged).toContain('OPENAI_API_KEY=replace_with_model_provider_key')
    expect(merged).toContain('SOLANA_PRIVATE_KEY=replace_with_devnet_wallet_private_key_or_use_daemon_wallet')
    expect(merged.match(/^RPC_URL=/gm)).toHaveLength(1)
  })

  it('builds a first-agent scaffold plan with a simple run command', () => {
    const packageInfo = parsePackageInfo(JSON.stringify({
      packageManager: 'pnpm@9.15.3',
      dependencies: {
        'solana-agent-kit': '^2.0.0',
        '@solana-agent-kit/plugin-token': '^2.0.0',
        '@solana-agent-kit/plugin-defi': '^2.0.0',
        '@solana-agent-kit/plugin-nft': '^2.0.0',
        '@solana-agent-kit/plugin-misc': '^2.0.0',
        '@solana-agent-kit/plugin-blinks': '^2.0.0',
        '@solana/web3.js': '^1.98.0',
        bs58: '^6.0.0',
      },
      scripts: {
        dev: 'vite',
      },
    }))

    const plan = createFirstAgentPlan({
      packageInfo,
      lockfiles: {},
      hasPackageJson: true,
      hasStarterFile: false,
    })

    expect(plan.canScaffold).toBe(true)
    expect(plan.canRun).toBe(false)
    expect(plan.runCommand).toBe('pnpm run agent:first-solana')
    expect(plan.scriptCommand).toBe('node src/agents/first-solana-agent.mjs')
  })

  it('updates package.json scripts without removing existing ones', () => {
    const next = upsertPackageJsonScript(
      JSON.stringify({
        name: 'demo-app',
        scripts: {
          dev: 'vite',
        },
      }),
      'agent:first-solana',
      'node src/agents/first-solana-agent.mjs',
    )

    const parsed = JSON.parse(next) as { scripts: Record<string, string> }
    expect(parsed.scripts.dev).toBe('vite')
    expect(parsed.scripts['agent:first-solana']).toBe('node src/agents/first-solana-agent.mjs')
  })

  it('creates a starter file that stays in safe, read-only territory by default', () => {
    const file = buildFirstSolanaAgentFile()

    expect(file).toContain("console.log('SendAI Solana agent is ready.')")
    expect(file).toContain('connection.getBalance(keypair.publicKey)')
    expect(file).toContain('Wallet balance:')
    expect(file).toContain('Object.keys(agent.methods ?? {}).sort()')
    expect(file).not.toContain('deployToken(')
    expect(file).not.toContain('trade(')
  })
})
