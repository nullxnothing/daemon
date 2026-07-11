import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ projects: [] as Array<{ path: string }> }))
vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: () => ({ all: () => mocks.projects }) }),
}))

import { detectMemeTechArchetype } from '../../electron/services/meme-studio/ArchetypeDetector'

const roots: string[] = []

async function fixture(name: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `daemon-meme-${name}-`))
  roots.push(root)
  mocks.projects.push({ path: root })
  return root
}

afterEach(async () => {
  mocks.projects.length = 0
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('Meme Tech archetype detector', () => {
  it('classifies a market only when multiple operational signals exist', async () => {
    const root = await fixture('market')
    await mkdir(path.join(root, 'services', 'indexer'), { recursive: true })
    await mkdir(path.join(root, 'services', 'keeper'), { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { '@solana/web3.js': '1', '@solana/spl-token': '1' } }))
    await writeFile(path.join(root, 'services', 'indexer', 'package.json'), JSON.stringify({ scripts: { backfill: 'indexer backfill checkpoint websocket' } }))
    await writeFile(path.join(root, 'services', 'keeper', 'package.json'), JSON.stringify({ scripts: { start: 'oracle keeper crank liquidation' } }))

    const result = await detectMemeTechArchetype(root)

    expect(result.archetype).toBe('permissionless-market-indexer')
    expect(result.topology).toEqual(expect.arrayContaining(['indexer', 'keeper']))
    expect(result.evidence.map((item) => item.path)).not.toContain('.env')
  })

  it('does not treat a single dependency as a high-confidence product', async () => {
    const root = await fixture('thin')
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { phaser: '3' } }))

    const result = await detectMemeTechArchetype(root)

    expect(result.archetype).toBe('unknown')
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('does not trust an explicit archetype without supporting topology', async () => {
    const root = await fixture('spoofed')
    await writeFile(path.join(root, 'daemon.meme-tech.json'), JSON.stringify({ archetype: 'permissionless-market-indexer', tokenMint: '11111111111111111111111111111111' }))

    const result = await detectMemeTechArchetype(root)

    expect(result.archetype).toBe('unknown')
    expect(result.tokenMints).toEqual(['11111111111111111111111111111111'])
  })

  it('rejects unregistered project roots', async () => {
    const root = await fixture('unregistered')
    mocks.projects.length = 0
    await expect(detectMemeTechArchetype(root)).rejects.toThrow('not registered')
  })

  it('ignores candidate files that resolve outside the registered root', async () => {
    const root = await fixture('symlink-root')
    const outside = await mkdtemp(path.join(os.tmpdir(), 'daemon-meme-outside-'))
    roots.push(outside)
    const outsidePackage = path.join(outside, 'package.json')
    await writeFile(outsidePackage, JSON.stringify({ dependencies: { phaser: '3', '@coral-xyz/anchor': '1' } }))
    await symlink(outsidePackage, path.join(root, 'package.json'), 'file')

    const result = await detectMemeTechArchetype(root)

    expect(result.archetype).toBe('unknown')
    expect(result.evidence).toEqual([])
  })
})
