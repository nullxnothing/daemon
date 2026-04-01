import { useState } from 'react'
import type { GitFile } from '../../../electron/shared/types'

interface CommitBarProps {
  projectPath: string
  files: GitFile[]
  pushing: boolean
  onCommitOnly: (msg: string) => Promise<void>
  onCommitAndPush: (msg: string) => Promise<void>
  onError: (msg: string) => void
}

const WandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4V2m0 2v2m0-2h2m-2 0h-2" />
    <path d="M8.5 8.5 21 21" />
    <path d="m6 13 1.5-1.5" />
    <path d="m3 3 1.5 1.5" />
    <path d="M20 4V2m0 2v2m0-2h2m-2 0h-2" />
    <path d="m3 10 2-2" />
  </svg>
)

export function CommitBar({
  projectPath,
  files,
  pushing,
  onCommitOnly,
  onCommitAndPush,
  onError,
}: CommitBarProps) {
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [generatingCommitMsg, setGeneratingCommitMsg] = useState(false)

  const stagedCount = files.filter((f) => f.staged).length
  const isCommitDisabled = stagedCount === 0 || !commitMsg.trim() || committing || pushing

  const handleCommit = async () => {
    if (isCommitDisabled) return
    setCommitting(true)
    await onCommitOnly(commitMsg.trim())
    setCommitMsg('')
    setCommitting(false)
  }

  const handleCommitAndPush = async () => {
    if (isCommitDisabled) return
    setCommitting(true)
    await onCommitAndPush(commitMsg.trim())
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
        {generatingCommitMsg ? '...' : <WandIcon />}
      </button>
      <button
        className="git-commit-btn git-commit-btn--local"
        onClick={() => void handleCommit()}
        disabled={isCommitDisabled}
        title={stagedCount === 0 ? 'Stage files first' : !commitMsg.trim() ? 'Enter a commit message' : ''}
      >
        {committing && !pushing ? 'Committing…' : 'Commit'}
      </button>
      <button
        className="git-commit-btn"
        onClick={() => void handleCommitAndPush()}
        disabled={isCommitDisabled}
      >
        {committing && pushing ? 'Pushing…' : 'Commit & Push'}
      </button>
    </div>
  )
}
