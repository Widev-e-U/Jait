import { type ComponentProps } from 'react'
import { AgentChatIndicator } from '@/components/agents-ui/agent-chat-indicator'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'

export interface AgentTranscriptMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp?: number | string | Date
}

export interface AgentChatTranscriptProps extends ComponentProps<'div'> {
  messages?: AgentTranscriptMessage[]
  isThinking?: boolean
}

export function AgentChatTranscript({
  messages = [],
  isThinking = false,
  className,
  ...props
}: AgentChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {messages.map((message) => (
          <Message key={message.id} from={message.role}>
            <MessageContent>
              <MessageResponse>{message.content}</MessageResponse>
            </MessageContent>
          </Message>
        ))}
        {isThinking ? (
          <div className="flex items-center gap-3 px-3 py-1 text-sm text-muted-foreground">
            <AgentChatIndicator size="sm" />
            <span>Agent is thinking</span>
          </div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
