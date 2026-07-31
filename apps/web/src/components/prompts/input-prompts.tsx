import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { ArrowUpRight, Eye, EyeOff, KeyRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getApiUrl, getWsUrl } from '@/lib/gateway-url'
import { generateDeviceId } from '@/lib/device-id'
import { triggerSystemNotification } from '@/lib/system-notifications'
import {
  getBackgroundSecretRequest,
  getSecretRequestCommand,
  getSessionSecretRequest,
  shouldRenderSecretRequestDialog,
  shouldRenderSecretRequestInline,
  type SecretInputRequest,
} from '@/lib/secret-input'
const API_URL = getApiUrl()
const WS_URL = getWsUrl()

export function InlineSecretMounted({ requestId, onMount, children }: {
  requestId: string
  onMount: (requestId: string) => void
  children: ReactNode
}) {
  useEffect(() => {
    onMount(requestId)
  }, [requestId, onMount])
  return <>{children}</>
}

export function useSecretInputPrompt({
  token,
  sessionId,
}: {
  token: string | null
  sessionId: string | null
}) {
  const [requests, setRequests] = useState<SecretInputRequest[]>([])
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const activeRequest = getSessionSecretRequest(requests, sessionId)
  const backgroundRequest = getBackgroundSecretRequest(requests, sessionId)
  const renderInline = shouldRenderSecretRequestInline(activeRequest)

  const markInlineMounted = useCallback((requestId: string) => {
    // Inline secret prompts are now rendered in a composer-adjacent card,
    // so the per-tool-card mount tracking is no longer required.
    void requestId
  }, [])

  const authHeaders = useCallback((contentType = false) => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (contentType) headers['Content-Type'] = 'application/json'
    return headers
  }, [token])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/secrets/requests`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json() as { requests: SecretInputRequest[] }
      setRequests(data.requests)
    } catch {
      // gateway down or reconnecting
    }
  }, [authHeaders, token])

  useEffect(() => {
    if (!token) return
    void refresh()
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; sessionId?: string; payload?: unknown }
        if (msg.type === 'secret.requested') {
          const request = msg.payload as SecretInputRequest
          setRequests((prev) => [request, ...prev.filter((item) => item.id !== request.id)])
          if (request.sessionId !== sessionId) {
            void triggerSystemNotification({
              id: `secret-request:${request.id}`,
              title: 'Password needed in another chat',
              body: getSecretRequestCommand(request),
              level: 'warning',
              includeToast: false,
            })
          }
        }
        if (msg.type === 'secret.resolved') {
          const resolved = msg.payload as { id?: string }
          if (resolved.id) {
            setRequests((prev) => prev.filter((item) => item.id !== resolved.id))
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => ws.close()
  }, [refresh, sessionId, token])

  useEffect(() => {
    setValue('')
    setRemember(false)
    setShowPassword(false)
  }, [activeRequest?.id])

  const submitSecretRequest = useCallback(async (
    request: SecretInputRequest,
    secretValue: string,
    shouldRemember: boolean,
  ) => {
    if (!secretValue) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/secrets/requests/${request.id}/submit`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify({
          value: secretValue,
          remember: request.rememberable ? shouldRemember : false,
        }),
      })
      if (!res.ok) throw new Error('Failed to submit secret')
      setRequests((prev) => prev.filter((item) => item.id !== request.id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit secret')
    } finally {
      setSubmitting(false)
    }
  }, [authHeaders])

  const cancelSecretRequest = useCallback(async (request: SecretInputRequest) => {
    setSubmitting(true)
    try {
      await fetch(`${API_URL}/api/secrets/requests/${request.id}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      setRequests((prev) => prev.filter((item) => item.id !== request.id))
    } finally {
      setSubmitting(false)
    }
  }, [authHeaders])

  const submitSecret = useCallback(async () => {
    if (!activeRequest) return
    await submitSecretRequest(activeRequest, value, remember)
  }, [activeRequest, remember, submitSecretRequest, value])

  const cancelSecret = useCallback(async () => {
    if (!activeRequest) return
    await cancelSecretRequest(activeRequest)
  }, [activeRequest, cancelSecretRequest])

  const form = activeRequest ? (
    <SecretInputForm
      request={activeRequest}
      value={value}
      onValueChange={setValue}
      submitting={submitting}
      showPassword={showPassword}
      onShowPasswordChange={setShowPassword}
      remember={remember}
      onRememberChange={setRemember}
      onSubmit={submitSecret}
      onCancel={cancelSecret}
      showTitle={renderInline}
    />
  ) : null

  const isDialogRequest = Boolean(activeRequest) && shouldRenderSecretRequestDialog(activeRequest)
  // Fallback to an inline card for requests that would previously open a dialog.
  // The "inline" tool-attached variant is rendered inside the matching tool card
  // by the consumer via `renderInlineSecretPrompt`; for non-inline requests we
  // render a composer-adjacent card instead of a blocking modal.
  const inlinePrompt = activeRequest && isDialogRequest ? (
    <div
      data-testid="inline-secret-prompt"
      className="rounded-lg border border-yellow-500/20 bg-yellow-500/[0.04] px-3.5 py-2.5 shadow-sm"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-4 text-foreground">{activeRequest.title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">Enter the secret to continue.</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60"
          onClick={() => void cancelSecret()}
          aria-label="Cancel secret prompt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {form}
    </div>
  ) : null

  return {
    activeRequest,
    backgroundRequest,
    submitting,
    renderInline,
    form,
    inlinePrompt,
    markInlineMounted,
    submitSecretRequest,
    cancelSecretRequest,
  }
}

export function BackgroundSecretPrompt({
  request,
  submitting,
  onSubmit,
  onCancel,
  onOpenChat,
}: {
  request: SecretInputRequest
  submitting: boolean
  onSubmit: (request: SecretInputRequest, value: string, remember: boolean) => Promise<void>
  onCancel: (request: SecretInputRequest) => Promise<void>
  onOpenChat: (sessionId: string) => void
}) {
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    setValue('')
    setRemember(false)
    setShowPassword(false)
  }, [request.id])

  return (
    <div
      role="alert"
      data-testid="background-secret-prompt"
      className="fixed bottom-3 right-3 z-[100] w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-yellow-500/30 bg-background/95 p-3.5 shadow-2xl backdrop-blur"
    >
      <div className="mb-2.5 flex items-start gap-2.5">
        <div className="mt-0.5 rounded-md bg-yellow-500/10 p-1.5 text-yellow-600 dark:text-yellow-400">
          <KeyRound className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Password needed in another chat</p>
          <p className="text-xs text-muted-foreground">{request.title}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          onClick={() => onOpenChat(request.sessionId)}
        >
          Open chat
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mb-2.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Command</p>
        <code className="block max-h-20 overflow-auto whitespace-pre-wrap break-all text-xs text-foreground">
          {getSecretRequestCommand(request)}
        </code>
      </div>
      <SecretInputForm
        request={request}
        value={value}
        onValueChange={setValue}
        submitting={submitting}
        showPassword={showPassword}
        onShowPasswordChange={setShowPassword}
        remember={remember}
        onRememberChange={setRemember}
        onSubmit={async () => onSubmit(request, value, remember)}
        onCancel={async () => onCancel(request)}
        autoFocus={false}
      />
    </div>
  )
}

function SecretInputForm({
  request,
  value,
  onValueChange,
  submitting,
  showPassword,
  onShowPasswordChange,
  remember,
  onRememberChange,
  onSubmit,
  onCancel,
  showTitle = false,
  autoFocus = true,
}: {
  request: SecretInputRequest
  value: string
  onValueChange: (value: string) => void
  submitting: boolean
  showPassword: boolean
  onShowPasswordChange: (value: boolean | ((prev: boolean) => boolean)) => void
  remember: boolean
  onRememberChange: (value: boolean) => void
  onSubmit: () => Promise<void>
  onCancel: () => Promise<void>
  showTitle?: boolean
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-2.5">
      {showTitle && (
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium leading-4 text-foreground">{request.title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">This prompt is attached to the running tool call.</p>
        </div>
      )}
      <div>
        <p className="text-xs leading-5 text-muted-foreground">
          {request.prompt ?? 'Enter the secret to continue.'} <span className="hidden sm:inline">The value goes directly to the local gateway and is not sent to the model.</span>
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`secret-input-${request.id}`}>Secret</Label>
        <div className="relative">
          <Input
            id={`secret-input-${request.id}`}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Password"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void onSubmit()
            }}
            className="h-9 pr-10 text-sm"
            autoFocus={autoFocus}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onShowPasswordChange((prev) => !prev)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {request.rememberable && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={remember}
            onChange={(event) => onRememberChange(event.target.checked)}
          />
          <span className="min-w-0 flex-1">
            Remember for {request.rememberLabel || request.prompt || request.title}
          </span>
        </label>
      )}
      <div className="flex justify-end gap-1.5">
        <Button className="h-8 px-3 text-xs" variant="ghost" onClick={() => void onCancel()} disabled={submitting}>Cancel</Button>
        <Button className="h-8 px-3 text-xs" onClick={() => void onSubmit()} disabled={submitting || !value}>Submit</Button>
      </div>
    </div>
  )
}

interface UserQuestionOption {
  label: string
  description?: string
  recommended?: boolean
}

interface UserQuestionItem {
  id: string
  header: string
  question: string
  multiSelect?: boolean
  options?: UserQuestionOption[]
  allowFreeformInput?: boolean
}

interface UserQuestionRequest {
  id: string
  sessionId: string
  requestedBy: string | null
  title: string
  attention: 'normal' | 'urgent'
  questions: UserQuestionItem[]
  expiresAt: string
  status: 'pending' | 'submitted' | 'cancelled' | 'timeout'
}

interface UserQuestionAnswer {
  selected: string[]
  freeText: string | null
  skipped: boolean
}

export function useUserQuestionPrompt({
  token,
  sessionId,
}: {
  token: string | null
  sessionId: string | null
}) {
  const [requests, setRequests] = useState<UserQuestionRequest[]>([])
  const [answers, setAnswers] = useState<Record<string, UserQuestionAnswer>>({})
  const [submitting, setSubmitting] = useState(false)
  const nativeQuestionStatesRef = useRef(new Map<string, 'presenting' | 'resolved'>())
  const activeRequest = requests[0] ?? null

  const authHeaders = useCallback((contentType = false) => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (contentType) headers['Content-Type'] = 'application/json'
    return headers
  }, [token])

  useEffect(() => {
    if (!token) return
    const overlay = (window.Capacitor as { Plugins?: { AgentOverlay?: {
      requestPermissions?: () => Promise<unknown>
      getPushToken?: () => Promise<{ token: string }>
      configurePush?: (options: { gatewayUrl: string; authToken: string; deviceId: string }) => Promise<unknown>
    } } } | undefined)?.Plugins?.AgentOverlay
    if (!overlay?.getPushToken) return
    void Promise.resolve(overlay.requestPermissions?.()).then(() => overlay.getPushToken!()).then(async ({ token: pushToken }) => {
      if (!pushToken) return
      const deviceId = generateDeviceId()
      await overlay.configurePush?.({ gatewayUrl: API_URL, authToken: token, deviceId })
      await fetch(`${API_URL}/api/mobile/devices/register`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify({
          id: deviceId,
          name: 'Jait Android',
          platform: 'mobile',
          capabilities: ['notifications', 'agent-question-overlay'],
          pushToken,
        }),
      })
    }).catch(() => { /* Push remains optional when Firebase is not configured. */ })
  }, [authHeaders, token])

  const submitRequestAnswers = useCallback(async (
    request: UserQuestionRequest,
    requestAnswers: Record<string, UserQuestionAnswer>,
  ) => {
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/user-questions/requests/${request.id}/submit`, {
        method: 'POST',
        headers: authHeaders(true),
        credentials: 'include',
        body: JSON.stringify({ answers: requestAnswers }),
      })
      if (!res.ok) throw new Error('Failed to submit answers')
      setRequests((prev) => prev.filter((item) => item.id !== request.id))
      setAnswers({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit answers')
    } finally {
      setSubmitting(false)
    }
  }, [authHeaders])

  const presentNativeQuestion = useCallback(async (request: UserQuestionRequest) => {
    nativeQuestionStatesRef.current.set(request.id, 'presenting')
    const nativeRequest = {
      id: request.id,
      title: request.title,
      attention: request.attention,
      questions: request.questions,
    }

    try {
      let result: { answers?: Record<string, UserQuestionAnswer>; dismissed?: boolean } | null = null
      if (window.jaitDesktop?.presentAgentQuestion) {
        result = await window.jaitDesktop.presentAgentQuestion(nativeRequest)
      } else {
        const agentOverlay = (window.Capacitor as {
          Plugins?: {
            AgentOverlay?: {
              present: (options: { request: typeof nativeRequest }) => Promise<{ answers?: Record<string, UserQuestionAnswer>; dismissed?: boolean } | null>
            }
          }
        } | undefined)?.Plugins?.AgentOverlay
        if (agentOverlay) result = await agentOverlay.present({ request: nativeRequest })
      }

      if (result?.answers) {
        await submitRequestAnswers(request, result.answers)
        nativeQuestionStatesRef.current.delete(request.id)
        return
      }
      if (result?.dismissed || nativeQuestionStatesRef.current.get(request.id) === 'resolved') {
        nativeQuestionStatesRef.current.delete(request.id)
        return
      }
    } catch {
      if (nativeQuestionStatesRef.current.get(request.id) === 'resolved') {
        nativeQuestionStatesRef.current.delete(request.id)
        return
      }
      await triggerSystemNotification({
        id: `user-question:${request.id}`,
        title: request.title,
        body: request.questions[0]?.question ?? 'Jait needs your input.',
        level: 'warning',
        includeToast: false,
      })
      nativeQuestionStatesRef.current.delete(request.id)
      return
    }

    if (nativeQuestionStatesRef.current.get(request.id) === 'resolved') {
      nativeQuestionStatesRef.current.delete(request.id)
      return
    }
    await triggerSystemNotification({
      id: `user-question:${request.id}`,
      title: request.title,
      body: request.questions[0]?.question ?? 'Jait needs your input.',
      level: 'warning',
      includeToast: false,
    })
    nativeQuestionStatesRef.current.delete(request.id)
  }, [submitRequestAnswers])

  const dismissNativeQuestion = useCallback((requestId: string) => {
    if (window.jaitDesktop?.dismissAgentQuestion) {
      void window.jaitDesktop.dismissAgentQuestion(requestId)
    }
    const agentOverlay = (window.Capacitor as {
      Plugins?: { AgentOverlay?: { dismiss: (options: { requestId: string }) => Promise<unknown> } }
    } | undefined)?.Plugins?.AgentOverlay
    if (agentOverlay) void agentOverlay.dismiss({ requestId })
  }, [])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/user-questions/requests`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json() as { requests: UserQuestionRequest[] }
      // Surface every pending question for the authenticated user (the API already
      // scopes by user). Gating on the active session silently swallowed prompts
      // raised from a different session — leaving the agent blocked with no form.
      setRequests(data.requests)
    } catch {
      // gateway down or reconnecting
    }
  }, [authHeaders, sessionId, token])

  useEffect(() => {
    if (!token) return
    void refresh()
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload?: unknown }
        if (msg.type === 'user-question.requested') {
          const request = msg.payload as UserQuestionRequest
          setRequests((prev) => [request, ...prev.filter((item) => item.id !== request.id)])
          const appIsBackgrounded = document.visibilityState !== 'visible' || !document.hasFocus()
          if (appIsBackgrounded && request.attention === 'urgent') {
            void presentNativeQuestion(request)
          } else if (appIsBackgrounded) {
            void triggerSystemNotification({
              id: `user-question:${request.id}`,
              title: request.title,
              body: request.questions[0]?.question ?? 'Jait needs your input.',
              level: 'info',
              includeToast: false,
            })
          }
        }
        if (msg.type === 'user-question.resolved') {
          const resolved = msg.payload as { id?: string }
          if (resolved.id) {
            if (nativeQuestionStatesRef.current.get(resolved.id) === 'presenting') {
              nativeQuestionStatesRef.current.set(resolved.id, 'resolved')
            }
            dismissNativeQuestion(resolved.id)
            setRequests((prev) => prev.filter((item) => item.id !== resolved.id))
            setAnswers({})
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => ws.close()
  }, [dismissNativeQuestion, presentNativeQuestion, refresh, sessionId, token])

  useEffect(() => {
    if (!activeRequest) {
      setAnswers({})
      return
    }
    setAnswers(Object.fromEntries(activeRequest.questions.map((question) => [
      question.id,
      { selected: [], freeText: null, skipped: false },
    ])))
  }, [activeRequest])

  const submitAnswers = useCallback(async () => {
    if (!activeRequest) return
    await submitRequestAnswers(activeRequest, answers)
  }, [activeRequest, answers, submitRequestAnswers])

  const cancelRequest = useCallback(async () => {
    if (!activeRequest) return
    setSubmitting(true)
    try {
      await fetch(`${API_URL}/api/user-questions/requests/${activeRequest.id}/cancel`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      })
      setRequests((prev) => prev.filter((item) => item.id !== activeRequest.id))
      setAnswers({})
    } finally {
      setSubmitting(false)
    }
  }, [activeRequest, authHeaders])

  const setAnswer = useCallback((questionId: string, update: Partial<UserQuestionAnswer>) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? { selected: [], freeText: null, skipped: false }), ...update },
    }))
  }, [])

  const inlinePrompt = activeRequest ? (
    <div
      data-testid="inline-user-question-prompt"
      className="rounded-lg border border-blue-500/20 bg-blue-500/[0.04] px-3.5 py-3 shadow-sm"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-4 text-foreground">{activeRequest.title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">Jait needs your input to continue.</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/60"
          onClick={() => void cancelRequest()}
          aria-label="Cancel question prompt"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <UserQuestionForm
        request={activeRequest}
        answers={answers}
        submitting={submitting}
        onAnswerChange={setAnswer}
        onSubmit={submitAnswers}
        onCancel={cancelRequest}
      />
    </div>
  ) : null

  return { activeRequest, inlinePrompt }
}

function UserQuestionForm({
  request,
  answers,
  submitting,
  onAnswerChange,
  onSubmit,
  onCancel,
}: {
  request: UserQuestionRequest
  answers: Record<string, UserQuestionAnswer>
  submitting: boolean
  onAnswerChange: (questionId: string, update: Partial<UserQuestionAnswer>) => void
  onSubmit: () => Promise<void>
  onCancel: () => Promise<void>
}) {
  const canSubmit = request.questions.some((question) => {
    const answer = answers[question.id]
    return answer?.skipped || Boolean(answer?.freeText?.trim()) || (answer?.selected.length ?? 0) > 0
  })

  return (
    <div className="space-y-4">
      {request.questions.map((question) => {
        const answer = answers[question.id] ?? { selected: [], freeText: null, skipped: false }
        return (
          <div key={question.id} className="space-y-2">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-5 text-foreground">{question.header}</p>
              <p className="text-xs leading-5 text-muted-foreground">{question.question}</p>
            </div>
            {question.options?.length ? (
              <div className="space-y-1">
                {question.options.map((option) => {
                  const checked = answer.selected.includes(option.label)
                  return (
                    <label key={option.label} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/70 px-2.5 py-2 text-xs">
                      <input
                        type={question.multiSelect ? 'checkbox' : 'radio'}
                        name={`user-question-${request.id}-${question.id}`}
                        className="mt-0.5 h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={(event) => {
                          const selected = question.multiSelect
                            ? event.target.checked
                              ? [...answer.selected, option.label]
                              : answer.selected.filter((item) => item !== option.label)
                            : [option.label]
                          onAnswerChange(question.id, { selected, skipped: false })
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{option.label}</span>
                        {option.recommended && <span className="ml-1 text-primary">Recommended</span>}
                        {option.description && <span className="block text-muted-foreground">{option.description}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}
            {question.allowFreeformInput !== false && (
              <Textarea
                value={answer.freeText ?? ''}
                placeholder="Type an answer..."
                className="min-h-20 text-sm"
                onChange={(event) => onAnswerChange(question.id, { freeText: event.target.value, skipped: false })}
              />
            )}
          </div>
        )
      })}
      <div className="flex justify-end gap-1.5">
        <Button className="h-8 px-3 text-xs" variant="ghost" onClick={() => void onCancel()} disabled={submitting}>Cancel</Button>
        <Button className="h-8 px-3 text-xs" onClick={() => void onSubmit()} disabled={submitting || !canSubmit}>Submit</Button>
      </div>
    </div>
  )
}
