import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detect } from '../../electron/services/SolanaDetector'

let tempDir: string | null = null

function makeProject(): string {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-solana-detector-'))
  return tempDir
}

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
  tempDir = null
})

describe('SolanaDetector', () => {
  it('builds a project runtime profile for Anchor workspaces', () => {
    const projectPath = makeProject()
    fs.mkdirSync(path.join(projectPath, 'programs', 'counter'), { recursive: true })
    fs.mkdirSync(path.join(projectPath, 'target', 'idl'), { recursive: true })
    fs.mkdirSync(path.join(projectPath, 'tests'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'Surfpool.toml'), '[network]\nslot_time = 400\n')
    fs.writeFileSync(path.join(projectPath, 'pnpm-lock.yaml'), '')
    fs.writeFileSync(path.join(projectPath, 'Anchor.toml'), `
[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[programs.localnet]
counter = "Cntr111111111111111111111111111111111111111"
`)
    fs.writeFileSync(path.join(projectPath, 'Cargo.toml'), `
[dependencies]
anchor-lang = "0.32"
litesvm = "0.6"
`)
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
      scripts: {
        build: 'anchor build',
        test: 'anchor test',
        deploy: 'anchor deploy',
      },
      dependencies: {
        '@coral-xyz/anchor': '^0.32.0',
      },
    }, null, 2))
    fs.writeFileSync(path.join(projectPath, 'target', 'idl', 'counter.json'), JSON.stringify({
      name: 'counter',
      address: 'Cntr111111111111111111111111111111111111111',
    }))

    const result = detect(projectPath)

    expect(result.isSolanaProject).toBe(true)
    expect(result.framework).toBe('anchor')
    expect(result.runtime.cluster).toBe('Localnet')
    expect(result.runtime.providerWallet).toBe('~/.config/solana/id.json')
    expect(result.runtime.packageManager).toBe('pnpm')
    expect(result.runtime.files.surfpoolToml).toBe(true)
    expect(result.runtime.programs).toContainEqual({
      name: 'counter',
      cluster: 'localnet',
      address: 'Cntr111111111111111111111111111111111111111',
      source: 'Anchor.toml',
    })
    expect(result.runtime.idls).toHaveLength(1)
    expect(result.runtime.scripts.map((script) => script.name)).toEqual(['build', 'test', 'deploy'])
    expect(result.runtime.tests).toEqual({ litesvm: true, anchorTests: true })
  })
})
