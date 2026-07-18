import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { CaretDown, CaretRight, File, Folder, FolderOpen, Plus } from '@phosphor-icons/react'
import type { FileEntry, Project } from '../../../electron/shared/types'
import { useLiteWorkbenchStore } from './liteWorkbenchStore'
import styles from './LiteWorkbench.module.css'

const EDITABLE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'md', 'rs', 'toml', 'yaml', 'yml', 'sh', 'ps1', 'txt', 'env', 'gitignore'])

function isEditableTextFile(entry: FileEntry): boolean {
  const normalized = entry.name.toLowerCase()
  if (normalized.includes('keypair') || normalized === 'id.json') return false
  const extension = normalized.includes('.') ? normalized.split('.').at(-1) ?? '' : normalized
  return EDITABLE_EXTENSIONS.has(extension)
}

function containsPath(entries: FileEntry[], path: string): boolean {
  return entries.some((entry) => entry.path === path || (entry.children ? containsPath(entry.children, path) : false))
}

function TreeEntry({ entry, depth, focusedPath, onFocus, onOpen }: { entry: FileEntry; depth: number; focusedPath: string | null; onFocus: (path: string) => void; onOpen: (entry: FileEntry) => void }) {
  const [isExpanded, setIsExpanded] = useState(depth < 1)
  const Glyph = entry.isDirectory ? (isExpanded ? FolderOpen : Folder) : File
  const hasChildren = entry.isDirectory && Boolean(entry.children?.length)

  return (
    <div role="none">
      <button
        type="button"
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={entry.isDirectory ? isExpanded : undefined}
        tabIndex={focusedPath === entry.path ? 0 : -1}
        className={styles.treeRow}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => entry.isDirectory ? setIsExpanded((value) => !value) : onOpen(entry)}
        onFocus={() => onFocus(entry.path)}
      >
        {entry.isDirectory ? (isExpanded ? <CaretDown size={11} /> : <CaretRight size={11} />) : <span className={styles.treeSpacer} />}
        <Glyph size={13} aria-hidden="true" />
        <span>{entry.name}</span>
      </button>
      {isExpanded && hasChildren ? <div role="group">{entry.children?.map((child) => (
        <TreeEntry key={child.path} entry={child} depth={depth + 1} focusedPath={focusedPath} onFocus={onFocus} onOpen={onOpen} />
      ))}</div> : null}
    </div>
  )
}

export function LiteExplorer({ project, onOpenProject }: { project: Project | null; onOpenProject: () => void }) {
  const tree = useLiteWorkbenchStore((state) => state.tree)
  const setTree = useLiteWorkbenchStore((state) => state.setTree)
  const openFile = useLiteWorkbenchStore((state) => state.openFile)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!project) return
    setIsLoading(true)
    const response = await window.daemon.fs.readDir(project.path, 4)
    setIsLoading(false)
    if (!response.ok || !response.data) {
      setError(response.error ?? 'Could not read this project.')
      return
    }
    const nextTree = response.data
    setError(null)
    setTree(nextTree)
    setFocusedPath((current) => current && containsPath(nextTree, current) ? current : nextTree[0]?.path ?? null)
  }, [project, setTree])

  useEffect(() => {
    void refresh()
    if (!project) return
    void window.daemon.fs.watch(project.path)
    const unsubscribe = window.daemon.fs.onChanged(({ rootPath }) => {
      if (rootPath === project.path) void refresh()
    })
    return () => {
      unsubscribe()
      void window.daemon.fs.unwatch()
    }
  }, [project, refresh])

  const handleOpen = async (entry: FileEntry) => {
    if (!isEditableTextFile(entry)) {
      setError(`${entry.name} is not opened as text to prevent binary or key material corruption.`)
      return
    }
    const response = await window.daemon.fs.readFile(entry.path)
    if (!response.ok || !response.data) {
      setError(response.error ?? `Could not open ${entry.name}.`)
      return
    }
    if (response.data.content.includes('\0')) {
      setError(`${entry.name} contains binary data and cannot be edited safely.`)
      return
    }
    openFile({ path: entry.path, name: entry.name, content: response.data.content, savedContent: response.data.content })
  }

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="treeitem"]'))
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    const current = items[index]
    let target: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') target = items[index + 1]
    else if (event.key === 'ArrowUp') target = items[index - 1]
    else if (event.key === 'Home') target = items[0]
    else if (event.key === 'End') target = items.at(-1)
    else if (event.key === 'ArrowRight') {
      if (current.getAttribute('aria-expanded') === 'false') current.click()
      else target = items[index + 1]
    } else if (event.key === 'ArrowLeft') {
      if (current.getAttribute('aria-expanded') === 'true') current.click()
      else {
        const level = Number(current.getAttribute('aria-level'))
        target = items.slice(0, index).reverse().find((item) => Number(item.getAttribute('aria-level')) < level)
      }
    } else return
    event.preventDefault()
    target?.focus()
  }

  return (
    <section className={styles.explorer} aria-label="Project explorer" aria-busy={isLoading}>
      <header className={styles.sectionHeader}>
        <span>{project?.name ?? 'Explorer'}</span>
        <button type="button" className={styles.iconButton} aria-label="Open project folder" onClick={onOpenProject}>
          <Plus size={14} />
        </button>
      </header>
      {!project ? (
        <div className={styles.emptyState}>
          <FolderOpen size={24} />
          <p>Open a local Solana project to start.</p>
          <button type="button" className={styles.primaryButton} onClick={onOpenProject}>Open folder</button>
        </div>
      ) : isLoading ? (
        <div className={styles.emptyState} role="status">Loading project files…</div>
      ) : error ? (
        <div className={styles.errorState} role="alert">{error}</div>
      ) : (
        <div className={styles.tree} role="tree" aria-label={`${project.name} files`} onKeyDown={handleTreeKeyDown}>{tree.length ? tree.map((entry) => <TreeEntry key={entry.path} entry={entry} depth={0} focusedPath={focusedPath} onFocus={setFocusedPath} onOpen={handleOpen} />) : <div className={styles.emptyState}>This folder is empty.</div>}</div>
      )}
    </section>
  )
}
