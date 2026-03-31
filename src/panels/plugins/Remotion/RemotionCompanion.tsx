import { useState, useCallback } from 'react'
import { useUIStore } from '../../../store/ui'
import './RemotionCompanion.css'

const REMOTION_SYSTEM_PROMPT = `You are a Remotion video editing assistant. You help create, edit, and debug Remotion compositions.
You have access to the Remotion documentation and can help with:
- Creating new compositions and scenes
- Adding animations (spring, interpolate, sequences)
- Working with audio, video, and image assets
- Debugging render errors
- Optimizing render performance
- Using Remotion's built-in components (Sequence, AbsoluteFill, Audio, Video, Img)
Always write TypeScript. Use Remotion best practices.`

interface QuickAction {
  label: string
  prompt: string
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Create Composition',
    prompt: 'Create a new Remotion composition with a 1920x1080 resolution at 30fps. Include a basic scene with animated text using spring().',
  },
  {
    label: 'Add Animation',
    prompt: 'Add a spring-based entrance animation to the selected element. Use Remotion\'s spring() with config { damping: 12, mass: 0.5 }.',
  },
  {
    label: 'Generate Scene',
    prompt: 'Generate a new scene component with a gradient background, centered text with staggered letter animations, and a smooth fade-out at the end.',
  },
  {
    label: 'Fix Render Error',
    prompt: 'I\'m getting a render error in my Remotion project. Here\'s the error:\n\n[paste error here]\n\nDiagnose and fix the issue.',
  },
]

export default function RemotionCompanion() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const [promptText, setPromptText] = useState('')
  const [agentTerminalId, setAgentTerminalId] = useState<string | null>(null)
  const [isSpawning, setIsSpawning] = useState(false)

  const isAgentActive = agentTerminalId !== null

  const launchVideoAgent = useCallback(async () => {
    if (!activeProjectId || !activeProjectPath || isSpawning) return
    setIsSpawning(true)

    try {
      const res = await window.daemon.terminal.create({
        cwd: activeProjectPath,
      })

      if (!res.ok || !res.data) return

      const terminalId = res.data.id
      useUIStore.getState().addTerminal(activeProjectId, terminalId, 'Remotion Agent', null)
      setAgentTerminalId(terminalId)

      // Give the shell time to initialize, then launch Claude with Remotion context
      setTimeout(() => {
        const escapedPrompt = REMOTION_SYSTEM_PROMPT.replace(/'/g, "'\\''")
        window.daemon.terminal.write(
          terminalId,
          `claude --model claude-sonnet-4-20250514 --append-system-prompt "${escapedPrompt}"\r`
        )
      }, 500)
    } finally {
      setIsSpawning(false)
    }
  }, [activeProjectId, activeProjectPath, isSpawning])

  const sendToAgent = useCallback((text: string) => {
    if (!agentTerminalId || !text.trim()) return
    window.daemon.terminal.write(agentTerminalId, text.trim() + '\r')
    setPromptText('')
  }, [agentTerminalId])

  const handleQuickAction = useCallback((action: QuickAction) => {
    if (agentTerminalId) {
      sendToAgent(action.prompt)
    } else {
      setPromptText(action.prompt)
    }
  }, [agentTerminalId, sendToAgent])

  const handleSend = useCallback(() => {
    sendToAgent(promptText)
  }, [promptText, sendToAgent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="remotion-companion">
      <div className="panel-header">
        Remotion Assistant
      </div>

      <div className="remotion-companion-body">
        {/* Skills indicator */}
        <div className="remotion-skills">
          <span className="remotion-skill-tag">
            <span className="remotion-skill-dot" />
            remotion-docs
          </span>
          <span className="remotion-skill-tag">
            <span className="remotion-skill-dot" />
            remotion
          </span>
        </div>

        {/* Agent launch */}
        <div className="remotion-agent-section">
          <button
            className="remotion-launch-btn"
            data-active={isAgentActive}
            onClick={launchVideoAgent}
            disabled={isAgentActive || !activeProjectId || isSpawning}
          >
            {isSpawning ? 'Launching...' : isAgentActive ? 'Agent Running' : 'Launch Video Agent'}
          </button>
          <div className="remotion-agent-status">
            <span
              className="remotion-agent-status-dot"
              data-active={isAgentActive}
            />
            {isAgentActive ? 'Agent active in terminal' : 'No agent running'}
          </div>
        </div>

        {/* Quick actions */}
        <div className="remotion-actions">
          <div className="remotion-actions-label">Quick Actions</div>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="remotion-action-btn"
              onClick={() => handleQuickAction(action)}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Prompt input */}
        <div className="remotion-prompt-section">
          <div className="remotion-prompt-label">
            {isAgentActive ? 'Send to Agent' : 'Prompt (launch agent first)'}
          </div>
          <textarea
            className="remotion-prompt-input"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAgentActive
              ? 'Describe what you want to build or fix... (Ctrl+Enter to send)'
              : 'Type a prompt, then launch the agent to send it...'
            }
            spellCheck={false}
          />
          <button
            className="remotion-send-btn"
            onClick={handleSend}
            disabled={!isAgentActive || !promptText.trim()}
          >
            Send to Terminal
          </button>
        </div>
      </div>
    </div>
  )
}
