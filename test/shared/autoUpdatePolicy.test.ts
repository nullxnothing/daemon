import { describe, expect, it } from 'vitest'
import { shouldEnableAutoUpdate } from '../../electron/main/autoUpdatePolicy'

const DEFAULT_CONTEXT = {
  isPackaged: true,
  isDisabled: false,
  isSmokeTest: false,
  isAdHocMacBuild: false,
}

describe('automatic update policy', () => {
  it('enables updates for ordinary packaged releases', () => {
    expect(shouldEnableAutoUpdate(DEFAULT_CONTEXT)).toBe(true)
  })

  it.each([
    ['ad-hoc macOS build', { isAdHocMacBuild: true }],
    ['disabled update environment', { isDisabled: true }],
    ['smoke test', { isSmokeTest: true }],
    ['development build', { isPackaged: false }],
  ])('disables updates for %s', (_label, override) => {
    expect(shouldEnableAutoUpdate({ ...DEFAULT_CONTEXT, ...override })).toBe(false)
  })
})
