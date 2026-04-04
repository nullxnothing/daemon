import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getBooleanSetting, setBooleanSetting } from './SettingsService'
import { getDb } from '../db/db'

const SKILL_FILES = [
  'SKILL.md',
  'frontend-framework-kit.md',
  'kit-web3-interop.md',
  'programs-anchor.md',
  'programs-pinocchio.md',
  'testing.md',
  'idl-codegen.md',
  'payments.md',
  'security.md',
  'resources.md',
]

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/solana-foundation/solana-dev-skill/main/skill'

// Skill files ship with the app in electron/skills/solana-dev/
// At runtime they're read from the app bundle or dev source
function getSkillDir(): string {
  const devPath = path.join(__dirname, '..', 'skills', 'solana-dev')
  if (fs.existsSync(devPath)) return devPath

  // Production: inside dist-electron
  const prodPath = path.join(app.getAppPath(), 'dist-electron', 'skills', 'solana-dev')
  if (fs.existsSync(prodPath)) return prodPath

  // Fallback to app data for user-updated files
  const userPath = path.join(app.getPath('userData'), 'skills', 'solana-dev')
  return userPath
}

function getUserSkillDir(): string {
  const dir = path.join(app.getPath('userData'), 'skills', 'solana-dev')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Check if the Solana Dev Skill is enabled for a given project */
export function isEnabled(projectId: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`solana_skill_${projectId}`) as { value: string } | undefined
  if (!row) return true // Default ON
  return row.value === 'true'
}

/** Toggle the Solana Dev Skill for a project */
export function setEnabled(projectId: string, enabled: boolean): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(`solana_skill_${projectId}`, enabled ? 'true' : 'false', Date.now())
}

/** Read all skill file contents and return concatenated text */
export function readSkillContent(): string {
  const userDir = getUserSkillDir()
  const bundledDir = getSkillDir()
  const sections: string[] = []

  for (const file of SKILL_FILES) {
    // Prefer user-updated files over bundled
    const userFile = path.join(userDir, file)
    const bundledFile = path.join(bundledDir, file)
    const filePath = fs.existsSync(userFile) ? userFile : bundledFile

    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim()
        if (content) sections.push(content)
      } catch (err) {
        console.warn(`[SolanaSkill] failed to read ${file}:`, (err as Error).message)
      }
    }
  }

  return sections.join('\n\n---\n\n')
}

/** Whether auto-update is enabled */
export function isAutoUpdateEnabled(): boolean {
  return getBooleanSetting('solana_skill_auto_update', false)
}

/** Toggle auto-update */
export function setAutoUpdateEnabled(enabled: boolean): void {
  setBooleanSetting('solana_skill_auto_update', enabled)
}

/** Fetch latest skill files from GitHub and save to user data dir */
export async function updateSkillFiles(): Promise<{ updated: number; errors: string[] }> {
  const dir = getUserSkillDir()
  let updated = 0
  const errors: string[] = []

  // Map filenames to their GitHub paths
  const fileUrls: Record<string, string> = {
    'SKILL.md': `${GITHUB_RAW_BASE}/SKILL.md`,
    'frontend-framework-kit.md': `${GITHUB_RAW_BASE}/references/frontend-framework-kit.md`,
    'kit-web3-interop.md': `${GITHUB_RAW_BASE}/references/kit-web3-interop.md`,
    'programs-anchor.md': `${GITHUB_RAW_BASE}/references/programs/anchor.md`,
    'programs-pinocchio.md': `${GITHUB_RAW_BASE}/references/programs/pinocchio.md`,
    'testing.md': `${GITHUB_RAW_BASE}/references/testing.md`,
    'idl-codegen.md': `${GITHUB_RAW_BASE}/references/idl-codegen.md`,
    'payments.md': `${GITHUB_RAW_BASE}/references/payments.md`,
    'security.md': `${GITHUB_RAW_BASE}/references/security.md`,
    'resources.md': `${GITHUB_RAW_BASE}/references/resources.md`,
  }

  for (const [filename, url] of Object.entries(fileUrls)) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        errors.push(`${filename}: HTTP ${response.status}`)
        continue
      }
      const content = await response.text()
      if (content.trim()) {
        fs.writeFileSync(path.join(dir, filename), content, 'utf8')
        updated++
      }
    } catch (err) {
      errors.push(`${filename}: ${(err as Error).message}`)
    }
  }

  // Record last update time
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run('solana_skill_last_update', String(Date.now()), Date.now())

  return { updated, errors }
}

/** Get the timestamp of the last skill update */
export function getLastUpdateTime(): number | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('solana_skill_last_update') as { value: string } | undefined
  return row ? Number(row.value) : null
}
