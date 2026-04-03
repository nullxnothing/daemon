import { describe, it, expect, beforeEach } from 'vitest'
import { ValidationService } from '../../electron/services/ValidationService'

// Reset internal rate limit map between tests by re-importing a fresh instance
// ValidationService is a singleton — we test the rate limit across calls in sequence

describe('validateString', () => {
  it('passes a valid string within bounds', () => {
    const result = ValidationService.validateString('hello', 1, 100)
    expect(result.success).toBe(true)
    expect(result.data).toBe('hello')
  })

  it('fails when value is not a string', () => {
    const result = ValidationService.validateString(42 as any, 1, 100)
    expect(result.success).toBe(false)
    expect(result.errors).toContain('Expected string')
  })

  it('fails when string is too short', () => {
    const result = ValidationService.validateString('ab', 5, 100)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/too short/i)
  })

  it('fails when string is too long', () => {
    const result = ValidationService.validateString('a'.repeat(101), 1, 100)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/too long/i)
  })

  it('fails when pattern does not match', () => {
    const result = ValidationService.validateString('hello world!', 1, 100, /^[a-z]+$/)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/pattern/i)
  })

  it('passes when pattern matches', () => {
    const result = ValidationService.validateString('helloworld', 1, 100, /^[a-z]+$/)
    expect(result.success).toBe(true)
  })

  it('uses default minLength of 1 — empty string fails', () => {
    const result = ValidationService.validateString('')
    expect(result.success).toBe(false)
  })
})

describe('validateNumber', () => {
  it('passes a valid number', () => {
    const result = ValidationService.validateNumber(42, 0, 100)
    expect(result.success).toBe(true)
    expect(result.data).toBe(42)
  })

  it('fails when value is not a number', () => {
    const result = ValidationService.validateNumber('42' as any)
    expect(result.success).toBe(false)
    expect(result.errors).toContain('Expected number')
  })

  it('fails when below minimum', () => {
    const result = ValidationService.validateNumber(-1, 0, 100)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/minimum/i)
  })

  it('fails when above maximum', () => {
    const result = ValidationService.validateNumber(101, 0, 100)
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/maximum/i)
  })

  it('fails when integer expected but float given', () => {
    const result = ValidationService.validateNumber(1.5, 0, 10, true)
    expect(result.success).toBe(false)
    expect(result.errors).toContain('Expected integer')
  })

  it('passes integer check when value is whole', () => {
    const result = ValidationService.validateNumber(5, 0, 10, true)
    expect(result.success).toBe(true)
  })
})

describe('validateFilePath', () => {
  it('accepts a valid nested path within base dir', () => {
    const result = ValidationService.validateFilePath('src/index.ts', '/projects/myapp')
    expect(result.success).toBe(true)
  })

  it('rejects path containing ..', () => {
    const result = ValidationService.validateFilePath('../etc/passwd', '/projects/myapp')
    expect(result.success).toBe(false)
    expect(result.errors![0]).toMatch(/traversal/i)
  })

  it('rejects path that escapes base directory after resolution', () => {
    // Even without .., an absolute path outside the base should fail
    const result = ValidationService.validateFilePath('/etc/passwd', '/projects/myapp')
    expect(result.success).toBe(false)
  })
})

describe('checkRateLimit', () => {
  // Use unique identifiers per test to avoid cross-test contamination
  it('allows requests within the limit', () => {
    const id = `test-rl-${Date.now()}-1`
    expect(ValidationService.checkRateLimit(id, 3, 60_000)).toBe(true)
    expect(ValidationService.checkRateLimit(id, 3, 60_000)).toBe(true)
    expect(ValidationService.checkRateLimit(id, 3, 60_000)).toBe(true)
  })

  it('blocks the request that exceeds the limit', () => {
    const id = `test-rl-${Date.now()}-2`
    ValidationService.checkRateLimit(id, 2, 60_000)
    ValidationService.checkRateLimit(id, 2, 60_000)
    const result = ValidationService.checkRateLimit(id, 2, 60_000)
    expect(result).toBe(false)
  })

  it('allows a single request when limit is 1', () => {
    const id = `test-rl-${Date.now()}-3`
    expect(ValidationService.checkRateLimit(id, 1, 60_000)).toBe(true)
  })

  it('blocks second request when limit is 1', () => {
    const id = `test-rl-${Date.now()}-4`
    ValidationService.checkRateLimit(id, 1, 60_000)
    expect(ValidationService.checkRateLimit(id, 1, 60_000)).toBe(false)
  })

  it('treats different identifiers independently', () => {
    const base = Date.now()
    const idA = `test-rl-${base}-a`
    const idB = `test-rl-${base}-b`
    ValidationService.checkRateLimit(idA, 1, 60_000)
    // idB has not been used — should still pass
    expect(ValidationService.checkRateLimit(idB, 1, 60_000)).toBe(true)
  })

  it('expires old timestamps outside the window (using window of 0ms)', () => {
    const id = `test-rl-${Date.now()}-5`
    // A 0ms window means all previous timestamps are already expired
    // Each call to checkRateLimit with window=0 sees no recent entries
    expect(ValidationService.checkRateLimit(id, 1, 0)).toBe(true)
    expect(ValidationService.checkRateLimit(id, 1, 0)).toBe(true)
  })
})

describe('validateObject', () => {
  it('passes a valid object matching schema', () => {
    const result = ValidationService.validateObject(
      { name: 'Agent', port: 3000 },
      {
        name: { type: 'string', required: true, minLength: 1 },
        port: { type: 'number', min: 1024, max: 65535 },
      }
    )
    expect(result.success).toBe(true)
  })

  it('fails when required field is missing', () => {
    const result = ValidationService.validateObject(
      { port: 3000 },
      { name: { type: 'string', required: true } }
    )
    expect(result.success).toBe(false)
    expect(result.errors!.some((e) => e.includes('name'))).toBe(true)
  })

  it('fails when field type is wrong', () => {
    const result = ValidationService.validateObject(
      { port: 'not-a-number' },
      { port: { type: 'number' } }
    )
    expect(result.success).toBe(false)
  })

  it('fails when value is not an object', () => {
    const result = ValidationService.validateObject('string' as any, {})
    expect(result.success).toBe(false)
    expect(result.errors).toContain('Expected object')
  })

  it('rejects arrays even though typeof is object', () => {
    const result = ValidationService.validateObject([] as any, {})
    expect(result.success).toBe(false)
  })
})
