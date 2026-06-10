import { describe, it, expect, afterEach } from 'vitest'
import { quoteWinArg, buildCliSpawn, needsWinShell } from '../../electron/services/cliSpawn'

const realPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform })
}

afterEach(() => setPlatform(realPlatform))

describe('quoteWinArg', () => {
  it('wraps the argument in double quotes', () => {
    expect(quoteWinArg('hello world')).toBe('"hello world"')
  })

  it('escapes embedded double quotes', () => {
    expect(quoteWinArg('say "hi"')).toBe('"say \\"hi\\""')
  })

  it('breaks %VAR% pairs so cmd cannot expand them', () => {
    expect(quoteWinArg('%PATH%')).toBe('"%^PATH%^"')
  })
})

describe('buildCliSpawn', () => {
  it('routes .cmd shims through a shell with quoted args on Windows', () => {
    setPlatform('win32')
    const spec = buildCliSpawn('C:\\npm\\claude.cmd', ['-p', 'fix the & bug'])
    expect(spec.shell).toBe(true)
    expect(spec.command).toBe('"C:\\npm\\claude.cmd"')
    expect(spec.args).toEqual(['"-p"', '"fix the & bug"'])
  })

  it('matches .bat case-insensitively', () => {
    setPlatform('win32')
    expect(needsWinShell('runner.BAT')).toBe(true)
  })

  it('leaves native executables untouched on Windows', () => {
    setPlatform('win32')
    const spec = buildCliSpawn('C:\\bin\\claude.exe', ['-p', 'task'])
    expect(spec).toEqual({ command: 'C:\\bin\\claude.exe', args: ['-p', 'task'], shell: false })
  })

  it('never uses a shell off Windows', () => {
    setPlatform('linux')
    const spec = buildCliSpawn('/usr/bin/claude.cmd', ['-p', 'task'])
    expect(spec.shell).toBe(false)
    expect(spec.args).toEqual(['-p', 'task'])
  })
})
