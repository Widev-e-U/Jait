import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { EmailToolView } from '@/components/email/email-tool-view'
import '@/index.css'

// Renders the email tool card with the same wrapper geometry the chat uses on a
// 390px viewport (px-3 message padding + pl-8 card indent + ml-8/mr-3 body box),
// so mobile sizing can be screenshotted without booting the whole chat.
const BODY_HTML = `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
  <img src="https://www.netcup.com/assets/logo.png" alt="netcup" width="160" />
  <h2 style="font-size:18px;margin:16px 0 8px">netcup Security Advisory: Critical PHP Vulnerabilities</h2>
  <p>Dear customer,</p>
  <p>New critical vulnerabilities have been published for PHP. Please update your
     installations as soon as possible to avoid remote code execution.</p>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr><th>Version</th><th>Status</th></tr></thead>
    <tbody>
      <tr><td>PHP 8.4</td><td>fixed</td></tr>
      <tr><td>PHP 8.3</td><td>fixed</td></tr>
      <tr><td>PHP 8.2</td><td>update required</td></tr>
    </tbody>
  </table>
  <p>Kind regards,<br />your netcup team</p>
</div>`

const DATA = {
  accountId: 'acc-1',
  message: {
    id: 'AQMKADAW',
    subject: 'netcup Security Advisory: Critical PHP Vulnerabilities',
    from: 'netcup GmbH <newsletter@netcup.com>',
    to: 'jakob.winkler@outlook.at <jakob.winkler@outlook.at>',
    date: '2026-10-21T12:28:55Z',
    bodyHtml: BODY_HTML,
  },
}

function EmailToolcardRepro() {
  return (
    <div className="mx-auto min-h-screen w-[390px] bg-background text-foreground">
      <div className="px-3 py-3">
        <p className="mb-2 text-sm">Here is the advisory Netcup sent you.</p>
        <div className="relative pl-8">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/[0.08]">✓</span>
            <span className="font-medium text-foreground">email_read</span>
            <span className="truncate opacity-70">read</span>
          </div>
          <div className="ml-8 mr-3 mb-2 rounded-md bg-transparent p-0">
            <EmailToolView data={DATA} args={{ action: 'read', accountId: 'acc-1', messageId: 'AQMKADAW' }} />
          </div>
        </div>

        {/* Sibling tool calls: same wrapper geometry the chat uses, so the email
            card can be compared side by side with the other tool cards. */}
        <div className="relative pl-8">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.08]">⌘</span>
            <span className="font-medium text-foreground">terminal</span>
            <span className="truncate opacity-70">0.4s</span>
          </div>
          <div className="ml-8 mr-3 mb-2 bg-transparent p-0">
            <pre className="overflow-x-auto rounded-md bg-black/75 p-2 text-[11px] leading-relaxed text-zinc-100">{"$ npm test\nok 12 tests"}</pre>
          </div>
        </div>

        <div className="relative pl-8">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/[0.08]">≡</span>
            <span className="font-medium text-foreground">read_file</span>
            <span className="truncate opacity-70">done</span>
          </div>
          <div className="ml-8 mr-3 mb-2 rounded-md bg-card/42 px-3 py-2" data-repro="padded-card">
            <p className="text-xs text-muted-foreground">src/components/chat/tool-call-card.tsx</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <EmailToolcardRepro />
  </StrictMode>,
)
