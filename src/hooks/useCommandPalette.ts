import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../store/ui'

export function useCommandPalette() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)

  const [paletteMode, setPaletteMode] = useState<'commands' | 'files' | null>(null)
  const [paletteFiles, setPaletteFiles] = useState<Array<{ name: string; path: string }>>([])

  const flattenEntries = useCallback((entries: FileEntry[], acc: Array<{ name: string; path: string }> = []) => {
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (entry.children) flattenEntries(entry.children, acc)
      } else {
        acc.push({ name: entry.name, path: entry.path })
      }
    }
    return acc
  }, [])

  useEffect(() => {
    if (paletteMode !== 'files' || !activeProjectPath) {
      setPaletteFiles([])
      return
    }
    window.daemon.fs.readDir(activeProjectPath, 6).then((res) => {
      if (res.ok && res.data) {
        setPaletteFiles(flattenEntries(res.data))
      }
    })
  }, [paletteMode, activeProjectPath, flattenEntries])

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      if (!activeProjectId) return
      const res = await window.daemon.fs.readFile(filePath)
      if (!res.ok || !res.data) return
      const name = filePath.split(/[/\\]/).pop() ?? 'untitled'
      useUIStore.getState().openFile({
        path: res.data.path,
        name,
        content: res.data.content,
        projectId: activeProjectId,
      })
    },
    [activeProjectId],
  )

  const closePalette = useCallback(() => setPaletteMode(null), [])

  return {
    paletteMode,
    setPaletteMode,
    paletteFiles,
    handleFileSelect,
    closePalette,
  }
}
