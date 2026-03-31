import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import type { GitFile, GitCommit } from '../../../electron/shared/types'
import './GitPanel.css'

export function GitPanel() {
  const projectPath = useUIStore((s) => s.activeProjectPath)
  const [branch, setBranch] = useState<string | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [files, setFiles] = useState<GitFile[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectPath) return
    setError(null)

    const [brRes, statusRes, logRes] = await Promise.all([
      window.daemon.git.branches(projectPath),
      window.daemon.git.status(projectPath),
      window.daemon.git.log(projectPath),
    ])

    if (brRes.ok && brRes.data) {
      setBranch(brRes.data.current)
      setBranches(brRes.data.branches)
    }
    if (statusRes.ok && statusRes.data) setFiles(statusRes.data)
    if (logRes.ok && logRes.data) setCommits(logRes.data)
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

  const handleCommit = async () => {
    if (!projectPath || !commitMsg.trim()) return
    setError(null)
    const res = await window.daemon.git.commit(projectPath, commitMsg.trim())
    if (res.ok) {
      setCommitMsg('')
      load()
    } else {
      setError(res.error ?? 'Commit failed')
    }
  }

  const handlePush = async () => {
    if (!projectPath) return
    setPushing(true)
    setError(null)
    const res = await window.daemon.git.push(projectPath)
    setPushing(false)
    if (!res.ok) setError(res.error ?? 'Push failed')
    else load()
  }

  const handleCheckout = async (br: string) => {
    if (!projectPath) return
    const res = await window.daemon.git.checkout(projectPath, br)
    if (res.ok) load()
    else setError(res.error ?? 'Checkout failed')
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

  return (
    <div className="git-center">
      {/* Header */}
      <div className="git-header">
        <h2 className="git-title">Git</h2>
        <div className="git-branch-selector">
          <select value={branch ?? ''} onChange={(e) => handleCheckout(e.target.value)}>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <button className="git-push-btn" onClick={handlePush} disabled={pushing}>
          {pushing ? 'Pushing...' : 'Push'}
        </button>
      </div>

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
        <button className="git-commit-btn" onClick={handleCommit} disabled={staged.length === 0 || !commitMsg.trim()}>
          Commit ({staged.length})
        </button>
      </div>

      {/* Changed files */}
      <div className="git-files">
        {staged.length > 0 && (
          <div className="git-file-section">
            <div className="git-file-section-header">
              <span>Staged ({staged.length})</span>
            </div>
            {staged.map((f) => (
              <div key={f.path} className="git-file-row staged">
                <span className="git-file-status">S</span>
                <span className="git-file-path">{f.path}</span>
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
            {unstaged.map((f) => (
              <div key={f.path} className="git-file-row">
                <span className={`git-file-status ${f.untracked ? 'untracked' : 'modified'}`}>
                  {f.untracked ? 'U' : 'M'}
                </span>
                <span className="git-file-path">{f.path}</span>
                <button className="git-file-btn" onClick={() => handleStage(f.path)}>Stage</button>
              </div>
            ))}
          </div>
        )}

        {files.length === 0 && (
          <div className="git-empty-files">Working tree clean</div>
        )}
      </div>

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
