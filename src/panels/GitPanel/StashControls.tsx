import { useState } from 'react'

interface StashControlsProps {
  projectPath: string
  stashCount: number
  latestStashMessage: string | null
  onLoad: () => void
  onError: (msg: string) => void
}

export function StashControls({
  projectPath,
  stashCount,
  latestStashMessage,
  onLoad,
  onError,
}: StashControlsProps) {
  const [showStashSave, setShowStashSave] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [savingStash, setSavingStash] = useState(false)
  const [poppingStash, setPoppingStash] = useState(false)

  const parseGitError = (message: string | undefined) =>
    message ? message.replace('[CONNECT_GITHUB] ', '') : 'Git operation failed'

  const handleStashSave = async () => {
    if (!projectPath) return
    setSavingStash(true)
    const res = await window.daemon.git.stashSave(projectPath, stashMessage)
    setSavingStash(false)
    if (!res.ok) {
      onError(parseGitError(res.error) ?? 'Failed to save stash')
      return
    }
    setStashMessage('')
    setShowStashSave(false)
    onLoad()
  }

  const handleStashPop = async () => {
    if (!projectPath) return
    setPoppingStash(true)
    const res = await window.daemon.git.stashPop(projectPath)
    setPoppingStash(false)
    if (!res.ok) {
      onError(parseGitError(res.error) ?? 'Failed to restore stash')
      return
    }
    onLoad()
  }

  return (
    <>
      <button
        className="git-add-option"
        onClick={() => setShowStashSave((prev) => !prev)}
      >
        <span className="git-add-option-title">Stash changes</span>
        <span className="git-add-option-subtext">Temporarily save unfinished work and clean your workspace.</span>
      </button>

      <button
        className="git-add-option"
        onClick={() => void handleStashPop()}
        disabled={poppingStash || stashCount === 0}
      >
        <span className="git-add-option-title">Restore latest stash</span>
        <span className="git-add-option-subtext">
          {stashCount > 0
            ? `Apply your latest saved work (${stashCount} saved).`
            : 'No saved stash items yet.'}
        </span>
      </button>

      {showStashSave && (
        <div className="git-add-branch-create">
          <input
            className="git-add-branch-input"
            placeholder="Optional stash note"
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleStashSave()}
          />
          <button
            className="git-add-branch-create-btn"
            onClick={() => void handleStashSave()}
            disabled={savingStash}
          >
            {savingStash ? 'Saving…' : 'Save Stash'}
          </button>
        </div>
      )}

      {latestStashMessage && (
        <div className="git-add-meta">Latest stash: {latestStashMessage}</div>
      )}
    </>
  )
}
