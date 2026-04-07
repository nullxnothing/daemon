// Shared utilities for provider context injection — used by both ClaudeProvider and CodexProvider.

import { getRegisteredPorts } from '../PortService'
import { getEmailAccountSummary, EMAIL_TOOL_NAMES } from '../email/EmailTools'

export function parseContextTags(systemPrompt: string): Set<string> {
  const match = systemPrompt.match(/<context-tags>(.*?)<\/context-tags>/)
  if (!match) return new Set(['project'])
  return new Set(match[1].split(',').map((t) => t.trim()).filter(Boolean))
}

export function stripContextTags(systemPrompt: string): string {
  return systemPrompt.replace(/<context-tags>.*?<\/context-tags>\n?/g, '').trim()
}

export function buildPortMap(): string {
  try {
    const ports = getRegisteredPorts()
    if (ports.length === 0) return ''
    return ports
      .map((p) => `  :${p.port} → ${p.serviceName} (${p.projectName})`)
      .join('\n')
  } catch {
    return ''
  }
}

export async function buildEmailContext(): Promise<string[]> {
  const emailSummary = await getEmailAccountSummary()
  return [
    '<email-context>',
    emailSummary,
    `Email tools: ${EMAIL_TOOL_NAMES}`,
    '</email-context>',
  ]
}

export function buildMppContext(): string[] {
  return [
    '<mpp-context>',
    'Machine Payments Protocol (MPP) by Stripe × Tempo enables autonomous agent-to-agent payments on Solana.',
    'Package: @solana/mpp — use @solana/mpp/client for paying agents, @solana/mpp/server for receiving.',
    'Key concepts: MppClient.pay(recipient, amount, memo) sends USDC via Solana. Agents can autonomously pay for services.',
    'Docs: https://docs.solana.com/mpp',
    '</mpp-context>',
  ]
}
