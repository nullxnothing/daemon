import { useMemo, useState } from 'react'
import { useUIStore } from '../../store/ui'
import './SolanaIdeWorkflow.css'

interface TransactionInspectorProps {
  projectId: string | null
  projectPath: string | null
}

interface InspectorFinding {
  label: string
  value: string
}

const SIGNATURE_RE = /\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/g
const PROGRAM_LOG_RE = /Program log: ([^\n\r]+)/g
const ANCHOR_ERROR_RE = /(AnchorError[^\n\r]*|Error Code:[^\n\r]*|Error Number:[^\n\r]*)/g
const COMPUTE_RE = /consumed\s+(\d+)\s+of\s+(\d+)\s+compute units/g
const PROGRAM_INVOKE_RE = /Program\s+([1-9A-HJ-NP-Za-km-z]{32,44})\s+invoke/g

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function collectMatches(input: string, regex: RegExp, group = 0): string[] {
  const matches: string[] = []
  for (const match of input.matchAll(regex)) {
    matches.push(match[group] ?? match[0])
  }
  return unique(matches)
}

function summarizeLog(input: string): InspectorFinding[] {
  const signatures = collectMatches(input, SIGNATURE_RE)
  const programLogs = collectMatches(input, PROGRAM_LOG_RE, 1)
  const anchorErrors = collectMatches(input, ANCHOR_ERROR_RE)
  const invokedPrograms = collectMatches(input, PROGRAM_INVOKE_RE, 1)
  const computeUnits = Array.from(input.matchAll(COMPUTE_RE)).map((match) => `${match[1]} / ${match[2]} CU`)
  const findings: InspectorFinding[] = []

  if (signatures.length > 0) findings.push({ label: 'Signatures', value: signatures.slice(0, 5).join('\n') })
  if (invokedPrograms.length > 0) findings.push({ label: 'Invoked Programs', value: invokedPrograms.slice(0, 8).join('\n') })
  if (anchorErrors.length > 0) findings.push({ label: 'Anchor / Program Errors', value: anchorErrors.slice(0, 6).join('\n') })
  if (computeUnits.length > 0) findings.push({ label: 'Compute Units', value: computeUnits.slice(0, 8).join('\n') })
  if (programLogs.length > 0) findings.push({ label: 'Program Logs', value: programLogs.slice(0, 8).join('\n') })

  if (findings.length === 0) {
    findings.push({
      label: 'No structured Solana log markers yet',
      value: 'Paste a transaction signature, simulation output, Anchor error, or program logs to extract useful debugging signals.',
    })
  }

  return findings
}

function firstSignature(input: string): string | null {
  return collectMatches(input, SIGNATURE_RE)[0] ?? null
}

function buildAgentPrompt(input: string, signature: string | null): string {
  return [
    'Analyze this Solana transaction, simulation output, or program log as a Solana runtime debugger.',
    '',
    'Focus on:',
    '- failing instruction or constraint',
    '- involved programs and writable/signing account assumptions',
    '- compute unit behavior',
    '- likely root cause',
    '- exact code or test changes to try next',
    '- whether this should be replayed on localnet or a Surfpool fork',
    '',
    signature ? `Detected signature: ${signature}` : 'No transaction signature was detected.',
    '',
    'Input:',
    '```',
    input || '(no input provided)',
    '```',
  ].join('\n')
}

export function TransactionInspector({ projectId, projectPath }: TransactionInspectorProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const [input, setInput] = useState('')
  const findings = useMemo(() => summarizeLog(input), [input])
  const signature = useMemo(() => firstSignature(input), [input])
  const canRunTerminal = Boolean(projectId && projectPath)
  const canAskAgent = Boolean(projectId)

  const runTerminalCommand = async (command: string, label: string) => {
    if (!projectId || !projectPath) return
    const res = await window.daemon.terminal.create({
      cwd: projectPath,
      startupCommand: command,
      userInitiated: true,
    })
    if (res.ok && res.data) {
      addTerminal(projectId, res.data.id, label)
    }
  }

  const askAgent = async () => {
    if (!projectId) return
    const res = await window.daemon.terminal.spawnAgent({
      agentId: 'solana-agent',
      projectId,
      initialPrompt: buildAgentPrompt(input, signature),
    })
    if (res.ok && res.data) {
      addTerminal(projectId, res.data.id, 'Solana Debug Agent', res.data.agentId ?? 'solana-agent')
    }
  }

  return (
    <div className="solana-ide-surface">
      <div className="solana-ide-hero">
        <div>
          <div className="solana-token-launch-kicker">Transaction Inspector</div>
          <h3 className="solana-token-launch-title">Turn failed logs into a debugging path</h3>
          <p className="solana-token-launch-copy">
            Paste a transaction signature, simulation output, Anchor error, or program logs. DAEMON extracts runtime signals and can launch a focused Solana agent pass.
          </p>
        </div>
        <div className="solana-ide-hero-actions">
          <button
            className="sol-btn green"
            disabled={!signature || !canRunTerminal}
            onClick={() => signature ? void runTerminalCommand(`solana confirm -v ${signature}`, 'Solana Confirm') : undefined}
          >
            Inspect Signature
          </button>
          <button className="sol-btn" disabled={!canAskAgent || input.trim().length === 0} onClick={() => void askAgent()}>
            Ask Solana Agent
          </button>
        </div>
      </div>

      <div className="solana-ide-grid">
        <section className="solana-ide-panel">
          <div className="solana-ide-panel-title">Input</div>
          <p className="solana-ide-panel-copy">Use this for failed transaction logs, `anchor test` output, `simulateTransaction` output, or a raw signature.</p>
          <div className="solana-ide-form-grid">
            <label className="solana-ide-field full">
              <span className="solana-ide-label">Logs / signature / error</span>
              <textarea
                className="solana-ide-textarea"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Paste Program log:, AnchorError, consumed compute units, or a transaction signature..."
              />
            </label>
          </div>
          <div className="solana-ide-panel-actions">
            <button className="sol-btn" onClick={() => setInput('')}>Clear</button>
            <button
              className="sol-btn"
              disabled={!canRunTerminal}
              onClick={() => void runTerminalCommand('solana logs', 'Solana Logs')}
            >
              Stream Logs
            </button>
          </div>
        </section>

        <section className="solana-ide-panel">
          <div className="solana-ide-panel-title">Extracted Runtime Signals</div>
          <div className="solana-ide-analysis-list">
            {findings.map((finding) => (
              <div key={finding.label} className="solana-ide-analysis-item">
                <div className="solana-ide-analysis-label">{finding.label}</div>
                <div className="solana-ide-analysis-value">{finding.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="solana-ide-grid three">
        <section className="solana-ide-card emphasis">
          <div className="solana-ide-card-title">Replay target</div>
          <div className="solana-ide-card-copy">
            Next step is wiring this to Surfpool/mainnet-fork replay so a failed signature can be reconstructed against local state.
          </div>
        </section>
        <section className="solana-ide-card">
          <div className="solana-ide-card-title">Account diffs</div>
          <div className="solana-ide-card-copy">
            This foundation is ready for before/after account snapshots, signer/writable account checks, and token balance deltas.
          </div>
        </section>
        <section className="solana-ide-card warning">
          <div className="solana-ide-card-title">Safe by default</div>
          <div className="solana-ide-card-copy">
            Inspector actions are read-only: CLI lookups, logs, and agent analysis. No transaction sending is triggered from this surface.
          </div>
        </section>
      </div>
    </div>
  )
}
