import '../polyfills'
import React from 'react'
import ReactDOM from 'react-dom/client'
import LiteApp from './LiteApp'
import { setAriaHost } from '../store/ariaHost'
import type { AriaHost } from '../store/ariaHost'
import { getLiteWorkspaceSnapshot } from './workbench/liteWorkbenchStore'
import '../../styles/base.css'

const liteHost: AriaHost = {
  activeProjectId: () => getLiteWorkspaceSnapshot().activeProjectId,
  buildSnapshot: () => {
    const workspace = getLiteWorkspaceSnapshot()
    return {
      activeProjectId: workspace.activeProjectId,
      activeProjectPath: workspace.activeProjectPath,
      currentPanelId: 'lite-workbench',
      openFilePath: workspace.openFilePath,
      chips: {
        activeFile: Boolean(workspace.openFilePath),
        projectTree: workspace.treeEntries > 0,
        gitDiff: false,
        terminalLogs: workspace.hasTerminal,
        walletContext: false,
        projectMemory: true,
      },
    }
  },
  applyUiEffect: () => {},
  runUiEffectWithData: async () => ({ ok: true }),
}
setAriaHost(liteHost)

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('DAEMON renderer crash:', error)
  }

  render() {
    if (this.state.error) {
      // Inline hex required — renders before CSS loads
      return (
        <div style={{
          minHeight: '100vh',
          background: '#070707',
          color: '#f3f3f3',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: 18 }}>DAEMON hit a renderer error</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#1a1a1a',
                color: '#ebebeb',
                border: '1px solid #2a2a2a',
                borderRadius: '4px',
                padding: '6px 16px',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            >
              Reload App
            </button>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#bdbdbd', margin: 0 }}>
            The app stopped rendering this view. Reload to recover; the detailed error was written to the developer console.
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => e.preventDefault())

window.addEventListener('error', (event) => {
  if (event.message.startsWith('ResizeObserver loop')) {
    event.preventDefault()
    return
  }
  console.error('Unhandled renderer error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled renderer rejection:', event.reason)
})

document.documentElement.dataset.platform = window.daemon?.platform
  ?? (navigator.userAgent.toLowerCase().includes('mac') ? 'darwin' : 'win32')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <LiteApp />
    </RootErrorBoundary>
  </React.StrictMode>,
)
