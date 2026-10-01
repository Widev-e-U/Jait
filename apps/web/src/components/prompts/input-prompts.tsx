import { chatNotificationLink } from '@jait/shared'
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { ArrowUpRight, Check, ChevronLeft, Eye, EyeOff, KeyRound, Loader2, MessageCircleQuestion } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { attentionKey } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
  type SecretInputRequest,
} from '@/lib/secret-input'
const API_URL = getApiUrl()
const WS_URL = getWsUrl()

/** Shared shell for decisions and private inputs beside the composer. */
export function InputPromptCard({ title, kind, children, testId, urgent = false }: {
  title: string
  kind: 'question' | 'secret'
  children: ReactNode
  testId?: string
  urgent?: boolean
}) {
  const Icon = kind === 'secret' ? KeyRound : MessageCircleQuestion
  return (
    <Card data-testid={testId} className="min-w-0 overflow-hidden rounded-xl shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 text-xs font-medium leading-5">{title}</h3>
        {kind === 'secret' && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Private</Badge>}
        {urgent && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">Urgent</Badge>}
      </div>
      {children}
    </Card>
  )
}

function PromptActions({ submitting, disabled, onCancel, children, submitLabel = 'Submit' }: {
  submitting: boolean
  disabled: boolean
  onCancel: () => Promise<void>
  children?: ReactNode
  submitLabel?: string
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border/60 bg-muted/20 px-3 py-2">
      {children}
      <div className="ml-auto flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={() => void onCancel()} disabled={submitting}>Cancel</Button>
        <Button type="submit" size="sm" className="h-9 gap-1.5 px-3 text-xs" disabled={submitting || disabled}>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </div>
  )
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
              link: chatNotificationLink(request.sessionId),
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
    />
  ) : null

  const inlinePrompt = activeRequest ? (
    <InputPromptCard title={activeRequest.title} kind="secret" testId="inline-secret-prompt">
      {form}
    </InputPromptCard>
  ) : null

  return {
    activeRequest,
    backgroundRequest,
    submitting,
    inlinePrompt,
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
      className="fixed bottom-3 right-3 z-[100] w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
    >
      <div className="flex items-start gap-2.5 border-b border-border/60 p-3">
        <div className="mt-0.5 text-muted-foreground">
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

export function SecretInputForm({
  request, value, onValueChange, submitting, showPassword, onShowPasswordChange,
  remember, onRememberChange, onSubmit, onCancel, autoFocus = true,
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
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Avoid opening the mobile keyboard and moving the chat as a prompt arrives.
    if (autoFocus && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true })
  }, [autoFocus, request.id])

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      if (value && !submitting) void onSubmit()
    }}>
      <div className="max-h-[min(32dvh,20rem)] space-y-2.5 overflow-y-auto overscroll-contain p-3">
        <p className="text-xs leading-5 text-muted-foreground">{request.prompt || 'Enter your password to continue.'}</p>
        {(request.command || request.requestedBy) && <details className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">View command</summary>
          <code className="mt-1.5 block whitespace-pre-wrap break-all text-foreground">{getSecretRequestCommand(request)}</code>
        </details>}
        <div className="space-y-1.5">
          <Label className="sr-only" htmlFor={`secret-input-${request.id}`}>Secret</Label>
          <div className="relative">
            <Input ref={inputRef} id={`secret-input-${request.id}`} type={showPassword ? 'text' : 'password'}
              autoComplete="current-password" placeholder="Password" value={value} disabled={submitting}
              onChange={(event) => onValueChange(event.target.value)} className="h-10 pr-10 text-base sm:text-sm" />
            <Button type="button" variant="ghost" size="icon" className="absolute inset-y-0 right-0 h-10 w-10 text-muted-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={submitting}
              onMouseDown={(event) => event.preventDefault()} onClick={() => onShowPasswordChange((prev) => !prev)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">Private input · not sent to the model</p>
        </div>
        {request.rememberable && <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={remember} disabled={submitting}
            onChange={(event) => onRememberChange(event.target.checked)} />
          <span>Remember for {request.rememberLabel || request.prompt || request.title}</span>
        </label>}
      </div>
      <PromptActions submitting={submitting} disabled={!value} onCancel={onCancel} />
    </form>
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

function hasAndroidUserQuestionPresenter() {
  const capacitorOverlay = (window.Capacitor as {
    Plugins?: { AgentOverlay?: { present?: unknown } }
  } | undefined)?.Plugins?.AgentOverlay
  return Boolean(capacitorOverlay?.present)
}

export function shouldPresentNativeUserQuestion({
  hasAndroidPresenter,
}: {
  hasAndroidPresenter: boolean
}) {
  return hasAndroidPresenter
}

export function getActiveUserQuestion<T extends { sessionId: string }>(
  requests: T[],
  sessionId: string | null,
): T | null {
  if (!sessionId) return null
  return requests.find((request) => request.sessionId === sessionId) ?? null
}

export function shouldNotifyForUserQuestion({
  requestSessionId,
  activeSessionId,
  appIsBackgrounded,
}: {
  requestSessionId: string
  activeSessionId: string | null
  appIsBackgrounded: boolean
}) {
  return requestSessionId !== activeSessionId || appIsBackgrounded
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
  const activeRequest = getActiveUserQuestion(requests, sessionId)
  const nativeRequest = requests[0] ?? null

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
    if (!overlay) return
    const deviceId = generateDeviceId()
    // Watch sync and answers need these credentials even without Firebase.
    void Promise.resolve(overlay.configurePush?.({ gatewayUrl: API_URL, authToken: token, deviceId }))
      .then(() => overlay.requestPermissions?.())
      .then(() => overlay.getPushToken?.())
      .then(async (result) => {
      const pushToken = result?.token
      if (!pushToken) return
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit answers')
    } finally {
      setSubmitting(false)
    }
  }, [authHeaders])

  const presentNativeQuestion = useCallback(async (request: UserQuestionRequest) => {
    if (nativeQuestionStatesRef.current.has(request.id)) return
    nativeQuestionStatesRef.current.set(request.id, 'presenting')
    const nativeRequest = {
      id: request.id,
      title: request.title,
      attention: request.attention,
      questions: request.questions,
    }

    try {
      const agentOverlay = (window.Capacitor as {
        Plugins?: {
          AgentOverlay?: {
            present: (options: { request: typeof nativeRequest }) => Promise<{ answers?: Record<string, UserQuestionAnswer>; dismissed?: boolean } | null>
          }
        }
      } | undefined)?.Plugins?.AgentOverlay
      const result = agentOverlay ? await agentOverlay.present({ request: nativeRequest }) : null

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
        id: attentionKey('question', request.id),
        link: chatNotificationLink(request.sessionId),
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
      id: attentionKey('question', request.id),
      link: chatNotificationLink(request.sessionId),
      title: request.title,
      body: request.questions[0]?.question ?? 'Jait needs your input.',
      level: 'warning',
      includeToast: false,
    })
    nativeQuestionStatesRef.current.delete(request.id)
  }, [submitRequestAnswers])

  const dismissNativeQuestion = useCallback((requestId: string) => {
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
      // Keep all pending requests so Android can present them natively and other
      // clients can notify for background chats. Inline rendering is scoped below.
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
          if (shouldNotifyForUserQuestion({
            requestSessionId: request.sessionId,
            activeSessionId: sessionId,
            appIsBackgrounded,
          }) && !hasAndroidUserQuestionPresenter()) {
            void triggerSystemNotification({
              id: attentionKey('question', request.id),
              link: chatNotificationLink(request.sessionId),
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
          }
        }
      } catch {
        // ignore malformed events
      }
    }
    return () => ws.close()
  }, [dismissNativeQuestion, refresh, sessionId, token])

  useEffect(() => {
    if (!nativeRequest) return
    if (shouldPresentNativeUserQuestion({
      hasAndroidPresenter: hasAndroidUserQuestionPresenter(),
    })) {
      void presentNativeQuestion(nativeRequest)
    }
  }, [nativeRequest, presentNativeQuestion])

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
    <InputPromptCard title={activeRequest.title} kind="question" urgent={activeRequest.attention === 'urgent'} testId="inline-user-question-prompt">
      <UserQuestionForm key={activeRequest.id}
        request={activeRequest} answers={answers} submitting={submitting}
        onAnswerChange={setAnswer} onSubmit={submitAnswers} onCancel={cancelRequest} />
    </InputPromptCard>
  ) : null

  return { activeRequest, inlinePrompt }
}

