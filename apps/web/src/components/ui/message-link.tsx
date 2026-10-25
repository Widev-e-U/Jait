import type { ComponentProps } from 'react'
import { safeNotificationLink } from '@jait/shared'
import { openNotification } from '@/lib/notification-navigation'
import { cn } from '@/lib/utils'

/** Shared navigation for message links, including messages inside clickable bubbles. */
export function MessageLink({ href, children, className, onClick, ...props }: ComponentProps<'a'>) {
  // ReactMarkdown sanitizes URLs too; keep this safe for direct callers.
  // eslint-disable-next-line no-control-regex -- Block URL whitespace and control-character scheme obfuscation.
  const safeHref = href && !/[\u0000-\u0020\u007f]/.test(href)
    && !/^(?!https?:|mailto:|tel:)[a-z][a-z0-9+.-]*:/i.test(href) ? href : undefined
  const internal = safeNotificationLink(safeHref)
  return <a {...props} href={safeHref} target={internal ? undefined : '_blank'}
    rel={internal ? undefined : 'noopener noreferrer'}
    className={cn('cursor-pointer text-primary underline underline-offset-2 break-words', className)}
    onClick={event => {
      event.stopPropagation()
      onClick?.(event)
      if (!event.defaultPrevented && internal && event.button === 0
        && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault()
        openNotification({ id: `message-link:${internal}`, link: internal })
      }
    }}>{children}</a>
}
