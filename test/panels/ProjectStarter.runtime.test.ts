import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildDeterministicScaffold,
  buildPerpsPromptAddon,
  buildRuntimePreset,
  buildRuntimePrompt,
  PERPS_TEMPLATE_IDS,
  TEMPLATES,
  type Template,
} from '../../src/panels/ProjectStarter/ProjectStarter'

describe('ProjectStarter runtime preset helpers', () => {
  it('returns null when no wallet infrastructure settings are available', () => {
    expect(buildRuntimePreset(null)).toBeNull()
    expect(buildRuntimePrompt(null)).toBe('')
  })

  it('serializes the active DAEMON Solana runtime into a scaffold preset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:00.000Z'))

    const preset = buildRuntimePreset({
      rpcProvider: 'helius',
      quicknodeRpcUrl: '',
      customRpcUrl: '',
      swapProvider: 'jupiter',
      preferredWallet: 'wallet-standard',
      executionMode: 'jito',
      jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    })

    expect(preset).toEqual({
      version: 1,
      generatedBy: 'DAEMON',
      generatedAt: '2026-04-10T12:00:00.000Z',
      transport: {
        provider: 'helius',
        quicknodeRpcUrl: null,
        customRpcUrl: null,
      },
      wallet: {
        preferredWallet: 'wallet-standard',
      },
      execution: {
        mode: 'jito',
        jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
      },
      swaps: {
        provider: 'jupiter',
      },
    })

    vi.useRealTimers()
  })
})

describe('Perps template prompt addon', () => {
  const settings = {
    rpcProvider: 'helius' as const,
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter' as const,
    preferredWallet: 'phantom' as const,
    executionMode: 'jito' as const,
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  }

  it('exposes the four perps template ids', () => {
    expect(PERPS_TEMPLATE_IDS).toEqual([
      'perps-trading-bot',
      'perps-vault',
      'perps-frontend',
      'perps-liquidator',
    ])
  })

  it('returns empty string when settings are absent', () => {
    expect(buildPerpsPromptAddon('perps-trading-bot', null)).toBe('')
  })

  it('emits Helius + Sender + Jito wiring for the trading bot template', () => {
    const out = buildPerpsPromptAddon('perps-trading-bot', settings)
    expect(out).toContain('Perps architecture requirements:')
    expect(out).toContain('Helius RPC')
    expect(out).toContain('Helius Sender')
    expect(out).toContain('Jito')
    expect(out).toContain('Ranger SDK')
    expect(out).toContain('VENUE=drift|jupiter|ranger')
    expect(out).toContain('kill-switch')
  })

  it('emits Drift Vaults guidance for the vault template', () => {
    const out = buildPerpsPromptAddon('perps-vault', settings)
    expect(out).toContain('Drift Vaults SDK')
    expect(out).toContain('NAV')
    expect(out).toContain('Vitest')
  })

  it('emits server-proxy + LaserStream guidance for the frontend template', () => {
    const out = buildPerpsPromptAddon('perps-frontend', settings)
    expect(out).toContain('Phantom Connect SDK')
    expect(out).toContain('HELIUS_API_KEY never reaches the browser')
    expect(out).toContain('LaserStream')
    expect(out).toContain('Jupiter Perps')
  })

  it('emits Pyth refresh + profit guard guidance for the liquidator template', () => {
    const out = buildPerpsPromptAddon('perps-liquidator', settings)
    expect(out).toContain('Helius LaserStream')
    expect(out).toContain('Pyth price refresh')
    expect(out).toContain('MIN_PROFIT_USD')
    expect(out).toContain('Jito bundles')
  })

  it('falls back to common section for an unrecognized perps id', () => {
    const out = buildPerpsPromptAddon('perps-unknown', settings)
    expect(out).toContain('Perps architecture requirements:')
    expect(out).not.toContain('Drift Vaults SDK')
  })
})

describe('deterministic project scaffold', () => {
  function writeScaffoldToDisk(template: Template, projectName: string, root: string) {
    const scaffold = buildDeterministicScaffold(template, projectName)
    for (const dir of scaffold.dirs) {
      fs.mkdirSync(path.join(root, dir), { recursive: true })
    }
    for (const file of scaffold.files) {
      const target = path.join(root, file.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, file.content, 'utf8')
    }
    return scaffold
  }

  it('creates files and setup command without requiring an agent prompt', () => {
    const template: Template = {
      id: 'trading-bot',
      name: 'Trading Bot',
      description: 'Trading scaffold',
      tags: ['Bot'],
      icon: '',
      prompt: 'Scaffold a trading bot.',
    }

    const scaffold = buildDeterministicScaffold(template, 'My First Bot')
    expect(scaffold.files.some((file) => file.path === 'package.json' && file.content.includes('"name": "my-first-bot"'))).toBe(true)
    expect(scaffold.files.some((file) => file.path === 'src/index.ts')).toBe(true)
    expect(scaffold.files.some((file) => file.content.includes('claude --model'))).toBe(false)
  })

  it('writes the expected project structure to disk', () => {
    const template: Template = {
      id: 'perps-trading-bot',
      name: 'Perps Trading Bot',
      description: 'Perps scaffold',
      tags: ['Perps'],
      icon: '',
      prompt: 'Scaffold a Solana perps trading bot.',
    }
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-scaffold-'))

    try {
      writeScaffoldToDisk(template, 'PerpsTradingBotManualTest', root)

      expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'README.md'))).toBe(true)
      expect(fs.existsSync(path.join(root, '.env.example'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'src', 'index.ts'))).toBe(true)
      expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toContain('"name": "perpstradingbotmanualtest"')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each(TEMPLATES)('writes the %s template to disk', (template) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `daemon-${template.id}-`))

    try {
      const scaffold = writeScaffoldToDisk(template, `${template.id}-Smoke`, root)
      const filePaths = new Set(scaffold.files.map((file) => file.path))
      const allContent = scaffold.files.map((file) => file.content).join('\n')

      expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'README.md'))).toBe(true)
      expect(fs.existsSync(path.join(root, '.env.example'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'tsconfig.json'))).toBe(true)
      expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name).toBeTruthy()
      expect(allContent).not.toContain('claude --model')
      expect(allContent).not.toContain('dangerously-skip-permissions')

      if (template.id === 'anchor-program') {
        expect(filePaths.has('Anchor.toml')).toBe(true)
        expect([...filePaths].some((filePath) => filePath.startsWith('programs/') && filePath.endsWith('/src/lib.rs'))).toBe(true)
        expect([...filePaths].some((filePath) => filePath.startsWith('tests/') && filePath.endsWith('.test.ts'))).toBe(true)
      } else if (['dapp-nextjs', 'solana-foundation', 'perps-frontend'].includes(template.id)) {
        expect(filePaths.has('app/layout.tsx')).toBe(true)
        expect(filePaths.has('app/page.tsx')).toBe(true)
        expect(filePaths.has('app/globals.css')).toBe(true)
        expect(filePaths.has('next.config.mjs')).toBe(true)
        expect(fs.existsSync(path.join(root, 'app', 'page.tsx'))).toBe(true)
      } else {
        expect(filePaths.has('src/config.ts')).toBe(true)
        expect(filePaths.has('src/index.ts')).toBe(true)
        expect(filePaths.has('src/strategy.ts')).toBe(true)
        expect(fs.existsSync(path.join(root, 'src', 'index.ts'))).toBe(true)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
