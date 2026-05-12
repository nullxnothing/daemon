import { describe, expect, it } from 'vitest'
import { normalizeAgentRunInput } from '../../electron/services/DaemonAIAgentService'

describe('DaemonAIAgentService contract helpers', () => {
  it('normalizes agent run input to a patch-safe default contract', () => {
    const input = normalizeAgentRunInput({
      task: '  propose a fix  ',
      projectPath: '.',
    })

    expect(input.task).toBe('propose a fix')
    expect(input.mode).toBe('patch')
    expect(input.accessMode).toBe('byok')
    expect(input.modelPreference).toBe('auto')
    expect(input.approvalPolicy).toBe('require_for_write_and_terminal')
    expect(input.allowedTools).toContain('write_patch')
    expect(input.allowedTools).toContain('run_tests')
  })

  it('forces read-only tools when the approval policy is read_only', () => {
    const input = normalizeAgentRunInput({
      task: 'review only',
      approvalPolicy: 'read_only',
      allowedTools: ['write_patch', 'run_terminal_command'],
    })

    expect(input.allowedTools).toEqual([
      'read_file',
      'search_files',
      'list_project_tree',
      'get_git_status',
      'get_git_diff',
    ])
  })

  it('deduplicates allowed tools and rejects empty tasks', () => {
    const input = normalizeAgentRunInput({
      task: 'run checks',
      allowedTools: ['RUN_TESTS', 'run_tests', '', 'read_file'],
    })

    expect(input.allowedTools).toEqual(['run_tests', 'read_file'])
    expect(() => normalizeAgentRunInput({ task: '   ' })).toThrow('task required')
  })
})
