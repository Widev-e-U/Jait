/**
 * External messaging channels (WhatsApp, etc.).
 *
 * A ChannelConnector owns a connection to an external messaging network. The
 * ChannelManager drives its lifecycle and routes inbound messages through the
 * agent, sending replies back via the connector.
 */

export type ChannelStatus =
  | "stopped"
  | "connecting"
  | "qr"
  | "connected"
  | "error";

export interface ChannelStatusDetail {
  /** QR payload (data-URL PNG) to display for linking, when status === "qr". */
  qr?: string;
  /** Error message, when status === "error". */
  error?: string;
}

export interface InboundMessage {
  /** Connector id, e.g. "whatsapp". */
  channelId: string;
  /** Conversation/chat id (remote JID for WhatsApp). */
  conversationId: string;
  /** Sender id (participant in groups, otherwise the chat id). */
  senderId: string;
  /** Display name of the sender, if known. */
  senderName?: string;
  /** Plain-text body of the message. */
  text: string;
  /** Epoch millis the message was received. */
  timestamp: number;
  /** True when the message was sent by the linked account itself. */
  fromMe: boolean;
  /** True when this is the conversation with the linked account itself ("Message Yourself"). */
  isSelfChat: boolean;
}

export interface OutboundMessage {
  conversationId: string;
  text: string;
}

export interface ChannelConnectorEvents {
  /** Called for each inbound text message. */
  onInbound: (msg: InboundMessage) => void;
  /** Called whenever the connection status changes. */
  onStatus: (status: ChannelStatus, detail?: ChannelStatusDetail) => void;
}

export interface ChannelConnector {
  /** Stable connector id, e.g. "whatsapp". */
  readonly id: string;
  /** Human-readable label, e.g. "WhatsApp". */
  readonly label: string;
  /** Begin connecting. Emits status updates (including qr) via events. */
  start(events: ChannelConnectorEvents): Promise<void>;
  /** Tear down the connection. */
  stop(): Promise<void>;
  /** Send an outbound message. Throws if not connected. */
  send(msg: OutboundMessage): Promise<void>;
  /** Current connection status. */
  status(): ChannelStatus;
  /** Current QR data-URL, if linking. */
  currentQr(): string | null;
}

/** Per-channel persisted configuration. */
export interface ChannelConfig {
  /** Whether the channel should auto-start on gateway boot. */
  enabled?: boolean;
  /**
   * Sender ids (phone numbers / JIDs) the agent will respond to. When empty,
   * the agent only responds in the self-chat ("Message Yourself") unless
   * `respondToAll` is set.
   */
  allowedSenders?: string[];
  /** When true, respond to any inbound message (use with care). */
  respondToAll?: boolean;
  /** Tool names the channel agent may use. Empty/undefined → pure chat. */
  tools?: string[];
}
