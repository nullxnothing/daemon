import { describe, expect, it } from 'vitest'
import { stripTerminalControlSequencesForInputTracking } from '../../src/panels/Terminal/useTerminalInput'

describe('terminal input tracking', () => {
  it('strips xterm key escape sequences before aria hint tracking', () => {
    expect(stripTerminalControlSequencesForInputTracking('\u001b[O\u001b[O\u001b[Ok')).toBe('k')
    expect(stripTerminalControlSequencesForInputTracking('\u001b[A\u001b[B\u001b[1;5Dgit')).toBe('git')
    expect(stripTerminalControlSequencesForInputTracking('\u001bOA\u001bOBpnpm')).toBe('pnpm')
  })

  it('keeps printable command text and command-edit controls', () => {
    expect(stripTerminalControlSequencesForInputTracking('npm install\r')).toBe('npm install\r')
    expect(stripTerminalControlSequencesForInputTracking('abc\u007f')).toBe('abc\u007f')
    expect(stripTerminalControlSequencesForInputTracking('abc\u0015def')).toBe('abc\u0015def')
  })

  it('strips longer terminal control strings', () => {
    expect(stripTerminalControlSequencesForInputTracking('\u001b]0;title\u0007npm')).toBe('npm')
    expect(stripTerminalControlSequencesForInputTracking('\u009b1;5Dbuild')).toBe('build')
  })
})
