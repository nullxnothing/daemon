import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDb } from '../db/db'
import { runPrompt } from './ClaudeRouter'
import type { Tweet, VoiceProfile } from '../shared/types'

const DEFAULT_VOICE_PROMPT =
  "You are a sharp, concise social media writer. Write like a real person — no corporate speak, no filler, no hashtags unless specifically asked. Match the energy of the conversation. Be witty when appropriate, direct always. Never use phrases like 'Great point!' or 'This is so true!' — those are AI tells."

export function getVoiceProfile(): VoiceProfile {
  const db = getDb()
  const row = db.prepare("SELECT * FROM voice_profile WHERE id = 'default'").get() as VoiceProfile | undefined
  if (row) return row

  // Auto-create default profile on first use
  const now = Date.now()
  db.prepare(
    "INSERT INTO voice_profile (id, system_prompt, examples, updated_at) VALUES ('default', ?, '[]', ?)"
  ).run(DEFAULT_VOICE_PROMPT, now)

  return { id: 'default', system_prompt: DEFAULT_VOICE_PROMPT, examples: '[]', updated_at: now }
}

export function updateVoiceProfile(systemPrompt: string, examples: string[]): void {
  const db = getDb()
  db.prepare(
    "UPDATE voice_profile SET system_prompt = ?, examples = ?, updated_at = ? WHERE id = 'default'"
  ).run(systemPrompt, JSON.stringify(examples), Date.now())
}

type TweetMode = 'original' | 'reply' | 'quote' | 'thread'

const MODE_PROMPTS: Record<TweetMode, (prompt: string, sourceTweet?: string) => string> = {
  reply: (prompt, sourceTweet) => [
    'Read the following tweet carefully. Write 3 reply variations that are conversational and natural.',
    'Match or contrast the tone of the original — do not default to agreement.',
    'No sycophantic openers ("Great point!", "So true!", "This!"). Get straight to the substance.',
    'Keep each reply under 280 characters. No hashtags. No "1/" thread numbering.',
    '',
    `Source tweet: "${sourceTweet}"`,
    '',
    `Angle/context: ${prompt}`,
  ].join('\n'),

  quote: (prompt, sourceTweet) => [
    'Write 3 quote-tweet variations for the tweet below.',
    'Add a unique perspective, hot take, or counterpoint — do NOT just restate what the original says.',
    'Each must stand alone as interesting even without reading the quoted tweet.',
    'Keep each under 280 characters. No hashtags. No "1/" thread numbering.',
    '',
    `Quoted tweet: "${sourceTweet}"`,
    '',
    `Angle/context: ${prompt}`,
  ].join('\n'),

  original: (prompt) => [
    'Write 3 original tweet variations on the topic below.',
    'Be concise and punchy. No thread-bait formulas ("A thread:", "Here\'s what nobody talks about:").',
    'No hashtags. No "1/" numbering. Each under 280 characters.',
    '',
    `Topic: ${prompt}`,
  ].join('\n'),

  thread: (prompt, sourceTweet) => [
    'Write a reply thread of 2-4 tweets responding to the tweet below.',
    'The first tweet is the direct reply. Subsequent tweets continue the thought.',
    'Number them (1/N, 2/N, etc). Each tweet must be under 280 characters individually.',
    'Be substantive — no filler tweets. No hashtags.',
    '',
    sourceTweet ? `Source tweet: "${sourceTweet}"` : '',
    '',
    `Angle/context: ${prompt}`,
    '',
    'Return a JSON array of strings where each string is one tweet in the thread, in order.',
  ].filter(Boolean).join('\n'),
}

/**
 * Extract a JSON array from Claude's response, handling markdown fences and other wrapping.
 */
function parseVariations(text: string): string[] {
  // Direct parse first
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed
  } catch { /* fall through */ }

  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim())
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed
    } catch { /* fall through */ }
  }

  // Greedy bracket extraction — find the outermost [ ... ]
  const bracketStart = text.indexOf('[')
  const bracketEnd = text.lastIndexOf(']')
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    try {
      const parsed = JSON.parse(text.slice(bracketStart, bracketEnd + 1))
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed
    } catch { /* fall through */ }
  }

  // Last resort — return raw text as single variation
  return [text.trim()]
}

/**
 * Generate tweets via ClaudeRouter (uses API key if available, falls back to CLI).
 * Returns generated tweets AND writes a .md draft file for the editor.
 */
export async function generateTweet(
  prompt: string,
  mode: TweetMode,
  sourceTweet?: string,
): Promise<{ tweets: Tweet[]; draftPath: string }> {
  const profile = getVoiceProfile()

  const buildPrompt = MODE_PROMPTS[mode]
  const userContent = buildPrompt(prompt, sourceTweet)
    + '\n\nReturn ONLY a JSON array of strings. No markdown, no explanation, no code fences. Example: ["tweet one", "tweet two", "tweet three"]'

  const text = await runPrompt({
    prompt: userContent,
    systemPrompt: profile.system_prompt,
    model: 'haiku',
    effort: 'low',
  })

  const variations = parseVariations(text)

  // Save to DB
  const db = getDb()
  const insert = db.prepare(
    'INSERT INTO tweets (id, content, mode, source_tweet, status, created_at) VALUES (?,?,?,?,?,?)'
  )

  const tweets: Tweet[] = []
  const now = Date.now()

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

  const MODE_LABELS: Record<TweetMode, string> = {
    reply: 'Reply', quote: 'Quote', original: 'Original', thread: 'Thread',
  }
  const modeLabel = MODE_LABELS[mode]
  let mdContent = `# Tweet Drafts — ${modeLabel}\n\n`
  mdContent += `> Prompt: ${prompt}\n`
  if (sourceTweet) mdContent += `> Source: ${sourceTweet}\n`
  mdContent += '\n---\n\n'

  variations.forEach((tweet, i) => {
    const charCount = tweet.length
    const charWarn = charCount > 280 ? ' OVER 280' : ''
    const label = mode === 'thread' ? `Tweet ${i + 1}/${variations.length}` : `Option ${i + 1}`
    mdContent += `## ${label} (${charCount} chars${charWarn})\n\n`
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

