import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
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
      cluster: 'devnet',
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
        cluster: 'devnet',
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
    cluster: 'devnet' as const,
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
      } else if (['dapp-nextjs', 'solana-foundation', 'perps-frontend', 'meme-coin-website'].includes(template.id)) {
        expect(filePaths.has('app/layout.tsx')).toBe(true)
        expect(filePaths.has('app/page.tsx')).toBe(true)
        expect(filePaths.has('app/globals.css')).toBe(true)
        expect(filePaths.has('next.config.mjs')).toBe(true)
        expect(JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8')).compilerOptions.moduleResolution).toBe('bundler')
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

  it('writes meme coin website token metadata and placeholders', () => {
    const template = TEMPLATES.find((item) => item.id === 'meme-coin-website')
    expect(template).toBeTruthy()

    const scaffold = buildDeterministicScaffold(template!, 'DemoMeme', {
      memeSettings: {
        tokenName: 'Demo Meme',
        ticker: 'DEMO',
        contractAddress: 'Demo111111111111111111111111111111111111',
        tagline: 'High signal, low seriousness.',
        xUrl: 'https://x.com/demo',
        telegramUrl: 'https://t.me/demo',
        chartUrl: 'https://dexscreener.com/solana/demo',
        buyUrl: 'https://jup.ag/swap/SOL-DEMO',
        logoAssetPath: '',
        heroAssetPath: '',
        logoFileName: 'brand-mark.svg',
        heroFileName: 'hero-poster.svg',
      },
    })

    const byPath = new Map(scaffold.files.map((file) => [file.path, file.content]))
    expect(byPath.get('src/token-site.ts')).toContain('Demo Meme')
    expect(byPath.get('src/token-site.ts')).toContain('Demo111111111111111111111111111111111111')
    expect(byPath.has('public/assets/brand-mark.svg')).toBe(true)
    expect(byPath.has('public/assets/hero-poster.svg')).toBe(true)
    expect(byPath.get('app/page.tsx')).toContain('CopyCaButton')
    expect(byPath.get('app/page.tsx')).toContain('TokenImage')
    expect(byPath.get('app/globals.css')).toContain('min(760px')
    expect(byPath.get('app/globals.css')).toContain('.hero-copy')
    expect(byPath.get('src/token-site.ts')).toContain('tokenMetadataImageSrc')
    expect(byPath.get('src/token-site.ts')).toContain('[tokenMetadataImageSrc, localLogoSrc]')
    expect(JSON.parse(byPath.get('tsconfig.json') ?? '{}').compilerOptions.moduleResolution).toBe('bundler')
    expect(byPath.get('next.config.mjs')).toContain('outputFileTracingRoot')

    for (const filePath of ['src/token-site.ts', 'app/CopyCaButton.tsx', 'app/TokenImage.tsx', 'app/layout.tsx', 'app/page.tsx']) {
      const transpiled = ts.transpileModule(byPath.get(filePath) ?? '', {
        fileName: filePath,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        reportDiagnostics: true,
      })
      expect(transpiled.diagnostics ?? []).toEqual([])
    }
  })

  it('creates meme coin asset directories when uploaded assets replace placeholders', () => {
    const template = TEMPLATES.find((item) => item.id === 'meme-coin-website')
    expect(template).toBeTruthy()

    const scaffold = buildDeterministicScaffold(template!, 'UploadedMeme', {
      memeSettings: {
        tokenName: 'Uploaded Meme',
        ticker: 'UPLOAD',
        contractAddress: 'Upload111111111111111111111111111111111',
        tagline: 'Assets copied from the setup wizard.',
        xUrl: '#',
        telegramUrl: '#',
        chartUrl: '#',
        buyUrl: '#',
        logoAssetPath: 'C:\\Users\\offic\\Pictures\\logo.png',
        heroAssetPath: 'C:\\Users\\offic\\Pictures\\hero.webp',
        logoFileName: 'logo.png',
        heroFileName: 'hero.webp',
      },
    })

    const filePaths = new Set(scaffold.files.map((file) => file.path))
    expect(scaffold.dirs).toContain('public/assets')
    expect(filePaths.has('public/assets/logo.png')).toBe(false)
    expect(filePaths.has('public/assets/hero.webp')).toBe(false)
    expect(filePaths.has('public/assets/brand-mark.svg')).toBe(true)
    expect(filePaths.has('public/assets/hero-poster.svg')).toBe(true)
    expect(scaffold.files.find((file) => file.path === 'src/token-site.ts')?.content).toContain('/assets/logo.png')
    expect(scaffold.files.find((file) => file.path === 'src/token-site.ts')?.content).toContain('/assets/hero.webp')
    expect(scaffold.files.find((file) => file.path === 'src/token-site.ts')?.content).toContain('[localLogoSrc, tokenMetadataImageSrc, fallbackLogoSrc]')
  })
})
