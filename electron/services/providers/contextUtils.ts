// Shared utilities for provider context injection — used by both ClaudeProvider and CodexProvider.

import fs from 'node:fs'
import path from 'node:path'
import { getRegisteredPorts } from '../PortService'
import { getEmailAccountSummary, EMAIL_TOOL_NAMES } from '../email/EmailTools'
import { listSolanaActivity } from '../SolanaActivityService'
import { getSolanaRuntimeStatus } from '../SolanaRuntimeStatusService'
import { getState as getValidatorState } from '../ValidatorManager'

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

export function buildSolanaRuntimeContext(project: { id: string; path: string }): string[] {
  const runtime = getSolanaRuntimeStatus(project.path)
  const validator = getValidatorState()
  const recentActivity = listSolanaActivity(8).filter((entry) => {
    try {
      const metadata = JSON.parse(entry.metadataJson) as Record<string, unknown>
      return metadata.projectId === project.id || metadata.projectPath === project.path || entry.walletId != null
    } catch {
      return entry.walletId != null
    }
  })
  const runtimeConfigPath = path.join(project.path, 'daemon.solana-runtime.json')
  const runtimeConfigSummary = readRuntimeConfigSummary(runtimeConfigPath)

  const lines: string[] = [
    '<solana-runtime-context>',
    `Project runtime file: ${runtimeConfigSummary}`,
    `RPC: ${runtime.rpc.label} — ${runtime.rpc.detail}`,
    `Wallet path: ${runtime.walletPath.label} — ${runtime.walletPath.detail}`,
    `Execution backend: ${runtime.executionBackend.label} — ${runtime.executionBackend.detail}`,
    `Swap engine: ${runtime.swapEngine.label} — ${runtime.swapEngine.detail}`,
    `Validator: ${validator.status}${validator.type ? ` (${validator.type})` : ''}${validator.port ? ` on localhost:${validator.port}` : ''}`,
  ]

  if (runtime.environmentDiagnostics.length > 0) {
    lines.push('Environment diagnostics:')
    for (const item of runtime.environmentDiagnostics) {
      lines.push(`- ${item.label}: ${item.status} — ${item.detail}`)
    }
  }

  if (runtime.troubleshooting.length > 0) {
    lines.push('Runtime warnings:')
    for (const warning of runtime.troubleshooting.slice(0, 6)) {
      lines.push(`- ${warning}`)
    }
  }

  if (recentActivity.length > 0) {
    lines.push('Recent Solana activity:')
    for (const entry of recentActivity) {
      lines.push(`- ${entry.title} [${entry.status}] — ${entry.detail}`)
    }
  } else {
    lines.push('Recent Solana activity: none recorded yet.')
  }

  lines.push('</solana-runtime-context>')
  return lines
}

function readRuntimeConfigSummary(filePath: string): string {
  if (!fs.existsSync(filePath)) return 'not found'
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const chain = typeof parsed.chain === 'string' ? parsed.chain : 'unknown chain'
    const executionMode = typeof parsed.executionMode === 'string' ? parsed.executionMode : 'unknown execution mode'
    const swapProvider = typeof parsed.swapProvider === 'string' ? parsed.swapProvider : 'unknown swap provider'
    return `present (${chain}, ${executionMode}, ${swapProvider})`
  } catch {
    return 'present but unreadable'
  }
}
