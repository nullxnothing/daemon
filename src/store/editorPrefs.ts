import { create } from 'zustand'
import type { EditorPrefs } from '../../electron/shared/types'
import { runIpc } from '../lib/runIpc'

// Mirror of SettingsService.DEFAULT_EDITOR_PREFS — used until the persisted prefs
// load from the main process. Keep in sync with the main-side defaults.
const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  fontFamily: "'Geist Mono', 'Cascadia Code', monospace",
  fontSize: 13,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  theme: 'daemon-dark',
}

interface EditorPrefsState {
  prefs: EditorPrefs
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<EditorPrefs>) => Promise<void>
}

export const useEditorPrefsStore = create<EditorPrefsState>((set, get) => ({
  prefs: DEFAULT_EDITOR_PREFS,
  loaded: false,

  load: async () => {
    const prefs = await runIpc(window.daemon.settings.getEditorPrefs(), { context: 'Editor settings' })
    if (prefs) set({ prefs, loaded: true })
    else set({ loaded: true })
  },

  // Optimistic: apply locally so Monaco updates immediately, then persist. The main
  // process sanitizes and returns the canonical prefs, which we reconcile.
  update: async (patch) => {
    set({ prefs: { ...get().prefs, ...patch } })
    const saved = await runIpc(window.daemon.settings.setEditorPrefs(patch), { context: 'Editor settings' })
    if (saved) set({ prefs: saved })
  },
}))
