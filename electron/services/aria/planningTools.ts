/**
 * Planning + patch tools — intercepted in AriaAgentService.executeTool (they
 * drive transcript UI, not side effects). Extracted from toolCatalog.ts so the
 * Lite catalog (toolCatalog.lite.ts) can compose them without importing the
 * full IDE/Solana tool domains.
 */
import type { AriaTool } from './AriaTool'

export const planningTools: AriaTool[] = [
  {
    name: 'present_plan',
    description: 'Present an ordered plan for the task BEFORE acting, as a short list of steps (3–6). Call this first whenever a request needs more than one action so the user can see the approach.',
    kind: 'read',
    risk: 'read',
    input: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        },
      },
      required: ['steps'],
    },
    async handler() {
      return { ok: true, summary: 'Plan presented.' }
    },
  },
  {
    name: 'propose_patch',
    description: 'Propose a code change as a unified diff for the user to keep or discard. Provide a short title, a one-paragraph summary, and the unified diff (git format, paths relative to the project root). The change is NOT applied until the user approves.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        unifiedDiff: { type: 'string' },
      },
      required: ['title', 'unifiedDiff'],
    },
    async handler() {
      return { ok: true, summary: 'Patch proposed.' }
    },
  },
]
