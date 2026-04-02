import { ipcMain } from 'electron'
import {
  generateTweet,
  listTweets,
  updateTweet,
  deleteTweet,
  getVoiceProfile,
  updateVoiceProfile,
} from '../services/TweetService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { TweetUpdateInput } from '../shared/types'

export function registerTweetHandlers() {
  ipcMain.handle('tweets:generate', ipcHandler(async (_event, prompt: string, mode: string, sourceTweet?: string) => {
    const validModes = ['original', 'reply', 'quote', 'thread'] as const
    if (!validModes.includes(mode as typeof validModes[number])) {
      throw new Error(`Invalid mode: ${mode}`)
    }
    return await generateTweet(prompt, mode as 'original' | 'reply' | 'quote' | 'thread', sourceTweet)
  }))

  ipcMain.handle('tweets:list', ipcHandler(async (_event, limit?: number) => {
    const safeLimitVal = Math.min(Math.max(limit ?? 50, 1), 200)
    return listTweets(safeLimitVal)
  }))

  ipcMain.handle('tweets:update', ipcHandler(async (_event, id: string, updates: TweetUpdateInput) => {
    return updateTweet(id, updates)
  }))

  ipcMain.handle('tweets:delete', ipcHandler(async (_event, id: string) => {
    deleteTweet(id)
  }))

  ipcMain.handle('tweets:voice-get', ipcHandler(async () => {
    return getVoiceProfile()
  }))

  ipcMain.handle('tweets:voice-update', ipcHandler(async (_event, systemPrompt: string, examples: string[]) => {
    updateVoiceProfile(systemPrompt, examples)
  }))
}
