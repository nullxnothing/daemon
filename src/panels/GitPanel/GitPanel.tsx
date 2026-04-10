import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useOnboardingStore } from '../../store/onboarding'
import { confirm } from '../../store/confirm'
import { useNotificationsStore } from '../../store/notifications'
import type { GitFile, GitCommit, DeployStatus } from '../../../electron/shared/types'
import './GitPanel.css'

export function GitPanel() {
  const projectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [files, setFiles] = useState<GitFile[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [pushing, setPushing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showCreateBranch, setShowCreateBranch] = useState(false)
  const [showCreateTag, setShowCreateTag] = useState(false)
  const [showStashSave, setShowStashSave] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [stashMessage, setStashMessage] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [savingStash, setSavingStash] = useState(false)
  const [poppingStash, setPoppingStash] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [stashCount, setStashCount] = useState(0)
  const [latestStashMessage, setLatestStashMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deployStatus, setDeployStatus] = useState<DeployStatus | null>(null)

  const loadDeployStatus = useCallback(async () => {
    if (!activeProjectId) return
    try {
      const res = await window.daemon.deploy.status(activeProjectId)
      if (res.ok && res.data) {
        const linked = res.data.find((s: DeployStatus) => s.linked)
        setDeployStatus(linked ?? null)
      }
    } catch { /* deploy backend may not be ready yet */ }
  }, [activeProjectId])

  useEffect(() => { loadDeployStatus() }, [loadDeployStatus])

  const parseGitError = (message: string | undefined) => {
    if (!message) return 'Git operation failed'
    return message.replace('[CONNECT_GITHUB] ', '')
  }

  const maybeShowGitHubOnboarding = (message: string | undefined) => {
    if (message?.includes('[CONNECT_GITHUB]')) {
      useOnboardingStore.getState().openWizard()
    }
  }

  const load = useCallback(async () => {
    if (!projectPath) return
    setError(null)

    const [brRes, statusRes, logRes, stashRes] = await Promise.all([
      window.daemon.git.branches(projectPath),
      window.daemon.git.status(projectPath),
      window.daemon.git.log(projectPath),
      window.daemon.git.stashList(projectPath),
    ])

    if (brRes.ok && brRes.data) {
      setBranch(brRes.data.current)
      setBranches(brRes.data.branches)
    }
    if (statusRes.ok && statusRes.data) setFiles(statusRes.data)
    else {
      maybeShowGitHubOnboarding(statusRes.error)
      setError(parseGitError(statusRes.error))
    }
    if (logRes.ok && logRes.data) setCommits(logRes.data)
    if (stashRes.ok && stashRes.data) {
      setStashCount(stashRes.data.length)
      setLatestStashMessage(stashRes.data[0]?.message ?? null)
    }
  }, [projectPath])

  useEffect(() => { load() }, [load])

  const handleStage = async (filePath: string) => {
    if (!projectPath) return
    await window.daemon.git.stage(projectPath, [filePath])
    load()
  }

  const handleUnstage = async (filePath: string) => {
    if (!projectPath) return
    await window.daemon.git.unstage(projectPath, [filePath])
    load()
  }

  const handleStageAll = async () => {
    if (!projectPath) return
    const unstaged = files.filter((f) => f.unstaged || f.untracked).map((f) => f.path)
    if (unstaged.length > 0) await window.daemon.git.stage(projectPath, unstaged)
    load()
  }

  const handleStageFolder = async (folder: string) => {
    if (!projectPath) return
    const folderFiles = files
      .filter((f) => (f.unstaged || f.untracked) && f.path.startsWith(folder + '/'))
      .map((f) => f.path)
    if (folderFiles.length > 0) await window.daemon.git.stage(projectPath, folderFiles)
    load()
  }

  const handleCommit = async () => {
    if (!projectPath || !commitMsg.trim()) return
    const hasStagedFiles = files.some((f) => f.staged)
    if (!hasStagedFiles) return

    setCommitting(true)
    setError(null)

    const commitRes = await window.daemon.git.commit(projectPath, commitMsg.trim())
    if (!commitRes.ok) {
      maybeShowGitHubOnboarding(commitRes.error)
      setError(parseGitError(commitRes.error) ?? 'Commit failed')
      setCommitting(false)
      return
    }

    setCommitMsg('')
    load()
    setCommitting(false)
  }

  const handleGenerateCommitMsg = async () => {
    if (!projectPath) return
    setGeneratingCommitMsg(true)
    setError(null)

    const diffRes = await window.daemon.git.diffStaged(projectPath)
    if (!diffRes.ok) {
      maybeShowGitHubOnboarding(diffRes.error)
      setError(parseGitError(diffRes.error))
      setGeneratingCommitMsg(false)
      return
    }

    if (!diffRes.data?.trim()) {
      setError('Stage files first, then generate a smart commit message.')
      setGeneratingCommitMsg(false)
      return
    }

    const suggestionRes = await window.daemon.claude.suggestCommitMessage(diffRes.data)
    if (!suggestionRes.ok || !suggestionRes.data) {
      setError(suggestionRes.error ?? 'Failed to generate commit message')
      setGeneratingCommitMsg(false)
      return
    }

    setCommitMsg(suggestionRes.data)
    setGeneratingCommitMsg(false)
  }

  const handlePush = async () => {
    if (!projectPath) return
    // Gate pushes to main/master with a typed-name confirmation
    if (branch === 'main' || branch === 'master') {
      const ok = await confirm({
        title: `Push to ${branch}?`,
        body: `You're about to push directly to ${branch}. Type the branch name to confirm.`,
        danger: true,
        confirmLabel: 'Push',
        typedConfirmation: branch,
      })
      if (!ok) return
    }
    setPushing(true)
    setError(null)
    const res = await window.daemon.git.push(projectPath)
    setPushing(false)
    if (!res.ok) {
      maybeShowGitHubOnboarding(res.error)
      const msg = parseGitError(res.error) ?? 'Push failed'
      setError(msg)
      useNotificationsStore.getState().pushError(msg, 'Git push')
    } else {
      useNotificationsStore.getState().pushSuccess(`Pushed ${branch ?? 'branch'}`, 'Git')
      load()
      loadDeployStatus()
    }
  }

  const handleCheckout = async (br: string) => {
    if (!projectPath) return
    const res = await window.daemon.git.checkout(projectPath, br)
    if (res.ok) load()
    else setError(res.error ?? 'Checkout failed')
  }

  const handleCreateBranch = async () => {
    if (!projectPath || !newBranchName.trim()) return

    setCreatingBranch(true)
    setError(null)

    const res = await window.daemon.git.createBranch(projectPath, newBranchName.trim())
    if (!res.ok) {
      setError(parseGitError(res.error) ?? 'Failed to create branch')
      setCreatingBranch(false)
      return
    }

    setNewBranchName('')
    setShowCreateBranch(false)
    setShowAddMenu(false)
    setCreatingBranch(false)
    load()
  }

  const handleCreateTag = async () => {
    if (!projectPath || !newTagName.trim()) return

    setCreatingTag(true)
    setError(null)

    const res = await window.daemon.git.createTag(projectPath, newTagName.trim())
    if (!res.ok) {
      setError(parseGitError(res.error) ?? 'Failed to create tag')
      setCreatingTag(false)
      return
    }

    setNewTagName('')
    setShowCreateTag(false)
    setShowAddMenu(false)
    setCreatingTag(false)
    load()
  }

  const handleFetch = async () => {
    if (!projectPath) return
    setSyncing(true)
    setError(null)
    const res = await window.daemon.git.fetch(projectPath)
    setSyncing(false)
    if (!res.ok) {
      maybeShowGitHubOnboarding(res.error)
      setError(parseGitError(res.error) ?? 'Fetch failed')
      return
    }
    load()
  }

  const handlePull = async () => {
    if (!projectPath) return
    setSyncing(true)
    setError(null)
    const res = await window.daemon.git.pull(projectPath)
    setSyncing(false)
    if (!res.ok) {
      maybeShowGitHubOnboarding(res.error)
      setError(parseGitError(res.error) ?? 'Pull failed')
      return
    }
    load()
  }

  const handleStashSave = async () => {
    if (!projectPath) return
    setSavingStash(true)
    setError(null)
    const res = await window.daemon.git.stashSave(projectPath, stashMessage)
    setSavingStash(false)
    if (!res.ok) {
      setError(parseGitError(res.error) ?? 'Failed to save stash')
      return
    }

    setStashMessage('')
    setShowStashSave(false)
    setShowAddMenu(false)
    load()
  }

  const handleStashPop = async () => {
    if (!projectPath) return
    setPoppingStash(true)
    setError(null)
    const res = await window.daemon.git.stashPop(projectPath)
    setPoppingStash(false)
    if (!res.ok) {
      setError(parseGitError(res.error) ?? 'Failed to restore stash')
      return
    }

    load()
  }

  const handleFileClick = async (filePath: string) => {
    if (!projectPath) return
    if (selectedDiffFile === filePath) {
      setSelectedDiffFile(null)
      setDiffContent(null)
      return
    }
    setSelectedDiffFile(filePath)
    setLoadingDiff(true)
    setDiffContent(null)
    const res = await window.daemon.git.diff(projectPath, filePath)
    setLoadingDiff(false)
    if (res.ok && res.data) setDiffContent(res.data)
    else setDiffContent(null)
  }

  const handleDiscard = async (filePath: string) => {
    if (!projectPath) return
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    const ok = await confirm({
      title: `Discard changes to ${fileName}?`,
      body: 'This permanently reverts uncommitted changes and cannot be undone.',
      danger: true,
      confirmLabel: 'Discard',
    })
    if (!ok) return
    setError(null)
    const res = await window.daemon.git.discard(projectPath, filePath)
    if (!res.ok) {
      const msg = res.error ?? 'Discard failed'
      setError(msg)
      useNotificationsStore.getState().pushError(msg, 'Git discard')
      return
    }
    useNotificationsStore.getState().pushSuccess(`Discarded ${fileName}`, 'Git')
    if (selectedDiffFile === filePath) {
      setSelectedDiffFile(null)
      setDiffContent(null)
    }
    load()
  }

  if (!projectPath) {
    return (
      <div className="git-center">
        <div className="git-empty">Select a project to see git status</div>
      </div>
    )
  }

  const staged = files.filter((f) => f.staged)
  const unstaged = files.filter((f) => f.unstaged || f.untracked)
  const isWorkingInCopy = !!branch && branch !== 'main' && branch !== 'master'
  const workingTreeLabel = files.length === 0 ? 'Clean' : `${unstaged.length} changes`
  const deployLabel = deployStatus ? `${deployStatus.platform === 'vercel' ? 'Vercel' : 'Railway'} ${deployStatus.latestStatus ?? 'Linked'}` : 'No linked deploy'

  return (
    <div className="git-center">
      <section className="git-workflow-hero">
        <div className="git-workflow-header">
          <div className="git-workflow-copy">
            <div className="git-workflow-kicker">Version Control</div>
            <h2 className="git-title">Git workflow</h2>
            <p className="git-workflow-text">
              Read branch state first, stage deliberately, then commit and push from one surface without losing deploy context.
            </p>
          </div>

          <div className="git-workflow-topbar">
            <div className="git-branch-selector">
              <select value={branch ?? ''} onChange={(e) => handleCheckout(e.target.value)}>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <span className="git-branch-chevron" aria-hidden="true">▾</span>
              {isWorkingInCopy && (
                <div className="git-branch-safety-pill">
                  Working safely in a copy (Branch: {branch})
                </div>
              )}
            </div>
            <div className="git-add-menu-wrap">
              <button
                className="git-add-btn"
                onClick={() => {
                  setShowAddMenu((prev) => !prev)
                  setShowCreateBranch(false)
                  setShowCreateTag(false)
                  setShowStashSave(false)
                }}
                aria-expanded={showAddMenu}
                aria-haspopup="menu"
              >
                + Add
              </button>
              {showAddMenu && (
                <div className="git-add-menu" role="menu">
              <button
                className="git-add-option"
                onClick={() => setShowCreateBranch((prev) => !prev)}
              >
                <span className="git-add-option-title">Branch</span>
                <span className="git-add-option-subtext">Best for a new idea or feature. Keeps work isolated.</span>
              </button>

              <button
                className="git-add-option"
                onClick={() => setShowCreateTag((prev) => !prev)}
              >
                <span className="git-add-option-title">Tag</span>
                <span className="git-add-option-subtext">Best for marking a release point like v1.2.0.</span>
              </button>

              <button
                className="git-add-option"
                onClick={handleFetch}
                disabled={syncing}
              >
                <span className="git-add-option-title">Fetch</span>
                <span className="git-add-option-subtext">Check cloud updates without changing your files.</span>
              </button>

              <button
                className="git-add-option"
                onClick={handlePull}
                disabled={syncing}
              >
                <span className="git-add-option-title">Pull</span>
                <span className="git-add-option-subtext">Bring cloud changes into this branch.</span>
              </button>

              <button
                className="git-add-option"
                onClick={() => setShowStashSave((prev) => !prev)}
              >
                <span className="git-add-option-title">Stash changes</span>
                <span className="git-add-option-subtext">Temporarily save unfinished work and clean your workspace.</span>
              </button>

              <button
                className="git-add-option"
                onClick={handleStashPop}
                disabled={poppingStash || stashCount === 0}
              >
                <span className="git-add-option-title">Restore latest stash</span>
                <span className="git-add-option-subtext">
                  {stashCount > 0
                    ? `Apply your latest saved work (${stashCount} saved).`
                    : 'No saved stash items yet.'}
                </span>
              </button>

              {showCreateBranch && (
                <div className="git-add-branch-create">
                  <input
                    className="git-add-branch-input"
                    placeholder="feature/your-idea"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                  />
                  <button
                    className="git-add-branch-create-btn"
                    onClick={handleCreateBranch}
                    disabled={!newBranchName.trim() || creatingBranch}
                  >
                    {creatingBranch ? 'Creating…' : 'Create & Switch'}
                  </button>
                </div>
              )}

              {showCreateTag && (
                <div className="git-add-branch-create">
                  <input
                    className="git-add-branch-input"
                    placeholder="v1.0.0"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  />
                  <button
                    className="git-add-branch-create-btn"
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim() || creatingTag}
                  >
                    {creatingTag ? 'Creating…' : 'Create Tag'}
                  </button>
                </div>
              )}

              {showStashSave && (
                <div className="git-add-branch-create">
                  <input
                    className="git-add-branch-input"
                    placeholder="Optional stash note"
                    value={stashMessage}
                    onChange={(e) => setStashMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleStashSave()}
                  />
                  <button
                    className="git-add-branch-create-btn"
                    onClick={handleStashSave}
                    disabled={savingStash}
                  >
                    {savingStash ? 'Saving…' : 'Save Stash'}
                  </button>
                </div>
              )}

              {latestStashMessage && (
                <div className="git-add-meta">Latest stash: {latestStashMessage}</div>
              )}
                </div>
              )}
            </div>
            <button className="git-push-btn" onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing...' : 'Push'}
            </button>
          </div>
        </div>

        <div className="git-workflow-metrics">
          <div className="git-workflow-metric">
            <div className="git-workflow-metric-label">Branch</div>
            <div className="git-workflow-metric-value git-workflow-metric-value--mono">{branch ?? 'Detached'}</div>
          </div>
          <div className="git-workflow-metric">
            <div className="git-workflow-metric-label">Working tree</div>
            <div className="git-workflow-metric-value">{workingTreeLabel}</div>
          </div>
          <div className="git-workflow-metric">
            <div className="git-workflow-metric-label">Ready to commit</div>
            <div className="git-workflow-metric-value">{staged.length} staged</div>
          </div>
          <div className="git-workflow-metric">
            <div className="git-workflow-metric-label">Deploy link</div>
            <div className="git-workflow-metric-value">{deployLabel}</div>
          </div>
        </div>
      </section>

      {deployStatus && (() => {
        const dotColor = deployStatus.latestStatus === 'READY' ? 'var(--green)'
          : deployStatus.latestStatus === 'BUILDING' || deployStatus.latestStatus === 'QUEUED' ? 'var(--amber)'
          : deployStatus.latestStatus === 'ERROR' ? 'var(--red)' : 'var(--t4)'
        return (
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', margin: '0 16px', fontSize: 10, color: 'var(--t2)', background: 'var(--s2)', border: '1px solid var(--s5)', borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start' }}
            onClick={() => useUIStore.getState().openWorkspaceTool('deploy')}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            <span>{deployStatus.platform === 'vercel' ? 'Vercel' : 'Railway'}: {deployStatus.latestStatus ?? 'Linked'}</span>
          </div>
        )
      })()}

      {error && <div className="git-error">{error}</div>}

      {/* Commit area */}
      <div className="git-commit-area">
        <input
          className="git-commit-input"
          placeholder="Commit message..."
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
        />
        <button className="git-wand-btn" onClick={handleGenerateCommitMsg} disabled={generatingCommitMsg || staged.length === 0} title="Generate AI commit message" aria-label="Generate AI commit message">
          {generatingCommitMsg ? '...' : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>}
        </button>
        <button className="git-commit-btn" onClick={handleCommit} disabled={staged.length === 0 || !commitMsg.trim() || committing}>
          {committing ? 'Committing…' : 'Commit'}
        </button>
      </div>

      {/* Changed files */}
      <div className="git-files">
        {staged.length > 0 && (
          <div className="git-file-section">
            <div className="git-file-section-header">
              <span>Staged ({staged.length})</span>
            </div>
            <div className="git-file-section-subtext">Select files to stage for this commit.</div>
            {staged.map((f) => (
              <div key={f.path} className={`git-file-row staged${selectedDiffFile === f.path ? ' diff-active' : ''}`}>
                <span className="git-file-status">S</span>
                <span className="git-file-path git-file-path--clickable" onClick={() => handleFileClick(f.path)}>{f.path}</span>
                <button className="git-file-btn" onClick={() => handleUnstage(f.path)}>Unstage</button>
              </div>
            ))}
          </div>
        )}

        {unstaged.length > 0 && (
          <div className="git-file-section">
            <div className="git-file-section-header">
              <span>Changes ({unstaged.length})</span>
              <button className="git-file-btn" onClick={handleStageAll}>Stage All</button>
            </div>
            <div className="git-file-section-subtext">Select files to stage for this commit.</div>
            {(() => {
              const folders = new Map<string, typeof unstaged>()
              for (const f of unstaged) {
                const sep = f.path.lastIndexOf('/')
                const folder = sep > 0 ? f.path.slice(0, sep) : '.'
                if (!folders.has(folder)) folders.set(folder, [])
                folders.get(folder)!.push(f)
              }
              return Array.from(folders.entries()).map(([folder, folderFiles]) => (
                <div key={folder} className="git-folder-group">
                  {folders.size > 1 && (
                    <div className="git-folder-header">
                      <span className="git-folder-name">{folder === '.' ? 'root' : folder}/</span>
                      <button className="git-file-btn" onClick={() => handleStageFolder(folder === '.' ? '' : folder)}>
                        Stage {folderFiles.length}
                      </button>
                    </div>
                  )}
                  {folderFiles.map((f) => (
                    <div key={f.path} className={`git-file-row${selectedDiffFile === f.path ? ' diff-active' : ''}`}>
                      <span className={`git-file-status ${f.untracked ? 'untracked' : f.deleted ? 'deleted' : 'modified'}`}>
                        {f.untracked ? 'U' : f.deleted ? 'D' : 'M'}
                      </span>
                      <span className="git-file-path git-file-path--clickable" onClick={() => handleFileClick(f.path)}>{f.path}</span>
                      {!f.untracked && (
                        <button className="git-file-btn git-file-btn--discard" onClick={() => handleDiscard(f.path)}>Discard</button>
                      )}
                      {f.untracked && (
                        <button className="git-file-btn git-file-btn--discard" onClick={() => handleDiscard(f.path)}>Delete</button>
                      )}
                      <button className="git-file-btn" onClick={() => handleStage(f.path)}>Stage</button>
                    </div>
                  ))}
                </div>
              ))
            })()}
          </div>
        )}

        {files.length === 0 && (
          <div className="git-empty-files">Working tree clean</div>
        )}
      </div>

      {/* Inline diff viewer */}
      {selectedDiffFile && (
        <div className="git-diff-viewer">
          <div className="git-diff-header">
            <span className="git-diff-filename">{selectedDiffFile}</span>
            <button className="git-diff-close" onClick={() => { setSelectedDiffFile(null); setDiffContent(null) }}>x</button>
          </div>
          {loadingDiff && <div className="git-diff-loading">Loading diff...</div>}
          {!loadingDiff && diffContent && (
            <pre className="git-diff-body">
              {diffContent.split('\n').map((line, i) => {
                const isAddition = line.startsWith('+') && !line.startsWith('+++')
                const isDeletion = line.startsWith('-') && !line.startsWith('---')
                const isHunk = line.startsWith('@@')
                return (
                  <div
                    key={i}
                    className={`git-diff-line${isAddition ? ' git-diff-line--add' : ''}${isDeletion ? ' git-diff-line--del' : ''}${isHunk ? ' git-diff-line--hunk' : ''}`}
                  >
                    <span className="git-diff-lineno">{i + 1}</span>
                    <span className="git-diff-text">{line}</span>
                  </div>
                )
              })}
            </pre>
          )}
          {!loadingDiff && !diffContent && (
            <div className="git-diff-loading">No diff available (file may be untracked or binary)</div>
          )}
        </div>
      )}

      {/* Recent commits */}
      <div className="git-log">
        <div className="git-log-header">Recent Commits</div>
        {commits.map((c) => (
          <div key={c.hash} className="git-commit-row">
            <span className="git-commit-hash">{c.short}</span>
            <span className="git-commit-msg">{c.message}</span>
            <span className="git-commit-time">{c.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
