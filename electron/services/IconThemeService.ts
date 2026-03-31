import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

interface IconDefinition {
  iconPath: string
}

export interface RuntimeIconTheme {
  name: string
  rootPath: string
  hidesExplorerArrows: boolean
  file: string
  folder: string
  folderExpanded: string
  rootFolder?: string
  rootFolderExpanded?: string
  iconDefinitions: Record<string, IconDefinition>
  fileExtensions?: Record<string, string>
  fileNames?: Record<string, string>
  folderNames?: Record<string, string>
}

let cachedTheme: RuntimeIconTheme | null | undefined

export function getInstalledBeardedIconsTheme(): RuntimeIconTheme | null {
  if (cachedTheme !== undefined) return cachedTheme

  try {
    const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions')
    const matches = fs.readdirSync(extensionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('beardedbear.beardedicons-'))
      .map((entry) => path.join(extensionsDir, entry.name))

    if (matches.length === 0) {
      cachedTheme = null
      return cachedTheme
    }

    matches.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    const rootPath = matches[0]
    const raw = fs.readFileSync(path.join(rootPath, 'icons.json'), 'utf8')
    const parsed = JSON.parse(raw) as Omit<RuntimeIconTheme, 'name' | 'rootPath'>

    cachedTheme = {
      name: 'Bearded Icons',
      rootPath,
      hidesExplorerArrows: Boolean(parsed.hidesExplorerArrows),
      file: parsed.file,
      folder: parsed.folder,
      folderExpanded: parsed.folderExpanded,
      rootFolder: parsed.rootFolder,
      rootFolderExpanded: parsed.rootFolderExpanded,
      iconDefinitions: parsed.iconDefinitions,
      fileExtensions: parsed.fileExtensions ?? {},
      fileNames: parsed.fileNames ?? {},
      folderNames: parsed.folderNames ?? {},
    }
    return cachedTheme
  } catch {
    cachedTheme = null
    return cachedTheme
  }
}
