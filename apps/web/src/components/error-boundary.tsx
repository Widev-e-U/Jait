import React from 'react'

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    const decodedMessage = error.message.includes('react.dev/errors/')
      ? `React error (see console for details): ${error.message}`
      : error.message

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111',
        color: '#eee',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        zIndex: 99999,
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          <h1 style={{ color: '#f87171', fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <pre style={{
            background: '#1e1e1e',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: '30vh',
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {decodedMessage}
          </pre>
          {errorInfo?.componentStack && (
            <>
              <h2 style={{ fontSize: 14, marginTop: 16, marginBottom: 4, color: '#a3a3a3' }}>Component Stack</h2>
              <pre style={{
                background: '#1e1e1e',
                padding: 16,
                borderRadius: 8,
                overflow: 'auto',
                maxHeight: '30vh',
                fontSize: 12,
                lineHeight: 1.5,
                color: '#999',
              }}>
                {errorInfo.componentStack}
              </pre>
            </>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 20px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
