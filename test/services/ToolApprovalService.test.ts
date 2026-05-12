import { describe, expect, it } from 'vitest'
import { classifyToolRisk, requiresApproval } from '../../electron/services/ToolApprovalService'

describe('ToolApprovalService', () => {
  it('classifies read-only project tools as low risk', () => {
    expect(classifyToolRisk('read_file')).toBe('low')
    expect(classifyToolRisk('search_files')).toBe('low')
    expect(requiresApproval('low')).toBe(false)
  })

  it('requires approval for write, terminal, and unknown tools', () => {
    expect(classifyToolRisk('write_patch')).toBe('medium')
    expect(classifyToolRisk('run_terminal_command', { command: 'pnpm test' })).toBe('high')
    expect(classifyToolRisk('custom_tool')).toBe('high')
    expect(requiresApproval('medium')).toBe(true)
    expect(requiresApproval('high')).toBe(true)
  })

  it('blocks destructive commands and autonomous wallet actions', () => {
    expect(classifyToolRisk('run_terminal_command', { command: 'git reset --hard HEAD' })).toBe('blocked')
    expect(classifyToolRisk('run_terminal_command', { command: 'rm -rf .' })).toBe('blocked')
    expect(classifyToolRisk('sign_transaction')).toBe('blocked')
    expect(classifyToolRisk('transfer_sol')).toBe('blocked')
    expect(requiresApproval('blocked')).toBe(true)
  })
})
