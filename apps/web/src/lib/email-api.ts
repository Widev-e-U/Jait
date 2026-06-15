/**
 * API client for the email integration (Gmail / Outlook).
 */

import { apiFetch } from './api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

export type EmailProvider = 'gmail' | 'outlook'

export interface EmailAccount {
  id: string
  userId: string | null
  provider: EmailProvider
  email: string
  displayName: string
  status: 'connected' | 'error'
  error?: string | null
  createdAt: string
  updatedAt: string
}

export interface EmailMessageSummary {
  id: string
  threadId?: string
  from: string
  to: string
  subject: string
  snippet: string
  date: string
  unread: boolean
  labels: string[]
  hasAttachments: boolean
}

export interface EmailMessageFull extends EmailMessageSummary {
  cc: string
  bodyText: string
  bodyHtml: string
}

export interface EmailFolder {
  id: string
  name: string
  unreadCount?: number
}

export interface SendEmailInput {
  accountId?: string
  to?: string
  subject?: string
  body: string
  cc?: string
  bcc?: string
  replyToMessageId?: string
  html?: boolean
}

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const emailApi = {
  async config(): Promise<Record<EmailProvider, boolean>> {
    const res = await apiFetch(`${API_URL}/api/email/config`)
    const data = await asJson<{ providers: Record<EmailProvider, boolean> }>(res)
    return data.providers
  },

  async saveAppCredentials(provider: EmailProvider, clientId: string, clientSecret: string): Promise<void> {
    const res = await apiFetch(`${API_URL}/api/email/config/${provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })
    await asJson(res)
  },

  async accounts(): Promise<EmailAccount[]> {
    const res = await apiFetch(`${API_URL}/api/email/accounts`)
    const data = await asJson<{ accounts: EmailAccount[] }>(res)
    return data.accounts
  },

  async connectUrl(provider: EmailProvider): Promise<string> {
    const res = await apiFetch(`${API_URL}/api/email/connect/${provider}`)
    const data = await asJson<{ authUrl: string }>(res)
    return data.authUrl
  },

  async disconnect(accountId: string): Promise<void> {
    const res = await apiFetch(`${API_URL}/api/email/accounts/${accountId}`, { method: 'DELETE' })
    await asJson(res)
  },

  async listMessages(opts: { accountId?: string; folder?: string; q?: string; limit?: number } = {}): Promise<{
    account: { id: string; email: string; provider: EmailProvider }
    messages: EmailMessageSummary[]
  }> {
    const params = new URLSearchParams()
    if (opts.accountId) params.set('accountId', opts.accountId)
    if (opts.folder) params.set('folder', opts.folder)
    if (opts.q) params.set('q', opts.q)
    if (opts.limit) params.set('limit', String(opts.limit))
    const res = await apiFetch(`${API_URL}/api/email/messages?${params.toString()}`)
    return asJson(res)
  },

  async getMessage(id: string, accountId?: string): Promise<EmailMessageFull> {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    const res = await apiFetch(`${API_URL}/api/email/messages/${encodeURIComponent(id)}?${params.toString()}`)
    const data = await asJson<{ message: EmailMessageFull }>(res)
    return data.message
  },

  async send(input: SendEmailInput): Promise<void> {
    const res = await apiFetch(`${API_URL}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    await asJson(res)
  },

  async tag(id: string, opts: { accountId?: string; add?: string[]; remove?: string[] }): Promise<void> {
    const res = await apiFetch(`${API_URL}/api/email/messages/${encodeURIComponent(id)}/tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
    await asJson(res)
  },

  async remove(id: string, accountId?: string): Promise<void> {
    const res = await apiFetch(`${API_URL}/api/email/messages/${encodeURIComponent(id)}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
    await asJson(res)
  },

  async folders(accountId?: string): Promise<EmailFolder[]> {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    const res = await apiFetch(`${API_URL}/api/email/folders?${params.toString()}`)
    const data = await asJson<{ folders: EmailFolder[] }>(res)
    return data.folders
  },
}
