import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: string | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err.message }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          padding: 24,
          background: 'var(--s2)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--red)' }}>
            {this.props.fallbackLabel ?? 'Plugin failed to load'}
          </span>
          {this.state.error && (
            <span style={{ fontSize: 10, color: 'var(--t3)', maxWidth: 300, textAlign: 'center', wordBreak: 'break-word' }}>
              {this.state.error}
            </span>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              height: 28,
              padding: '0 14px',
              background: 'var(--s3)',
              border: '1px solid var(--s5)',
              borderRadius: 4,
              color: 'var(--t1)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Backward-compat alias — prefer PanelErrorBoundary for new code
export const PluginErrorBoundary = PanelErrorBoundary
