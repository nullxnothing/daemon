import { describe, expect, it } from 'vitest'
import { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } from 'bigint-buffer'

describe('bigint-buffer workspace shim', () => {
  it('round-trips fixed-width bigints without native bindings', () => {
    const value = 0x0102030405060708n

    expect(toBufferBE(value, 8).toString('hex')).toBe('0102030405060708')
    expect(toBufferLE(value, 8).toString('hex')).toBe('0807060504030201')
    expect(toBigIntBE(Buffer.from('0102030405060708', 'hex'))).toBe(value)
    expect(toBigIntLE(Buffer.from('0807060504030201', 'hex'))).toBe(value)
  })

  it('rejects invalid buffers instead of entering native code', () => {
    expect(() => toBigIntLE(null as unknown as Buffer)).toThrow(TypeError)
    expect(() => toBigIntBE(undefined as unknown as Buffer)).toThrow(TypeError)
  })
})
