import { KeyHint } from './Panel'
import './KeyboardShortcuts.css'

interface ShortcutGroup {
  title: string
  shortcuts: Array<{ keys: string; description: string }>
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl+Shift+P', description: 'Command palette' },
      { keys: 'Ctrl+P', description: 'Quick file open' },
      { keys: 'Ctrl+K', description: 'Command drawer (tools)' },
      { keys: 'Ctrl+E', description: 'Toggle file explorer' },
      { keys: 'Ctrl+B', description: 'Toggle right panel' },
      { keys: 'Ctrl+`', description: 'Toggle terminal' },
      { keys: 'Ctrl+,', description: 'Open settings' },
    ],
  },
  {
    title: 'Agent & Workflow',
    shortcuts: [
      { keys: 'Ctrl+Shift+A', description: 'Launch agent' },
      { keys: 'Ctrl+Shift+G', description: 'Toggle grind mode' },
      { keys: 'Ctrl+Shift+B', description: 'Toggle browser tab' },
      { keys: 'Ctrl+Shift+D', description: 'Toggle dashboard' },
    ],
  },
  {
    title: 'File Management',
    shortcuts: [
      { keys: 'Ctrl+S', description: 'Save file' },
      { keys: 'Ctrl+W', description: 'Close active file' },
    ],
  },
  {
    title: 'System',
    shortcuts: [
      { keys: 'Ctrl+Shift+R', description: 'Reload window' },
      { keys: 'Escape', description: 'Close modal/palette' },
    ],
  },
]

export function KeyboardShortcuts() {
  return (
    <div className="keyboard-shortcuts">
      <div className="keyboard-shortcuts-header">
        <h3 className="keyboard-shortcuts-title">Keyboard Shortcuts</h3>
        <p className="keyboard-shortcuts-desc">
          Quick reference for all keyboard shortcuts in DAEMON.
        </p>
      </div>

      <div className="keyboard-shortcuts-grid">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title} className="keyboard-shortcuts-group">
            <h4 className="keyboard-shortcuts-group-title">{group.title}</h4>
            <div className="keyboard-shortcuts-list">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.keys} className="keyboard-shortcut-row">
                  <span className="keyboard-shortcut-desc">{shortcut.description}</span>
                  <KeyHint className="keyboard-shortcut-keys">{shortcut.keys}</KeyHint>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="keyboard-shortcuts-footer">
        <p className="keyboard-shortcuts-note">
          On macOS, use <KeyHint>Cmd</KeyHint> instead of <KeyHint>Ctrl</KeyHint>
        </p>
      </div>
    </div>
  )
}
