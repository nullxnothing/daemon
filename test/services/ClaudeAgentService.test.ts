import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExistsSync, mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    readdirSync: mockReaddirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}))

import { listClaudeAgents } from '../../electron/services/ClaudeAgentService'

function makeEntry(name: string, isFile = true) {
  return { name, isFile: () => isFile }
}

describe('listClaudeAgents — filesystem edge cases', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when agents directory does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    const result = listClaudeAgents()
    expect(result).toEqual([])
  })

  it('returns empty array when directory has no .md files', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('notes.txt'), makeEntry('image.png')])
    const result = listClaudeAgents()
    expect(result).toEqual([])
  })

  it('skips directory entries even with .md extension', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('subdir.md', false)])
    const result = listClaudeAgents()
    expect(result).toEqual([])
  })
})

describe('listClaudeAgents — frontmatter parsing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses a valid .md file with full frontmatter', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('my-agent.md')])
    mockReadFileSync.mockReturnValue(`---
name: My Agent
description: Does great things
model: sonnet
color: "#3ecf8e"
---
You are a helpful agent.`)

    const [agent] = listClaudeAgents()
    expect(agent.name).toBe('My Agent')
    expect(agent.description).toBe('Does great things')
    expect(agent.model).toBe('claude-sonnet-4-20250514')
    expect(agent.systemPrompt).toBe('You are a helpful agent.')
  })

  it('uses filename as fallback name when frontmatter has no name field', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('fallback-name.md')])
    mockReadFileSync.mockReturnValue(`---
description: Some desc
---
Body text.`)

    const [agent] = listClaudeAgents()
    expect(agent.name).toBe('fallback-name')
    expect(agent.id).toBe('fallback-name')
  })

  it('returns empty description when frontmatter description is missing', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('nodesc.md')])
    mockReadFileSync.mockReturnValue(`---
name: No Desc
---
Body.`)

    const [agent] = listClaudeAgents()
    expect(agent.description).toBe('')
  })

  it('treats file with no frontmatter markers as no-frontmatter', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('plain.md')])
    mockReadFileSync.mockReturnValue('Just a plain body with no frontmatter.')

    const [agent] = listClaudeAgents()
    expect(agent.name).toBe('plain')
    expect(agent.systemPrompt).toBe('Just a plain body with no frontmatter.')
  })

  it('returns null-safe result for malformed YAML (no colon in frontmatter line)', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('malformed.md')])
    mockReadFileSync.mockReturnValue(`---
this line has no colon separator at all
---
Body here.`)

    // The parser skips lines without a colon — should still produce an agent
    const [agent] = listClaudeAgents()
    expect(agent).toBeDefined()
    expect(agent.name).toBe('malformed')
  })

  it('skips files that throw on readFileSync (returns null, filtered out)', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('throws.md'), makeEntry('ok.md')])
    mockReadFileSync
      .mockImplementationOnce(() => { throw new Error('permission denied') })
      .mockImplementationOnce(() => `---\nname: OK\n---\nBody.`)

    const result = listClaudeAgents()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('OK')
  })
})

describe('listClaudeAgents — model normalization', () => {
  beforeEach(() => vi.clearAllMocks())

  function agentWithModel(modelShorthand: string) {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('agent.md')])
    mockReadFileSync.mockReturnValue(`---\nname: Test\nmodel: ${modelShorthand}\n---\nBody.`)
    return listClaudeAgents()[0]
  }

  it('normalizes "opus" to full model string', () => {
    const agent = agentWithModel('opus')
    expect(agent.model).toBe('claude-opus-4-20250514')
  })

  it('normalizes "sonnet" to full model string', () => {
    const agent = agentWithModel('sonnet')
    expect(agent.model).toBe('claude-sonnet-4-20250514')
  })

  it('normalizes "haiku" to full model string', () => {
    const agent = agentWithModel('haiku')
    expect(agent.model).toBe('claude-haiku-4-5-20251001')
  })

  it('passes through an already-full versioned model string unchanged', () => {
    const agent = agentWithModel('claude-opus-4-20250514')
    expect(agent.model).toBe('claude-opus-4-20250514')
  })

  it('defaults to sonnet when model field is absent', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('nomodel.md')])
    mockReadFileSync.mockReturnValue(`---\nname: No Model\n---\nBody.`)
    const [agent] = listClaudeAgents()
    expect(agent.model).toBe('claude-sonnet-4-20250514')
  })

  it('is case-insensitive for model shorthand', () => {
    const agent = agentWithModel('OPUS')
    expect(agent.model).toBe('claude-opus-4-20250514')
  })
})

describe('listClaudeAgents — sorting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sorts agents alphabetically by name', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue([makeEntry('z-agent.md'), makeEntry('a-agent.md'), makeEntry('m-agent.md')])
    mockReadFileSync.mockImplementation((filePath: string) => {
      const base = (filePath as string).split(/[/\\]/).pop()!.replace('.md', '')
      return `---\nname: ${base}\n---\nBody.`
    })

    const result = listClaudeAgents()
    expect(result.map((a) => a.name)).toEqual(['a-agent', 'm-agent', 'z-agent'])
  })
})
