import { useState } from 'react'
import type { GitFile } from '../../../electron/shared/types'

interface BranchSelectorProps {
  projectPath: string
  branch: string | null
  branches: string[]
  files: GitFile[]
  stashCount: number
  latestStashMessage: string | null
  pushing: boolean
  onLoad: () => void
  onError: (msg: string) => void
  onMaybeShowGitHubOnboarding: (message: string | undefined) => void
}

export function BranchSelector({
  projectPath,
  branch,
  branches,
  files,
  stashCount,
  latestStashMessage,
  pushing,
  onLoad,
  onError,
  onMaybeShowGitHubOnboarding,
}: BranchSelectorProps) {
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

  const parseGitError = (message: string | undefined) =>
    message ? message.replace('[CONNECT_GITHUB] ', '') : 'Git operation failed'

  const isWorkingInCopy = !!branch && branch !== 'main' && branch !== 'master'
  const hasUnstagedChanges = files.some((f) => f.unstaged || f.untracked)

  const closeMenu = () => {
    setShowAddMenu(false)
    setShowCreateBranch(false)
    setShowCreateTag(false)
    setShowStashSave(false)
  }

  const handleCheckout = async (br: string) => {
    if (!projectPath || br === branch) return

    if (hasUnstagedChanges) {
      const confirmed = window.confirm(
        `You have unstaged changes. Checking out "${br}" may overwrite them. Continue?`
      )
      if (!confirmed) return
    }

    const res = await window.daemon.git.checkout(projectPath, br)
    if (res.ok) onLoad()
    else onError(res.error ?? 'Checkout failed')
  }

  const handleCreateBranch = async () => {
    if (!projectPath || !newBranchName.trim()) return
    setCreatingBranch(true)
    const res = await window.daemon.git.createBranch(projectPath, newBranchName.trim())
    if (!res.ok) {
      onError(parseGitError(res.error) ?? 'Failed to create branch')
      setCreatingBranch(false)
      return
    }
    setNewBranchName('')
    closeMenu()
    setCreatingBranch(false)
    onLoad()
  }

  const handleCreateTag = async () => {
    if (!projectPath || !newTagName.trim()) return
    setCreatingTag(true)
    const res = await window.daemon.git.createTag(projectPath, newTagName.trim())
    if (!res.ok) {
      onError(parseGitError(res.error) ?? 'Failed to create tag')
      setCreatingTag(false)
      return
    }
    setNewTagName('')
    closeMenu()
    setCreatingTag(false)
    onLoad()
  }

  const handleFetch = async () => {
    if (!projectPath) return
    setSyncing(true)
    const res = await window.daemon.git.fetch(projectPath)
    setSyncing(false)
    if (!res.ok) {
      onMaybeShowGitHubOnboarding(res.error)
      onError(parseGitError(res.error) ?? 'Fetch failed')
      return
    }
    onLoad()
  }

  const handlePull = async () => {
    if (!projectPath) return
    setSyncing(true)
    const res = await window.daemon.git.pull(projectPath)
    setSyncing(false)
    if (!res.ok) {
      onMaybeShowGitHubOnboarding(res.error)
      onError(parseGitError(res.error) ?? 'Pull failed')
      return
    }
    onLoad()
  }

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
    closeMenu()
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
      <div className="git-branch-selector">
        {branches.length === 0 ? (
          <select disabled>
            <option disabled>Loading...</option>
          </select>
        ) : (
          <select value={branch ?? ''} onChange={(e) => void handleCheckout(e.target.value)}>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        )}
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
            <button className="git-add-option" onClick={() => setShowCreateBranch((prev) => !prev)}>
              <span className="git-add-option-title">Branch</span>
              <span className="git-add-option-subtext">Best for a new idea or feature. Keeps work isolated.</span>
            </button>

            <button className="git-add-option" onClick={() => setShowCreateTag((prev) => !prev)}>
              <span className="git-add-option-title">Tag</span>
              <span className="git-add-option-subtext">Best for marking a release point like v1.2.0.</span>
            </button>

            <button className="git-add-option" onClick={() => void handleFetch()} disabled={syncing}>
              <span className="git-add-option-title">Fetch</span>
              <span className="git-add-option-subtext">Check cloud updates without changing your files.</span>
            </button>

            <button className="git-add-option" onClick={() => void handlePull()} disabled={syncing}>
              <span className="git-add-option-title">Pull</span>
              <span className="git-add-option-subtext">Bring cloud changes into this branch.</span>
            </button>

            <button className="git-add-option" onClick={() => setShowStashSave((prev) => !prev)}>
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

            {showCreateBranch && (
              <div className="git-add-branch-create">
                <input
                  className="git-add-branch-input"
                  placeholder="feature/your-idea"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreateBranch()}
                />
                <button
                  className="git-add-branch-create-btn"
                  onClick={() => void handleCreateBranch()}
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
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreateTag()}
                />
                <button
                  className="git-add-branch-create-btn"
                  onClick={() => void handleCreateTag()}
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
          </div>
        )}
      </div>
    </>
  )
}