function QuestionText({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    p: ({ children }) => <span className="block whitespace-pre-wrap">{children}</span>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-primary underline break-words" onClick={(event) => event.stopPropagation()}>{children}</a>,
  }}>{children}</ReactMarkdown>
}

export function UserQuestionForm({
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [freeformOpen, setFreeformOpen] = useState<Record<string, boolean>>({})
  const question = request.questions[Math.min(activeIndex, request.questions.length - 1)]
  const answer = question ? answers[question.id] ?? { selected: [], freeText: null, skipped: false } : null
  const isAnswered = (id: string) => Boolean(answers[id]?.freeText?.trim()) || (answers[id]?.selected.length ?? 0) > 0
  const canSubmit = request.questions.length > 0 && request.questions.every(item => isAnswered(item.id))
  const lastQuestion = activeIndex >= request.questions.length - 1

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      if (submitting) return
      if (!lastQuestion && question && isAnswered(question.id)) setActiveIndex(activeIndex + 1)
      else if (canSubmit) void onSubmit()
    }}>
      {request.questions.length > 1 && <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-2" aria-label="Questions">
        {request.questions.map((item, index) => <Button key={item.id} type="button" size="sm" variant={index === activeIndex ? 'secondary' : 'ghost'}
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs" aria-current={index === activeIndex ? 'step' : undefined}
          disabled={submitting} onClick={() => setActiveIndex(index)}>
          {isAnswered(item.id) ? <Check className="h-3 w-3 text-primary" /> : <span className="text-muted-foreground">{index + 1}</span>}
          {item.header}
        </Button>)}
      </div>}
      {question && answer && <div key={question.id} className="max-h-[min(32dvh,20rem)] space-y-2.5 overflow-y-auto overscroll-contain p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-5 text-foreground"><QuestionText>{question.header}</QuestionText></p>
          <div className="text-xs leading-5 text-muted-foreground"><QuestionText>{question.question}</QuestionText></div>
        </div>
        {question.options?.length ? <div className="space-y-1.5">
          {question.options.map((option) => {
            const checked = answer.selected.includes(option.label)
            return <label key={option.label} className={cn('flex min-h-10 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors focus-within:ring-2 focus-within:ring-ring/50',
              checked ? 'border-primary/50 bg-primary/[0.06]' : 'border-border bg-background hover:bg-muted/50', submitting && 'pointer-events-none opacity-60')}>
              <input type={question.multiSelect ? 'checkbox' : 'radio'} name={`user-question-${request.id}-${question.id}`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={checked} disabled={submitting}
                onChange={(event) => {
                  const selected = question.multiSelect
                    ? event.target.checked ? [...answer.selected, option.label] : answer.selected.filter(item => item !== option.label)
                    : [option.label]
                  onAnswerChange(question.id, { selected, skipped: false })
                }} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="font-medium text-foreground"><QuestionText>{option.label}</QuestionText></span>
                  {option.recommended && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Recommended</Badge>}
                </span>
                {option.description && <span className="block leading-4 text-muted-foreground"><QuestionText>{option.description}</QuestionText></span>}
              </span>
            </label>
          })}
        </div> : null}
        {question.allowFreeformInput !== false && (
          !question.options?.length || freeformOpen[question.id] || answer.freeText
            ? <Textarea aria-label={`Answer: ${question.header}`} value={answer.freeText ?? ''} rows={2}
                placeholder={question.options?.length ? 'Or write your own answer…' : 'Type your answer…'}
                disabled={submitting} className="min-h-14 resize-y text-base sm:text-sm"
                onChange={(event) => onAnswerChange(question.id, { freeText: event.target.value, skipped: false })} />
            : <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground"
                disabled={submitting} onClick={() => setFreeformOpen(prev => ({ ...prev, [question.id]: true }))}>Write another answer</Button>
        )}
      </div>}
      <PromptActions submitting={submitting} disabled={lastQuestion ? !canSubmit : !question || !isAnswered(question.id)}
        onCancel={onCancel} submitLabel={lastQuestion ? 'Submit' : 'Next'}>
        {activeIndex > 0 && <Button type="button" variant="ghost" size="sm" className="h-9 gap-1 px-2 text-xs"
          disabled={submitting} onClick={() => setActiveIndex(activeIndex - 1)}><ChevronLeft className="h-3.5 w-3.5" />Back</Button>}
        {request.questions.length > 1 && <span className="text-[11px] text-muted-foreground">{activeIndex + 1}/{request.questions.length}</span>}
      </PromptActions>
    </form>
  )
}
