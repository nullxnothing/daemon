import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReplayTrace, ReplayInstruction, ReplayProgramSummary, ReplayVerificationResult } from '../../../electron/shared/types'
import { Dot } from '../../components/Dot'
import { useUIStore } from '../../store/ui'
import './ReplayEngine.css'

type Mode = 'signature' | 'program'

interface FormattedTime {
  iso: string
  relative: string
}

function formatTime(blockTime: number | null): FormattedTime {
  if (!blockTime) return { iso: 'unknown', relative: '' }
  const ms = blockTime * 1000
  const iso = new Date(ms).toISOString()
  const ageSec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (ageSec < 60) return { iso, relative: `${ageSec}s ago` }
  if (ageSec < 3600) return { iso, relative: `${Math.floor(ageSec / 60)}m ago` }
  if (ageSec < 86400) return { iso, relative: `${Math.floor(ageSec / 3600)}h ago` }
  return { iso, relative: `${Math.floor(ageSec / 86400)}d ago` }
}

function shortKey(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 2) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(6)
}

function InstructionRow({ instr, depth = 0 }: { instr: ReplayInstruction; depth?: number }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = instr.innerInstructions.length > 0 || instr.parsed != null || instr.accounts.length > 0
  const indent = depth * 16

  return (
    <div className={`replay-instr ${instr.error ? 'replay-instr--error' : ''}`}>
      <button
        type="button"
        className="replay-instr-head"
        onClick={() => hasChildren && setExpanded((v) => !v)}
        style={{ paddingLeft: 12 + indent }}
      >
        <span className={`replay-instr-caret ${expanded ? 'replay-instr-caret--open' : ''}`}>
          {hasChildren ? '▸' : '·'}
        </span>
        <span className="replay-instr-index">[{instr.index}]</span>
        <span className="replay-instr-program">
          {instr.programLabel ?? shortKey(instr.programId)}
        </span>
        {instr.parsed?.type ? (
          <span className="replay-instr-parsed">{instr.parsed.type}</span>
        ) : null}
        {instr.error ? <span className="replay-instr-err">ERR</span> : null}
      </button>
      {expanded && hasChildren ? (
        <div className="replay-instr-body">
          {instr.parsed?.info ? (
            <pre className="replay-instr-parsed-body">
              {JSON.stringify(instr.parsed.info, null, 2)}
            </pre>
          ) : null}
          {instr.accounts.length > 0 ? (
            <div className="replay-instr-accounts">
              {instr.accounts.map((account, idx) => (
                <div key={`${account.pubkey}-${idx}`} className="replay-instr-account">
                  <span className={`replay-acc-flag ${account.isWritable ? 'is-w' : ''} ${account.isSigner ? 'is-s' : ''}`}>
                    {account.isWritable ? 'W' : ''}{account.isSigner ? 'S' : ''}
                    {!account.isWritable && !account.isSigner ? '·' : ''}
                  </span>
                  <span className="replay-acc-key" title={account.pubkey}>{shortKey(account.pubkey, 8, 6)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {instr.innerInstructions.map((inner, idx) => (
            <InstructionRow key={`${inner.programId}-${idx}`} instr={inner} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AccountDiffRow({ diff }: { diff: ReplayTrace['accountDiffs'][number] }) {
  const lamportsChange = diff.lamportsDelta
  const tone = lamportsChange === 0 ? 'replay-diff--neutral' : lamportsChange > 0 ? 'replay-diff--gain' : 'replay-diff--loss'
  const hasTokens = diff.tokenMint != null
  const hasChange = lamportsChange !== 0 || hasTokens

  return (
    <div className={`replay-diff ${tone} ${diff.isWritable ? 'replay-diff--writable' : ''}`}>
      <div className="replay-diff-key" title={diff.pubkey}>{shortKey(diff.pubkey, 7, 5)}</div>
      <div className="replay-diff-flags">
        {diff.isWritable ? <span className="replay-flag-w">W</span> : null}
      </div>
      <div className="replay-diff-lamports">
        {hasChange ? (
          <>
            <span className="replay-diff-pre">{lamportsToSol(diff.preLamports)}</span>
            <span className="replay-diff-arrow">→</span>
            <span className="replay-diff-post">{lamportsToSol(diff.postLamports)}</span>
            <span className="replay-diff-delta">
              {lamportsChange > 0 ? '+' : ''}{lamportsToSol(lamportsChange)} SOL
            </span>
          </>
        ) : (
          <span className="replay-diff-empty">no change</span>
        )}
      </div>
      {hasTokens ? (
        <div className="replay-diff-token">
          mint <span title={diff.tokenMint!}>{shortKey(diff.tokenMint!, 6, 4)}</span> {diff.preTokenAmount ?? '?'} → {diff.postTokenAmount ?? '?'}
        </div>
      ) : null}
    </div>
  )
}

function defaultVerificationCommand(): string {
  return 'pnpm run typecheck'
}

export function ReplayEngine() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const [mode, setMode] = useState<Mode>('signature')
  const [signatureInput, setSignatureInput] = useState('')
  const [programInput, setProgramInput] = useState('')
  const [trace, setTrace] = useState<ReplayTrace | null>(null)
  const [program, setProgram] = useState<ReplayProgramSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rpcLabel, setRpcLabel] = useState<string>('')
  const [contextStatus, setContextStatus] = useState<string | null>(null)
  const [verifyCommand, setVerifyCommand] = useState(defaultVerificationCommand)
  const [verification, setVerification] = useState<ReplayVerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)
  const sigRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.daemon.replay.rpcLabel().then((res) => {
      if (cancelled) return
      if (res.ok && typeof res.data === 'string') setRpcLabel(res.data)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (mode === 'signature') sigRef.current?.focus()
  }, [mode])

  const fetchSignature = useCallback(async (sig: string, force = false) => {
    if (!sig.trim()) return
    setLoading(true)
    setError(null)
    setContextStatus(null)
    setVerification(null)
    setProgram(null)
    try {
      const res = await window.daemon.replay.fetchTrace(sig.trim(), force)
      if (!res.ok) throw new Error(res.error ?? 'Failed to fetch trace')
      setTrace(res.data ?? null)
    } catch (err) {
      setTrace(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProgram = useCallback(async (programId: string) => {
    if (!programId.trim()) return
    setLoading(true)
    setError(null)
    setContextStatus(null)
    setVerification(null)
    setTrace(null)
    try {
      const res = await window.daemon.replay.fetchProgram(programId.trim(), 15)
      if (!res.ok) throw new Error(res.error ?? 'Failed to fetch program signatures')
      setProgram(res.data ?? null)
    } catch (err) {
      setProgram(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleHandoff = useCallback(async () => {
    if (!trace) return
    setContextStatus(null)
    try {
      const res = await window.daemon.replay.buildContext(trace.signature)
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Failed to build context')
      await navigator.clipboard.writeText(res.data.contextMarkdown)
      setContextStatus('Replay context copied to clipboard. Paste into your Claude agent.')
    } catch (err) {
      setContextStatus(`Context export failed: ${(err as Error).message}`)
    }
  }, [trace])

  const handleLaunchAgentHandoff = useCallback(async () => {
    if (!trace) return
    if (!activeProjectId || !activeProjectPath) {
      setContextStatus('Open a project before launching an agent handoff.')
      return
    }
    setContextStatus(null)
    try {
      const handoffRes = await window.daemon.replay.createHandoff(activeProjectPath, trace.signature)
      if (!handoffRes.ok || !handoffRes.data) throw new Error(handoffRes.error ?? 'Failed to create handoff')

      const terminalRes = await window.daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: handoffRes.data.startupCommand,
        isAgent: true,
      })
      if (!terminalRes.ok || !terminalRes.data) throw new Error(terminalRes.error ?? 'Failed to launch Claude')

      addTerminal(activeProjectId, terminalRes.data.id, handoffRes.data.promptHeadline, null)
      await navigator.clipboard.writeText(handoffRes.data.promptText)
      setContextStatus(`Claude handoff launched. Context saved to ${handoffRes.data.contextPath}`)
    } catch (err) {
      setContextStatus(`Agent handoff failed: ${(err as Error).message}`)
    }
  }, [activeProjectId, activeProjectPath, addTerminal, trace])

  const handleVerifyFix = useCallback(async () => {
    if (!trace) return
    if (!activeProjectPath) {
      setContextStatus('Open a project before running verification.')
      return
    }
    setVerifying(true)
    setContextStatus(null)
    try {
      const res = await window.daemon.replay.verifyFix(activeProjectPath, trace.signature, verifyCommand)
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Verification failed')
      setVerification(res.data)
      setContextStatus(res.data.status === 'passed'
        ? `Verified fix passed in ${Math.round(res.data.durationMs / 100) / 10}s.`
        : `Verification failed with exit code ${res.data.exitCode ?? 'n/a'}.`)
    } catch (err) {
      setContextStatus(`Verification failed: ${(err as Error).message}`)
    } finally {
      setVerifying(false)
    }
  }, [activeProjectPath, trace, verifyCommand])

  const handleSignatureSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault()
    void fetchSignature(signatureInput)
  }, [fetchSignature, signatureInput])

  const handleProgramSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault()
    void fetchProgram(programInput)
  }, [fetchProgram, programInput])

  const writableDiffs = useMemo(() => {
    if (!trace) return []
    return trace.accountDiffs.filter((d) => d.isWritable && (d.lamportsDelta !== 0 || d.tokenMint))
  }, [trace])

  return (
    <div className="replay-panel" data-tour="replay-engine">
      <header className="replay-header">
        <div className="replay-header-title">
          <h1>Replay Engine</h1>
          <span className="replay-header-sub">Fork-and-replay debugger for Solana programs</span>
        </div>
        <div className="replay-header-meta">
          <Dot color="green" />
          <span className="replay-header-rpc">{rpcLabel ? new URL(rpcLabel).host : 'no RPC'}</span>
        </div>
      </header>

      <div className="replay-mode-tabs">
        <button
          type="button"
          className={`replay-tab ${mode === 'signature' ? 'is-active' : ''}`}
          onClick={() => setMode('signature')}
        >
          Transaction
        </button>
        <button
          type="button"
          className={`replay-tab ${mode === 'program' ? 'is-active' : ''}`}
          onClick={() => setMode('program')}
        >
          Program
        </button>
      </div>

      {mode === 'signature' ? (
        <form className="replay-input-row" onSubmit={handleSignatureSubmit}>
          <input
            ref={sigRef}
            type="text"
            placeholder="Paste a Solana transaction signature"
            value={signatureInput}
            onChange={(e) => setSignatureInput(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="replay-input"
          />
          <button type="submit" className="replay-button" disabled={loading || !signatureInput.trim()}>
            {loading ? 'Replaying…' : 'Replay'}
          </button>
        </form>
      ) : (
        <form className="replay-input-row" onSubmit={handleProgramSubmit}>
          <input
            type="text"
            placeholder="Paste a program ID to inspect recent transactions"
            value={programInput}
            onChange={(e) => setProgramInput(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="replay-input"
          />
          <button type="submit" className="replay-button" disabled={loading || !programInput.trim()}>
            {loading ? 'Loading…' : 'Inspect'}
          </button>
        </form>
      )}

      {error ? (
        <div className="replay-error">{error}</div>
      ) : null}

      {trace ? (
        <div className="replay-results">
          <section className="replay-summary">
            <div className="replay-summary-row">
              <span className={`replay-status ${trace.success ? 'is-success' : 'is-failure'}`}>
                <Dot color={trace.success ? 'green' : 'red'} />
                {trace.success ? 'Success' : 'Failure'}
              </span>
              <span className="replay-summary-meta">
                slot {trace.slot.toLocaleString()} · fee {trace.fee} lamports
                {trace.computeUnitsConsumed != null ? ` · CU ${trace.computeUnitsConsumed.toLocaleString()}` : ''}
              </span>
              <span className="replay-summary-time">
                {trace.blockTime ? formatTime(trace.blockTime).relative : ''}
              </span>
            </div>
            <div className="replay-summary-sig" title={trace.signature}>
              {trace.signature}
            </div>
            <div className="replay-summary-actions">
              <button
                type="button"
                className="replay-button replay-button--ghost"
                onClick={() => void fetchSignature(trace.signature, true)}
              >
                Refresh
              </button>
              <button
                type="button"
                className="replay-button replay-button--accent"
                onClick={() => void handleHandoff()}
              >
                Copy agent context
              </button>
              <button
                type="button"
                className="replay-button replay-button--hot"
                onClick={() => void handleLaunchAgentHandoff()}
                disabled={!activeProjectId || !activeProjectPath}
                title={!activeProjectId || !activeProjectPath ? 'Open a project first' : 'Save replay context and launch Claude'}
              >
                Launch Claude fix loop
              </button>
            </div>
            {contextStatus ? <div className="replay-status-msg">{contextStatus}</div> : null}
          </section>

          <section className={`replay-verify-card ${verification?.status === 'passed' ? 'is-passed' : verification?.status === 'failed' ? 'is-failed' : ''}`}>
            <div className="replay-verify-head">
              <div>
                <h2>Verified Fix</h2>
                <p>Run the repo command that proves the agent patch actually works.</p>
              </div>
              <span className="replay-verify-state">
                {verification ? (verification.status === 'passed' ? 'Verified' : 'Failed') : 'Not run'}
              </span>
            </div>
            <div className="replay-verify-row">
              <input
                className="replay-verify-input"
                value={verifyCommand}
                onChange={(e) => setVerifyCommand(e.target.value)}
                spellCheck={false}
                disabled={verifying}
                placeholder="pnpm run typecheck"
              />
              <button
                type="button"
                className="replay-button replay-button--hot"
                onClick={() => void handleVerifyFix()}
                disabled={verifying || !activeProjectPath || !verifyCommand.trim()}
              >
                {verifying ? 'Verifying…' : 'Run verification'}
              </button>
            </div>
            {verification ? (
              <div className="replay-verify-result">
                <div className="replay-verify-meta">
                  <span>exit {verification.exitCode ?? 'n/a'}</span>
                  <span>{Math.round(verification.durationMs / 100) / 10}s</span>
                  <span title={verification.resultPath}>{shortKey(verification.resultPath, 28, 18)}</span>
                </div>
                {(verification.stdout || verification.stderr) ? (
                  <pre className="replay-verify-output">
                    {[verification.stdout, verification.stderr].filter(Boolean).join('\n')}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </section>

          {trace.anchorError ? (
            <section className="replay-anchor-card">
              <header className="replay-anchor-head">
                <Dot color="red" />
                <strong>Anchor Error</strong>
                <span className="replay-anchor-code">
                  {trace.anchorError.errorCode ?? '?'} (#{trace.anchorError.errorNumber ?? '?'})
                </span>
              </header>
              {trace.anchorError.errorMessage ? (
                <div className="replay-anchor-message">{trace.anchorError.errorMessage}</div>
              ) : null}
              {trace.anchorError.account ? (
                <div className="replay-anchor-meta">
                  account <code>{trace.anchorError.account}</code>
                </div>
              ) : null}
              {trace.anchorError.programId ? (
                <div className="replay-anchor-meta">
                  program <code>{shortKey(trace.anchorError.programId, 12, 8)}</code>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="replay-section">
            <header className="replay-section-head">
              <h2>Instruction trace</h2>
              <span className="replay-section-count">{trace.instructions.length}</span>
            </header>
            <div className="replay-instr-list">
              {trace.instructions.map((instr) => (
                <InstructionRow key={instr.index} instr={instr} />
              ))}
            </div>
          </section>

          <section className="replay-section">
            <header className="replay-section-head">
              <h2>Account diffs (writable)</h2>
              <span className="replay-section-count">{writableDiffs.length}</span>
            </header>
            {writableDiffs.length === 0 ? (
              <div className="replay-empty">No writable accounts changed.</div>
            ) : (
              <div className="replay-diff-list">
                {writableDiffs.map((diff) => (
                  <AccountDiffRow key={diff.pubkey} diff={diff} />
                ))}
              </div>
            )}
          </section>

          <section className="replay-section">
            <header className="replay-section-head">
              <h2>Program logs</h2>
              <span className="replay-section-count">{trace.logs.length}</span>
            </header>
            <pre className="replay-logs">
              {trace.logs.join('\n')}
            </pre>
          </section>
        </div>
      ) : null}

      {program ? (
        <div className="replay-results">
          <section className="replay-summary">
            <div className="replay-summary-row">
              <span className="replay-summary-meta">
                Recent transactions for program <code>{shortKey(program.programId, 8, 6)}</code>
              </span>
            </div>
          </section>
          <section className="replay-section">
            <div className="replay-program-list">
              {program.recent.map((entry) => (
                <button
                  key={entry.signature}
                  type="button"
                  className={`replay-program-item ${entry.success ? 'is-success' : 'is-failure'}`}
                  onClick={() => {
                    setMode('signature')
                    setSignatureInput(entry.signature)
                    void fetchSignature(entry.signature)
                  }}
                >
                  <Dot color={entry.success ? 'green' : 'red'} />
                  <span className="replay-program-sig" title={entry.signature}>
                    {shortKey(entry.signature, 12, 6)}
                  </span>
                  <span className="replay-program-slot">slot {entry.slot.toLocaleString()}</span>
                  <span className="replay-program-time">
                    {entry.blockTime ? formatTime(entry.blockTime).relative : ''}
                  </span>
                  {!entry.success && entry.error ? (
                    <span className="replay-program-error" title={entry.error}>{shortKey(entry.error, 18, 4)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {!trace && !program && !loading && !error ? (
        <div className="replay-placeholder">
          <h2>Forensics for any Solana transaction.</h2>
          <p>Paste a signature to see the parsed instruction trace, writable account diffs, decoded Anchor errors, and full program logs in one view. Send the full context to a Claude agent to propose a fix.</p>
          <ul className="replay-placeholder-list">
            <li>· Decoded instruction tree with inner instructions</li>
            <li>· Writable-account lamport and SPL token diffs</li>
            <li>· Anchor error code, account, and program decoded from logs</li>
            <li>· One-click context handoff to Claude</li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}
