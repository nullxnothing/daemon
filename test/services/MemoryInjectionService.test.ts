import { describe, expect, it } from 'vitest'
import { buildBundle } from '../../electron/services/MemoryInjectionService'
import type { ProjectMemory } from '../../electron/shared/types'

function mem(p: Partial<ProjectMemory>): ProjectMemory {
  return {
    id: p.id ?? `m_${Math.random()}`,
    projectId: 'p1',
    scope: 'project',
    kind: p.kind ?? 'command',
    title: p.title ?? 't',
    value: p.value ?? 'v',
    sourceType: p.sourceType ?? 'manual',
    sourceRef: 'r',
    confidence: p.confidence ?? 0.5,
    status: p.status ?? 'approved',
    privacyClass: p.privacyClass ?? 'project_code',
    tags: [],
    createdBy: 'extractor',
    approvedBy: 'user',
    lastUsedAt: null,
    expiresAt: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('MemoryInjectionService.buildBundle', () => {
  it('orders constraints and do_not_touch before commands and summary', () => {
    const bundle = buildBundle([
      mem({ id: 'summary', kind: 'project_summary', value: 'a workbench' }),
      mem({ id: 'cmd', kind: 'test_command', value: 'pnpm test' }),
      mem({ id: 'dnt', kind: 'do_not_touch', value: 'schema.ts' }),
      mem({ id: 'con', kind: 'constraint', value: 'use pnpm' }),
    ])
    const order = bundle.usedMemoryIds
    expect(order.indexOf('con')).toBeLessThan(order.indexOf('cmd'))
    expect(order.indexOf('dnt')).toBeLessThan(order.indexOf('cmd'))
    expect(order.indexOf('cmd')).toBeLessThan(order.indexOf('summary'))
  })

  it('excludes secret privacy classes even if marked approved', () => {
    const bundle = buildBundle([
      mem({ id: 'ok', kind: 'package_manager', value: 'pnpm' }),
      mem({ id: 'leak', kind: 'security_note', value: 'token', privacyClass: 'env_secret' }),
      mem({ id: 'wallet', kind: 'wallet_context', value: 'seed', privacyClass: 'wallet_secret' }),
    ])
    expect(bundle.usedMemoryIds).toContain('ok')
    expect(bundle.usedMemoryIds).not.toContain('leak')
    expect(bundle.usedMemoryIds).not.toContain('wallet')
  })

  it('excludes non-approved memories', () => {
    const bundle = buildBundle([
      mem({ id: 'sug', kind: 'command', value: 'x', status: 'suggested' }),
      mem({ id: 'app', kind: 'command', value: 'y', status: 'approved' }),
    ])
    expect(bundle.usedMemoryIds).toEqual(['app'])
  })

  it('truncates to the char budget', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      mem({ id: `m${i}`, kind: 'command', value: 'x'.repeat(40) }),
    )
    const bundle = buildBundle(many, 200)
    expect(bundle.totalChars).toBeLessThanOrEqual(200 + 50) // + header/footer slack
    expect(bundle.usedMemoryIds.length).toBeLessThan(50)
  })

  it('returns an empty block when nothing qualifies', () => {
    const bundle = buildBundle([mem({ status: 'suggested' })])
    expect(bundle.block).toBe('')
    expect(bundle.usedMemoryIds).toEqual([])
  })

  it('wraps output in the DAEMON MEMORY markers', () => {
    const bundle = buildBundle([mem({ kind: 'package_manager', value: 'pnpm' })])
    expect(bundle.block).toContain('--- DAEMON MEMORY ---')
    expect(bundle.block).toContain('--- END DAEMON MEMORY ---')
    expect(bundle.block).toContain('pnpm')
  })
})
