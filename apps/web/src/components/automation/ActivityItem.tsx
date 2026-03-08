/**
 * ActivityItem — renders a single thread activity entry.
 *
 * Extracted from AutomationPage for reuse in the merged Chat view.
 */

import type { ThreadActivity } from '@/lib/agents-api'

export function ActivityItem({ activity }: { activity: ThreadActivity }) {
  const isUser = activity.kind === 'user_message'
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        isUser ? 'bg-primary/5 border-primary/20 ml-12' : 'bg-card mr-12'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{activity.kind}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(activity.createdAt).toLocaleTimeString()}
        </span>
      </div>
      {activity.summary && (
        <pre className="whitespace-pre-wrap text-sm leading-relaxed">{activity.summary}</pre>
      )}
    </div>
  )
}
