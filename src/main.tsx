import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../styles/base.css'

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

  handleReload = () => {
    this.setState({ error: null })
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
            <div style={{ fontSize: 18 }}>Renderer crash</div>
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
          <pre style={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
            color: '#ffb4b4',
            margin: 0,
          }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

window.addEventListener('error', (event) => {
  console.error('Unhandled renderer error:', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled renderer rejection:', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
