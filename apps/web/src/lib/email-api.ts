/**
 * API client for the email integration (Gmail / Outlook).
 */

import { apiFetch } from './api-fetch'
import { getApiUrl } from '@/lib/gateway-url'

const API_URL = getApiUrl()

import type { EmailProvider, OAuthEmailProvider, EmailAccount, EmailMessageSummary, EmailMessageFull, EmailFolder, ConnectMailboxInput, EmailAccountSettings, DiscoveredMailSettings } from '@jait/shared'
export type { EmailProvider, OAuthEmailProvider, EmailAccount, EmailMessageSummary, EmailMessageFull, EmailFolder, ConnectMailboxInput, EmailAccountSettings } from '@jait/shared'

export interface SendEmailInput {
  accountId?: string
  to?: string
  subject?: string
  body: string
  cc?: string
  bcc?: string
  replyToMessageId?: string
  html?: boolean
  includeSignature?: boolean
}

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export const emailApi = {
  async remoteImages(accountId: string, urls: string[]): Promise<Record<string, string>> {
    const res = await apiFetch(`${API_URL}/api/email/images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId, urls }) })
    const data = await asJson<{ images: Record<string, string> }>(res)
    return data.images
  },
  async discover(address: string): Promise<DiscoveredMailSettings> {
    const res = await apiFetch(`${API_URL}/api/email/discover?email=${encodeURIComponent(address)}`)
    return asJson(res)
  },
  async connectMailbox(input: ConnectMailboxInput): Promise<EmailAccount> {
    const res = await apiFetch(`${API_URL}/api/email/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const data = await asJson<{ account: EmailAccount }>(res)
    return data.account
  },
  async updateAccount(id: string, input: EmailAccountSettings): Promise<EmailAccount> {
    const res = await apiFetch(`${API_URL}/api/email/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    const data = await asJson<{ account: EmailAccount }>(res)
    return data.account
  },
  async config(): Promise<Record<OAuthEmailProvider, boolean>> {
    const res = await apiFetch(`${API_URL}/api/email/config`)
    const data = await asJson<{ providers: Record<OAuthEmailProvider, boolean> }>(res)
    return data.providers
  },

  async saveAppCredentials(provider: OAuthEmailProvider, clientId: string, clientSecret: string): Promise<void> {
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

  async connectUrl(provider: OAuthEmailProvider): Promise<string> {
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

  async cachedInbox(accountId: string): Promise<EmailMessageSummary[] | null> {
    const params = new URLSearchParams({ accountId, cached: 'true' })
    const res = await apiFetch(`${API_URL}/api/email/messages?${params}`)
    const data = await asJson<{ messages: EmailMessageSummary[] | null }>(res)
    return data.messages
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
