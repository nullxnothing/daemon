import { describe, expect, it } from 'vitest'
import {
  RECEIPT_SPEC,
  buildReceipt,
  canonicalJson,
  receiptContentHash,
  memoPayload,
  type ReceiptRecord,
} from '../../electron/services/receipts/receiptBuilder'

const BASE: ReceiptRecord = {
  source: 'aria',
  agentId: 'read_file',
  actionType: 'tool.write',
  summary: 'wrote a file',
  cluster: 'devnet',
  verdict: 'approved',
  riskTier: 'write',
  executionTxSignature: null,
  operator: null,
  timestamp: 1_700_000_000_000,
}

describe('buildReceipt', () => {
  it('produces the canonical receipt shape', () => {
    const receipt = buildReceipt(BASE)
    expect(receipt).toEqual({
      spec: RECEIPT_SPEC,
      source: 'aria',
      agent: { id: 'read_file' },
      action: { type: 'tool.write', summary: 'wrote a file' },
      cluster: 'devnet',
      policy: { verdict: 'approved', riskTier: 'write' },
      executionTxSignature: null,
      operator: null,
      timestamp: new Date(1_700_000_000_000).toISOString(),
    })
  })

  it('sanitizes and length-caps the summary (no PII leakage vector)', () => {
    const long = 'x'.repeat(500)
    const receipt = buildReceipt({ ...BASE, summary: `line one\n\tline   two ${long}` })
    expect(receipt.action.summary.length).toBe(200)
    expect(receipt.action.summary).not.toContain('\n')
    expect(receipt.action.summary).not.toContain('\t')
  })

  it('never carries fields beyond the whitelisted shape', () => {
    const receipt = buildReceipt(BASE)
    // The only keys allowed on-chain-adjacent — no prompt/file/key fields.
    expect(Object.keys(receipt).sort()).toEqual(
      ['action', 'agent', 'cluster', 'executionTxSignature', 'operator', 'policy', 'source', 'spec', 'timestamp'],
    )
  })
})

describe('canonicalJson + receiptContentHash', () => {
  it('is deterministic regardless of key insertion order', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { y: 1, x: 2 } })
    const b = canonicalJson({ c: { x: 2, y: 1 }, a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('hashes identical receipts to the same digest', () => {
    const h1 = receiptContentHash(buildReceipt(BASE))
    const h2 = receiptContentHash(buildReceipt({ ...BASE }))
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes the digest when any attested field changes', () => {
    const base = receiptContentHash(buildReceipt(BASE))
    expect(receiptContentHash(buildReceipt({ ...BASE, cluster: 'mainnet-beta' }))).not.toBe(base)
    expect(receiptContentHash(buildReceipt({ ...BASE, verdict: 'rejected' }))).not.toBe(base)
    expect(receiptContentHash(buildReceipt({ ...BASE, executionTxSignature: 'sig123' }))).not.toBe(base)
  })
})

describe('memoPayload', () => {
  it('carries only the hash, never receipt contents', () => {
    const hash = 'a'.repeat(64)
    expect(memoPayload(hash)).toBe(`DAEMON-RECEIPT v1 sha256=${hash}`)
  })
})
