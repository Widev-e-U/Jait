import React from 'react'

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Human-readable area name used in local fallback copy and console output. */
  name?: string
  /** Root is the last-resort app fallback. Section is for local pane isolation. */
  variant?: 'root' | 'section'
  /** Applied only to the section fallback container after an error is caught. */
  className?: string
  /** Reset a caught error when one of these values changes. */
  resetKeys?: readonly unknown[]
  /** Optional cleanup after the user presses Try again. */
  onReset?: () => void
}

function resetKeysChanged(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  if (prev === next) return false
  if (!prev || !next) return Boolean(prev || next)
  if (prev.length !== next.length) return true
  return prev.some((value, index) => !Object.is(value, next[index]))
}

/**
 * React #185 "Maximum update depth exceeded" is, on this app, most often the
 * symptom of a tab still running a stale pre-deploy bundle: the old JS keeps
 * looping when it receives live events shaped by the newer server. The version
 * watchdog reloads on a new build, but it only polls every ~60s (and on focus),
 * so a crash can land mid-stream before the next poll. When we catch exactly
 * this error class we reload once automatically so the fresh bundle is used
 * instead of stranding the user on the fatal screen.
 *
 * The one-shot flag lives in sessionStorage so it survives the reload: if a
 * *genuine* in-code loop survives the reload, we stop auto-reloading and show
 * the manual fallback (with its Reload button) instead of bouncing the page
 * forever. A new tab gets a fresh attempt.
 */
const STALE_LOOP_RELOAD_KEY = 'jait:loop-error-auto-reloaded'

function isRenderLoopError(error: Error): boolean {
  const message = error.message ?? ''
  return (
    message.includes('react.dev/errors/185')
    || message.includes('#185')
    || message.includes('Maximum update depth exceeded')
  )
}

function hasAutoReloadedLoop(): boolean {
  try {
    return window.sessionStorage?.getItem(STALE_LOOP_RELOAD_KEY) === '1'
  } catch {
    return false
  }
}

function markLoopAutoReloaded(): void {
  try {
    window.sessionStorage?.setItem(STALE_LOOP_RELOAD_KEY, '1')
  } catch {
    // sessionStorage unavailable (private mode / file://) — fall through; the
    // user still has the manual Reload button.
  }
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    console.error(`[ErrorBoundary:${this.props.name ?? 'root'}]`, error, errorInfo.componentStack)

    // React #185 "Maximum update depth exceeded" mid-stream is the classic
    // stale-bundle failure (see isRenderLoopError above). Reload once so the
    // fresh build is used instead of leaving the user on this fatal screen.
    if (isRenderLoopError(error) && !hasAutoReloadedLoop()) {
      markLoopAutoReloaded()
      console.info('[ErrorBoundary] Render-loop error caught — reloading to pick up the latest build.')
      window.setTimeout(() => window.location.reload(), 0)
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.error) return
    if (resetKeysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null, errorInfo: null })
    }
  }

  private reset = () => {
    this.setState({ error: null, errorInfo: null })
    this.props.onReset?.()
  }

  render() {
    const { error, errorInfo } = this.state
    if (!error) return this.props.children

    const variant = this.props.variant ?? 'root'
    const title = variant === 'root'
      ? 'Something went wrong'
      : `${this.props.name ?? 'This section'} crashed`
    const decodedMessage = error.message.includes('react.dev/errors/')
      ? `React error (see console for details): ${error.message}`
      : error.message

    const content = (
      <div style={variant === 'root' ? undefined : {
        width: 'min(100%, 680px)',
        border: '1px solid hsl(var(--border))',
        borderRadius: 8,
        background: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.18)',
        padding: 16,
      }}>
        <h1 style={{
          color: variant === 'root' ? '#f87171' : 'hsl(var(--destructive))',
          fontSize: variant === 'root' ? 20 : 14,
          fontWeight: 600,
          marginTop: 0,
          marginBottom: 8,
        }}>
          {title}
        </h1>
        <pre style={{
          background: variant === 'root' ? '#1e1e1e' : 'hsl(var(--muted))',
          color: variant === 'root' ? '#eee' : 'hsl(var(--foreground))',
          padding: variant === 'root' ? 16 : 12,
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: variant === 'root' ? '30vh' : 120,
          fontSize: variant === 'root' ? 13 : 12,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
        }}>
          {decodedMessage}
        </pre>
        {errorInfo?.componentStack && (
          <>
            <h2 style={{
              fontSize: 12,
              marginTop: 12,
              marginBottom: 4,
              color: variant === 'root' ? '#a3a3a3' : 'hsl(var(--muted-foreground))',
            }}>
              Component Stack
            </h2>
            <pre style={{
              background: variant === 'root' ? '#1e1e1e' : 'hsl(var(--muted))',
              padding: variant === 'root' ? 16 : 12,
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: variant === 'root' ? '30vh' : 120,
              fontSize: 11,
              lineHeight: 1.5,
              color: variant === 'root' ? '#999' : 'hsl(var(--muted-foreground))',
              margin: 0,
            }}>
              {errorInfo.componentStack}
            </pre>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {variant === 'section' && (
            <button
              type="button"
              onClick={this.reset}
              style={{
                padding: '7px 12px',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: variant === 'root' ? '8px 20px' : '7px 12px',
              background: variant === 'root' ? '#3b82f6' : 'hsl(var(--secondary))',
              color: variant === 'root' ? '#fff' : 'hsl(var(--secondary-foreground))',
              border: variant === 'root' ? 'none' : '1px solid hsl(var(--border))',
              borderRadius: 6,
              fontSize: variant === 'root' ? 14 : 12,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )

    if (variant === 'section') {
      return (
        <div
          className={this.props.className}
          role="alert"
          style={{
            minHeight: 96,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            padding: 12,
            background: 'hsl(var(--muted) / 0.18)',
          }}
        >
          {content}
        </div>
      )
    }

    return (
      <div style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 'min(640px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 32px)',
        overflow: 'auto',
        border: '1px solid #3f3f46',
        borderRadius: 12,
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
        background: '#111827',
        color: '#eee',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
        zIndex: 99999,
      }}>
        {content}
      </div>
    )
  }
}
