import { useEffect, useState } from 'react'
import type { SolanaToolchainStatus, ValidatorState } from '../../../electron/services/ValidatorManager'
import type { SolanaProjectInfo } from '../../../electron/services/SolanaDetector'
import { useLiteWorkbenchStore } from './liteWorkbenchStore'
import styles from './LiteWorkbench.module.css'

function ToolStatus({ name, installed, version }: { name: string; installed: boolean; version?: string | null }) {
  return <div className={styles.statusRow}><span className={installed ? styles.statusGood : styles.statusMissing} /><span>{name}</span><small>{installed ? version || 'ready' : 'missing'}</small></div>
}

export function LiteWorkflowRail() {
  const project = useLiteWorkbenchStore((state) => state.activeProject)
  const addTerminal = useLiteWorkbenchStore((state) => state.addTerminal)
  const [toolchain, setToolchain] = useState<SolanaToolchainStatus | null>(null)
  const [validator, setValidator] = useState<ValidatorState | null>(null)
  const [projectInfo, setProjectInfo] = useState<SolanaProjectInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    if (!project) return
    const [toolchainResponse, validatorResponse, projectResponse] = await Promise.all([
      window.daemon.validator.toolchainStatus(project.path),
      window.daemon.validator.status(),
      window.daemon.validator.detectProject(project.path),
    ])
    if (toolchainResponse.ok && toolchainResponse.data) setToolchain(toolchainResponse.data)
    else setError(toolchainResponse.error ?? 'Toolchain check failed.')
    if (validatorResponse.ok && validatorResponse.data) setValidator(validatorResponse.data)
    if (projectResponse.ok && projectResponse.data) setProjectInfo(projectResponse.data)
  }

  useEffect(() => { void refresh() }, [project])

  useEffect(() => window.daemon.validator.onStatusChange?.((next) => setValidator(next as ValidatorState)), [])

  const run = async (command: string) => {
    if (!project) return
    const response = await window.daemon.terminal.create({ cwd: project.path, startupCommand: command })
    if (response.ok && response.data) addTerminal(response.data.id)
    else setError(response.error ?? `Could not start ${command}.`)
  }

  const startValidator = async () => {
    const response = await window.daemon.validator.start('test-validator')
    if (!response.ok) setError(response.error ?? 'Validator failed to start.')
    await refresh()
  }

  const stopValidator = async () => {
    const response = await window.daemon.validator.stop()
    if (!response.ok) setError(response.error ?? 'Validator failed to stop.')
    await refresh()
  }

  return (
    <section className={styles.workflow} aria-label="Solana workflow">
      <header className={styles.sectionHeader}><span>Solana workflow</span><button type="button" className={styles.textButton} disabled={!project} onClick={() => void refresh()}>Recheck</button></header>
      {!project ? <div className={styles.workflowHint}>Open a project to inspect its environment.</div> : null}
      {error ? <div className={styles.errorState} role="alert">{error}</div> : null}
      {toolchain ? <div className={styles.statusList}>
        <ToolStatus name="Solana CLI" {...toolchain.solanaCli} />
        <ToolStatus name="Anchor" {...toolchain.anchor} />
        <ToolStatus name="Validator" {...toolchain.testValidator} />
      </div> : null}
      {projectInfo && !projectInfo.isSolanaProject ? <div className={styles.workflowHint}>No Solana project markers found. Add a Solana client dependency, Cargo program, or Anchor workspace before running chain workflows.</div> : null}
      <div className={styles.workflowActions}>
        <button type="button" disabled={!project || projectInfo?.framework !== 'anchor' || !toolchain?.anchor.installed} onClick={() => void run('anchor build')}>Build</button>
        <button type="button" disabled={!project || projectInfo?.framework !== 'anchor' || !toolchain?.anchor.installed} onClick={() => void run('anchor test --provider.cluster localnet')}>Test localnet</button>
        {validator?.status === 'running' ? (
          <button type="button" onClick={() => void stopValidator()}>Stop validator</button>
        ) : (
          <button type="button" disabled={!project || !projectInfo?.isSolanaProject || !toolchain?.testValidator.installed} onClick={() => void startValidator()}>Local validator</button>
        )}
      </div>
      <div className={styles.clusterGuard}><span>GUARDED WORKFLOWS: LOCALNET / DEVNET</span><p>Workflow actions never deploy to mainnet. Commands typed in the terminal remain under your control.</p></div>
    </section>
  )
}
