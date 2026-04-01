import type { GitFile } from '../../../electron/shared/types'

interface StagingAreaProps {
  files: GitFile[]
  onStage: (filePath: string) => void
  onUnstage: (filePath: string) => void
  onStageAll: () => void
  onStageFolder: (folder: string) => void
}

export function StagingArea({ files, onStage, onUnstage, onStageAll, onStageFolder }: StagingAreaProps) {
  const staged = files.filter((f) => f.staged)
  const unstaged = files.filter((f) => f.unstaged || f.untracked)

  if (files.length === 0) {
    return <div className="git-empty-files">Working tree clean</div>
  }

  return (
    <div className="git-files">
      {staged.length > 0 && (
        <div className="git-file-section">
          <div className="git-file-section-header">
            <span>Staged ({staged.length})</span>
          </div>
          <div className="git-file-section-subtext">Select files to stage for this commit.</div>
          {staged.map((f) => (
            <div key={f.path} className="git-file-row staged">
              <span className="git-file-status">S</span>
              <span className="git-file-path">{f.path}</span>
              <button className="git-file-btn" onClick={() => onUnstage(f.path)}>Unstage</button>
            </div>
          ))}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="git-file-section">
          <div className="git-file-section-header">
            <span>Changes ({unstaged.length})</span>
            <button className="git-file-btn" onClick={onStageAll}>Stage All</button>
          </div>
          <div className="git-file-section-subtext">Select files to stage for this commit.</div>
          {renderFolderGroups(unstaged, onStage, onStageFolder)}
        </div>
      )}
    </div>
  )
}

function renderFolderGroups(
  unstaged: GitFile[],
  onStage: (filePath: string) => void,
  onStageFolder: (folder: string) => void,
) {
  const folders = new Map<string, GitFile[]>()
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
          <button className="git-file-btn" onClick={() => onStageFolder(folder === '.' ? '' : folder)}>
            Stage {folderFiles.length}
          </button>
        </div>
      )}
      {folderFiles.map((f) => (
        <div key={f.path} className="git-file-row">
          <span className={`git-file-status ${f.untracked ? 'untracked' : 'modified'}`}>
            {f.untracked ? 'U' : 'M'}
          </span>
          <span className="git-file-path">{f.path}</span>
          <button className="git-file-btn" onClick={() => onStage(f.path)}>Stage</button>
        </div>
      ))}
    </div>
  ))
}
