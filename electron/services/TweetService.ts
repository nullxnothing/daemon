import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDb } from '../db/db'
import { runPrompt } from './ClaudeRouter'
import type { Tweet, VoiceProfile } from '../shared/types'

export function getVoiceProfile(): VoiceProfile | null {
  const db = getDb()
  const row = db.prepare("SELECT * FROM voice_profile WHERE id = 'default'").get() as VoiceProfile | undefined
  return row ?? null
}

export function updateVoiceProfile(systemPrompt: string, examples: string[]): void {
  const db = getDb()
  db.prepare(
    "UPDATE voice_profile SET system_prompt = ?, examples = ?, updated_at = ? WHERE id = 'default'"
  ).run(systemPrompt, JSON.stringify(examples), Date.now())
}

/**
 * Generate tweets via ClaudeRouter (uses API key if available, falls back to CLI).
 * Returns generated tweets AND writes a .md draft file for the editor.
 */
export async function generateTweet(
  prompt: string,
  mode: 'original' | 'reply' | 'quote',
  sourceTweet?: string,
): Promise<{ tweets: Tweet[]; draftPath: string }> {
  const profile = getVoiceProfile()
  if (!profile) throw new Error('Voice profile not found')

  // Build user prompt
  let userContent = ''
  if (mode === 'reply' && sourceTweet) {
    userContent = `Write 3 reply tweet variations to this tweet:\n\n"${sourceTweet}"\n\nContext/angle: ${prompt}`
  } else if (mode === 'quote' && sourceTweet) {
    userContent = `Write 3 quote tweet variations for this tweet:\n\n"${sourceTweet}"\n\nContext/angle: ${prompt}`
  } else {
    userContent = `Write 3 original tweet variations about: ${prompt}`
  }

  userContent += '\n\nReturn ONLY a JSON array of 3 strings. No markdown, no explanation, no code fences. Example: ["tweet one", "tweet two", "tweet three"]'

  const text = await runPrompt({
      prompt: userContent,
      systemPrompt: profile.system_prompt,
      model: 'haiku',
      effort: 'low',
    })

    // Parse the JSON array from Claude's response
    let variations: string[]
    try {
      variations = JSON.parse(text)
      if (!Array.isArray(variations)) throw new Error('Not an array')
    } catch {
      const match = text.match(/\[[\s\S]*?\]/)
      if (match) {
        variations = JSON.parse(match[0])
      } else {
        variations = [text]
      }
    }

    // Save to DB
    const db = getDb()
    const insert = db.prepare(
      'INSERT INTO tweets (id, content, mode, source_tweet, status, created_at) VALUES (?,?,?,?,?,?)'
    )

    const tweets: Tweet[] = []
    const now = Math.floor(Date.now() / 1000)

    for (const content of variations) {
      const id = crypto.randomUUID()
      insert.run(id, content, mode, sourceTweet ?? null, 'pending', now)
      tweets.push({ id, content, mode, source_tweet: sourceTweet ?? null, status: 'pending', created_at: now })
    }

    // Write draft .md file for the editor canvas
    const draftDir = path.join(os.homedir(), '.daemon', 'drafts')
    if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const draftPath = path.join(draftDir, `tweets-${timestamp}.md`)

    const modeLabel = mode === 'reply' ? 'Reply' : mode === 'quote' ? 'Quote' : 'Original'
    let mdContent = `# Tweet Drafts — ${modeLabel}\n\n`
    mdContent += `> Prompt: ${prompt}\n`
    if (sourceTweet) mdContent += `> Source: ${sourceTweet}\n`
    mdContent += '\n---\n\n'

    variations.forEach((tweet, i) => {
      const charCount = tweet.length
      const charWarn = charCount > 280 ? ' ⚠️ OVER 280' : ''
      mdContent += `## Option ${i + 1} (${charCount} chars${charWarn})\n\n`
      mdContent += `${tweet}\n\n---\n\n`
    })

    mdContent += `*Generated ${new Date().toLocaleString()} · Voice: ${profile.system_prompt.slice(0, 60)}...*\n`

    fs.writeFileSync(draftPath, mdContent, 'utf8')

    return { tweets, draftPath }
}

export function listTweets(limit = 50): Tweet[] {
  const db = getDb()
  return db.prepare('SELECT * FROM tweets ORDER BY created_at DESC LIMIT ?').all(limit) as Tweet[]
}

const ALLOWED_TWEET_COLUMNS = new Set(['content', 'status'])

export function updateTweet(id: string, updates: { content?: string; status?: string }): Tweet {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  for (const key of Object.keys(updates)) {
    if (!ALLOWED_TWEET_COLUMNS.has(key)) continue
    const val = updates[key as keyof typeof updates]
    if (val !== undefined) {
      fields.push(`${key} = ?`)
      values.push(val)
    }
  }

  if (fields.length === 0) throw new Error('No valid fields to update')

  values.push(id)
  db.prepare(`UPDATE tweets SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const row = db.prepare('SELECT * FROM tweets WHERE id = ?').get(id) as Tweet | undefined
  if (!row) throw new Error('Tweet not found')
  return row
}

export function deleteTweet(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM tweets WHERE id = ?').run(id)
}

