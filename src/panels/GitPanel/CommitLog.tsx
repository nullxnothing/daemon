import type { GitCommit } from '../../../electron/shared/types'

interface CommitLogProps {
  commits: GitCommit[]
}

export function CommitLog({ commits }: CommitLogProps) {
  return (
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
  )
}
