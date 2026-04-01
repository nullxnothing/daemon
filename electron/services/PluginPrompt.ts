import { runPrompt } from './ClaudeRouter'
import { SagaOrchestrator } from './SagaOrchestrator'
import { getPluginContext } from './PluginContextRegistry'
import type { PluginContextConfig, PromptTemplate } from './PluginContextRegistry'
import { TIMEOUTS } from '../config/constants'

// --- Types ---

interface PluginPromptOpts {
  pluginId: string
  templateId: string
  vars?: Record<string, string>
  overrideSystemPrompt?: string
  overrideModel?: string
  cwd?: string
  timeoutMs?: number
}

interface PluginPromptResult {
  text: string
  model: string
  templateId: string
}

// --- Template Engine ---

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? `{{${key}}}`
  })
}

function buildSystemPrompt(ctx: PluginContextConfig): string {
  const parts: string[] = [ctx.systemPrompt]

  // Inject enabled skills as capabilities
  const enabledSkills = ctx.skills.filter((s) => s.enabled)
  if (enabledSkills.length > 0) {
    parts.push('\n\nAvailable skills:')
    for (const skill of enabledSkills) {
      parts.push(`- ${skill.name}: ${skill.description}`)
    }
  }

  // Inject examples as few-shot
  if (ctx.examples.length > 0) {
    parts.push('\n\nExamples of desired output:')
    for (const example of ctx.examples) {
      parts.push(example)
    }
  }

  return parts.join('\n')
}

function resolveTemplate(ctx: PluginContextConfig, templateId: string): PromptTemplate | null {
  return ctx.templates.find((t) => t.id === templateId) ?? null
}

// --- Core Function ---

export async function pluginPrompt(opts: PluginPromptOpts): Promise<PluginPromptResult> {
  const ctx = getPluginContext(opts.pluginId)
  if (!ctx) throw new Error(`No plugin context registered for "${opts.pluginId}"`)

  const template = resolveTemplate(ctx, opts.templateId)
  if (!template) throw new Error(`Template "${opts.templateId}" not found for plugin "${opts.pluginId}"`)

  const userPrompt = interpolateTemplate(template.template, opts.vars ?? {})
  const fullPrompt = template.formatInstruction
    ? `${userPrompt}\n\n${template.formatInstruction}`
    : userPrompt

  const systemPrompt = opts.overrideSystemPrompt ?? buildSystemPrompt(ctx)
  const model = opts.overrideModel ?? ctx.model

  const text = await runPrompt({
    prompt: fullPrompt,
    systemPrompt,
    model,
    effort: ctx.effort,
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
  })

  return { text, model, templateId: opts.templateId }
}

// --- Orchestrated Multi-Step Prompt ---
// Wraps pluginPrompt in a saga for multi-step flows with rollback

interface SagaPromptStep<T = unknown> {
  name: string
  execute: () => Promise<T>
  compensate?: (result: T) => Promise<void>
}

interface OrchestratedPromptOpts {
  sagaId: string
  sagaName: string
  steps: SagaPromptStep[]
  timeoutMs?: number
}

export async function orchestratedPrompt(opts: OrchestratedPromptOpts) {
  return SagaOrchestrator.execute({
    id: opts.sagaId,
    name: opts.sagaName,
    steps: opts.steps.map((step) => ({
      name: step.name,
      execute: step.execute,
      compensate: step.compensate,
    })),
    timeout: opts.timeoutMs ?? TIMEOUTS.ORCHESTRATED_PROMPT,
  })
}
