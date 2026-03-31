import { ipcMain } from 'electron'
import {
  generateTweet,
  listTweets,
  updateTweet,
  deleteTweet,
  getVoiceProfile,
  updateVoiceProfile,
} from '../services/TweetService'
import type { TweetUpdateInput } from '../shared/types'

export function registerTweetHandlers() {
  ipcMain.handle('tweets:generate', async (_event, prompt: string, mode: string, sourceTweet?: string) => {
    try {
      const validModes = ['original', 'reply', 'quote'] as const
      if (!validModes.includes(mode as typeof validModes[number])) {
        return { ok: false, error: `Invalid mode: ${mode}` }
      }
      const result = await generateTweet(prompt, mode as 'original' | 'reply' | 'quote', sourceTweet)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('tweets:list', async (_event, limit?: number) => {
    try {
      const tweets = listTweets(limit)
      return { ok: true, data: tweets }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('tweets:update', async (_event, id: string, updates: TweetUpdateInput) => {
    try {
      const tweet = updateTweet(id, updates)
      return { ok: true, data: tweet }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('tweets:delete', async (_event, id: string) => {
    try {
      deleteTweet(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('tweets:voice-get', async () => {
    try {
      const profile = getVoiceProfile()
      return { ok: true, data: profile }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('tweets:voice-update', async (_event, systemPrompt: string, examples: string[]) => {
    try {
      updateVoiceProfile(systemPrompt, examples)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
