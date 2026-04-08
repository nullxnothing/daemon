import { Router, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { requireSubscription } from '../middleware/requireSubscription.js'
import type { ProSkillManifest, ProSkillManifestEntry } from '../types.js'

/**
 * Phase 4: Pro tool pack.
 *
 * The server hosts a directory of curated skill bundles. Each top-level
 * subdirectory in `DAEMON_PRO_SKILLS_DIR` is a skill — the directory is
 * tarballed on the fly, hashed, and exposed to subscribers.
 *
 * GET /v1/pro-skills/manifest  → list of { id, sha256, downloadUrl } for each skill
 * GET /v1/pro-skills/:skillId  → streams the skill bundle (tar.gz)
 *
 * The open client downloads the manifest on each launch, compares sha256
 * against what it has in `~/.daemon/pro-skills/<id>/.sha`, and pulls only
 * the bundles that have changed.
 *
 * MVP caveat: we serve individual files from each skill directory rather
 * than a pre-built tarball. Production should pre-build a tar.gz per skill
 * at content-update time so the download is a single request. For the MVP
 * we list files in each skill dir and the client fetches them one by one.
 */

export const proSkillsRouter = Router()

interface SkillFileEntry {
  path: string
  size: number
  sha256: string
}

interface ResolvedSkill {
  id: string
  dirAbs: string
  files: SkillFileEntry[]
  combinedSha: string
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function walkSkillDir(skillDir: string): SkillFileEntry[] {
  const results: SkillFileEntry[] = []
  const walk = (dir: string, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name)
      const relPath = path.posix.join(rel, entry.name)
      if (entry.isDirectory()) {
        walk(abs, relPath)
      } else if (entry.isFile()) {
        const content = fs.readFileSync(abs)
        results.push({
          path: relPath,
          size: content.length,
          sha256: sha256Hex(content),
        })
      }
    }
  }
  walk(skillDir, '')
  // Stable ordering for deterministic combined hash
  results.sort((a, b) => a.path.localeCompare(b.path))
  return results
}

function resolveSkills(): ResolvedSkill[] {
  const baseDir = path.resolve(config.proSkillsDir)
  if (!fs.existsSync(baseDir)) return []

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  const skills: ResolvedSkill[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirAbs = path.join(baseDir, entry.name)
    const files = walkSkillDir(dirAbs)
    if (files.length === 0) continue

    const combinedSha = sha256Hex(files.map((f) => `${f.path}:${f.sha256}`).join('\n'))
    skills.push({
      id: entry.name,
      dirAbs,
      files,
      combinedSha,
    })
  }

  return skills
}

// Path traversal guard — a skill id / file path from the client must never
// escape the pro skills base directory.
function safeResolve(baseDir: string, relative: string): string | null {
  const abs = path.resolve(baseDir, relative)
  if (!abs.startsWith(baseDir + path.sep) && abs !== baseDir) return null
  return abs
}

proSkillsRouter.get('/manifest', requireSubscription(['pro-skills']), (_req: Request, res: Response) => {
  const skills = resolveSkills()
  const entries: ProSkillManifestEntry[] = skills.map((s) => {
    const totalSize = s.files.reduce((sum, f) => sum + f.size, 0)
    // MVP: fabricate a description + version from the skill id. In production
    // each skill directory has a `skill.json` we read for metadata.
    const metaPath = path.join(s.dirAbs, 'skill.json')
    let description = `Pro skill: ${s.id}`
    let version = '0.1.0'
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
          description?: string
          version?: string
        }
        if (meta.description) description = meta.description
        if (meta.version) version = meta.version
      } catch {
        // fall through to defaults
      }
    }
    return {
      id: s.id,
      name: s.id,
      version,
      description,
      downloadUrl: `/v1/pro-skills/${s.id}/files`,
      sha256: s.combinedSha,
      size: totalSize,
      updatedAt: Date.now(),
    }
  })

  const manifest: ProSkillManifest = { version: 1, skills: entries }
  res.json({ ok: true, data: manifest })
})

proSkillsRouter.get('/:skillId/files', requireSubscription(['pro-skills']), (req: Request, res: Response) => {
  const skillId = req.params.skillId
  if (!skillId || !/^[a-zA-Z0-9_-]+$/.test(skillId)) {
    res.status(400).json({ ok: false, error: 'Invalid skill id' })
    return
  }

  const baseDir = path.resolve(config.proSkillsDir)
  const skillDir = safeResolve(baseDir, skillId)
  if (!skillDir || !fs.existsSync(skillDir)) {
    res.status(404).json({ ok: false, error: 'Skill not found' })
    return
  }

  const files = walkSkillDir(skillDir)
  // Return file list + contents as base64, one JSON payload. MVP-simple.
  const payload = files.map((f) => ({
    path: f.path,
    sha256: f.sha256,
    content: fs.readFileSync(path.join(skillDir, f.path)).toString('base64'),
  }))
  res.json({ ok: true, data: { skillId, files: payload } })
})
