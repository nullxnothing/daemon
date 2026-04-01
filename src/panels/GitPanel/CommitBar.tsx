import { useState } from 'react'
import type { GitFile } from '../../../electron/shared/types'

interface CommitBarProps {
  projectPath: string
  files: GitFile[]
  pushing: boolean
  onCommit: (msg: string) => Promise<void>
  onError: (msg: string) => void
}

const SparkleIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/>
  </svg>
)

export function CommitBar({ projectPath, files, pushing, onCommit, onError }: CommitBarProps) {
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false)

  const stagedCount = files.filter((f) => f.staged).length
  const isCommitDisabled = stagedCount === 0 || !commitMsg.trim() || committing || pushing

  const handleCommit = async () => {
    if (isCommitDisabled) return
    setCommitting(true)
    await onCommit(commitMsg.trim())
    setCommitMsg('')
    setCommitting(false)
  }

  const handleGenerateCommitMsg = async () => {
    if (!projectPath || generatingCommitMsg) return
    setGeneratingCommitMsg(true)

    const diffRes = await window.daemon.git.diffStaged(projectPath)
    if (!diffRes.ok) {
      onError(diffRes.error ? diffRes.error.replace('[CONNECT_GITHUB] ', '') : 'Failed to get diff')
      setGeneratingCommitMsg(false)
      return
    }

    if (!diffRes.data?.trim()) {
      onError('Stage files first, then generate a smart commit message.')
      setGeneratingCommitMsg(false)
      return
    }

    const suggestionRes = await window.daemon.claude.suggestCommitMessage(diffRes.data)
    if (!suggestionRes.ok || !suggestionRes.data) {
      onError(suggestionRes.error ?? 'Failed to generate commit message')
      setGeneratingCommitMsg(false)
      return
    }

    setCommitMsg(suggestionRes.data)
    setGeneratingCommitMsg(false)
  }

  return (
    <div className="git-commit-area">
      <input
        className="git-commit-input"
        placeholder="Commit message..."
        value={commitMsg}
        onChange={(e) => setCommitMsg(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void handleCommit()}
      />
      <button
        className="git-wand-btn"
        onClick={() => void handleGenerateCommitMsg()}
        disabled={generatingCommitMsg || stagedCount === 0}
        title="Generate commit message"
      >
        {generatingCommitMsg ? '...' : <SparkleIcon />}
      </button>
      <button
        className="git-commit-btn"
        onClick={() => void handleCommit()}
        disabled={isCommitDisabled}
        title={stagedCount === 0 ? 'Stage files first' : !commitMsg.trim() ? 'Enter a commit message' : ''}
      >
        {committing ? 'Committing…' : 'Commit'}
      </button>
    </div>
  )
}
