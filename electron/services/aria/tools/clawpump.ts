/**
 * Clawpump agent tools: list / create / start / stop / chat.
 * Backed by the external Clawpump API via ClawpumpService.
 */
import * as ClawpumpService from '../../ClawpumpService'
import type { AriaTool } from '../AriaTool'

function requireConfigured(): void {
  if (!ClawpumpService.isConfigured()) {
    throw new Error('Clawpump API key not configured. Set it in the Clawpump panel first.')
  }
}

export const clawpumpTools: AriaTool[] = [
  {
    name: 'clawpump_list_agents',
    description: 'List the Clawpump agents on this account (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      requireConfigured()
      const agents = await ClawpumpService.listAgents()
      return {
        ok: true,
        summary: `Found ${agents.length} Clawpump agent(s).`,
        data: agents.map((a) => ({ id: a.id, name: a.name, status: a.status, strategy: a.strategy })),
      }
    },
  },
  {
    name: 'clawpump_list_skills',
    description: 'List the skills available to Clawpump agents (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler() {
      requireConfigured()
      const skills = await ClawpumpService.listSkills()
      return { ok: true, summary: `Found ${skills.length} skill(s).`, data: skills }
    },
  },
  {
    name: 'clawpump_create_agent',
    description: 'Create a Clawpump agent. Provide a name and optionally strategy, persona, model, and skills (skill slugs from clawpump_list_skills).',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        strategy: { type: 'string' },
        persona: { type: 'string' },
        model: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    async handler(input) {
      requireConfigured()
      const name = String(input.name ?? '').trim()
      if (!name) return { ok: false, summary: 'An agent name is required.' }
      const agent = await ClawpumpService.createAgent({
        name,
        strategy: input.strategy ? String(input.strategy) : undefined,
        persona: input.persona ? String(input.persona) : undefined,
        model: input.model ? String(input.model) : undefined,
        skills: Array.isArray(input.skills) ? (input.skills as string[]).map(String) : undefined,
      })
      return { ok: true, summary: `Created Clawpump agent "${name}".`, data: { id: agent.id, status: agent.status } }
    },
  },
  {
    name: 'clawpump_start_agent',
    description: 'Start a Clawpump agent by id.',
    kind: 'run',
    risk: 'write',
    input: { type: 'object', properties: { agentId: { type: 'string' } }, required: ['agentId'] },
    async handler(input) {
      requireConfigured()
      const agent = await ClawpumpService.startAgent(String(input.agentId ?? ''))
      return { ok: true, summary: `Started agent (${agent.status}).`, data: { status: agent.status } }
    },
  },
  {
    name: 'clawpump_stop_agent',
    description: 'Stop a Clawpump agent by id.',
    kind: 'run',
    risk: 'write',
    input: { type: 'object', properties: { agentId: { type: 'string' } }, required: ['agentId'] },
    async handler(input) {
      requireConfigured()
      const agent = await ClawpumpService.stopAgent(String(input.agentId ?? ''))
      return { ok: true, summary: `Stopped agent (${agent.status}).`, data: { status: agent.status } }
    },
  },
  {
    name: 'clawpump_chat',
    description: 'Send a message to a Clawpump agent and return its reply.',
    kind: 'run',
    risk: 'write',
    input: {
      type: 'object',
      properties: { agentId: { type: 'string' }, message: { type: 'string' } },
      required: ['agentId', 'message'],
    },
    async handler(input) {
      requireConfigured()
      const message = String(input.message ?? '').trim()
      if (!message) return { ok: false, summary: 'A message is required.' }
      const reply = await ClawpumpService.chat(String(input.agentId ?? ''), message)
      return { ok: true, summary: 'Agent replied.', data: { content: reply.content } }
    },
  },
]
