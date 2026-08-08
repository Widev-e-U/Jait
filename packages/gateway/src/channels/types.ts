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
  /**
   * The URL encoded in the QR, when the code is a deep link (Telegram). Shown
   * next to the QR so the channel can also be linked without a second device.
   */
  link?: string;
  /**
   * ISO timestamp at which the shown code stops working, when the connector
   * expires them. Lets the UI count down and fetch a fresh code instead of
   * leaving a dead QR on screen.
   */
  expiresAt?: string;
  /** Error message, when status === "error". */
  error?: string;
}

/** A user that completed the in-band pairing handshake (e.g. scanned the QR). */
export interface ChannelPairing {
  /** Sender id to allowlist (numeric user id for Telegram). */
  senderId: string;
  /** Display name of the paired user, if known. */
  senderName?: string;
  /** Conversation the pairing happened in. */
  conversationId: string;
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

/**
 * One option in a pick-one dialog. `value` is the message the gateway acts on
 * when the option is chosen — reusing the normal inbound path means a tapped
 * button and a typed command run through exactly the same dispatcher.
 */
export interface ChannelChoice {
  label: string;
  value: string;
}

export interface OutboundMessage {
  conversationId: string;
  text: string;
  /**
   * Turn this message into a pick-one dialog. Only honoured by connectors that
   * advertise `supportsChoices`; callers must fall back to plain text for the
   * others rather than sending options nobody can tap.
   */
  choices?: ChannelChoice[];
}

export interface ChannelConnectorEvents {
  /** Called for each inbound text message. */
  onInbound: (msg: InboundMessage) => void;
  /** Called whenever the connection status changes. */
  onStatus: (status: ChannelStatus, detail?: ChannelStatusDetail) => void;
  /**
   * Called when a user completed the pairing handshake. The manager persists
   * the sender into the channel allowlist so the agent replies to them.
   */
  onPaired?: (pairing: ChannelPairing) => void;
}

/** One entry in a messenger's command menu (Telegram's `/` autocomplete). */
export interface ChannelCommandDescriptor {
  /** Command name without the slash, e.g. "model". */
  name: string;
  /** One-line description shown next to the command. */
  description: string;
}

/** Transient options for a start/pair call — not persisted with the config. */
export interface ChannelPairOptions {
  /**
   * Where to send the user once pairing succeeds. The QR is usually scanned on
   * a phone, so the confirmation message carries this link back to Jait —
   * otherwise the user is stranded in the messenger app.
   */
  returnUrl?: string;
}

/**
 * Everything the UI needs to walk a user through creating the account this
 * channel talks through (for Telegram: a bot in @BotFather).
 */
export interface ChannelSetupGuide {
  /** Deep link that opens the messenger at the right place. */
  link: string;
  /** `link` rendered as a data-URL QR, so it can be scanned from a phone. */
  qr: string | null;
  /** Display name to suggest, e.g. "Jait Assistant". */
  suggestedName: string;
  /** Account name to suggest — unique per call where the platform requires it. */
  suggestedUsername: string;
}

export interface ChannelConnector {
  /** Stable connector id, e.g. "whatsapp". */
  readonly id: string;
  /** Human-readable label, e.g. "WhatsApp". */
  readonly label: string;
  /**
   * Whether `OutboundMessage.choices` renders as a tappable dialog (Telegram
   * inline keyboard). Connectors without one leave this unset so callers know
   * to send a numbered list instead.
   */
  readonly supportsChoices?: boolean;
  /**
   * Begin connecting. Emits status updates (including qr) via events. The
   * persisted channel config is passed so connectors can read credentials
   * (e.g. a bot token) and know whether they are already paired.
   */
  start(events: ChannelConnectorEvents, config?: ChannelConfig, options?: ChannelPairOptions): Promise<void>;
  /** Tear down the connection. */
  stop(): Promise<void>;
  /** Send an outbound message. Throws if not connected. */
  send(msg: OutboundMessage): Promise<void>;
  /** Current connection status. */
  status(): ChannelStatus;
  /** Current QR data-URL, if linking. */
  currentQr(): string | null;
  /**
   * Re-enter pairing mode to link an additional account, even when the channel
   * is already connected. Optional — connectors that link once (WhatsApp) omit it.
   */
  pair?(options?: ChannelPairOptions): Promise<void>;
  /**
   * Guide for creating the underlying account. Optional — only channels whose
   * setup starts inside the messenger (Telegram) provide one.
   */
  setupGuide?(): Promise<ChannelSetupGuide>;
  /**
   * Show the messenger's "typing" indicator until the returned function is
   * called. Optional — connectors without one omit it. Implementations own the
   * repeat cadence, since the indicator expires on most platforms.
   */
  startTyping?(conversationId: string): () => void;
  /**
   * Send a message and return its id, so it can be edited afterwards. Optional:
   * messengers without editable messages omit it and get no live progress.
   */
  sendLive?(conversationId: string, text: string): Promise<string | null>;
  /** Replace the text of a message sent via `sendLive`. Must not throw. */
  editLive?(conversationId: string, messageId: string, text: string): Promise<void>;
  /**
   * Publish the gateway's slash commands to the messenger's own command menu,
   * so typing `/` offers them. Optional — messengers without a command menu
   * (WhatsApp) omit it. Implementations must never throw: a command menu is a
   * convenience and must not take the channel down with it.
   */
  setCommandMenu?(commands: ChannelCommandDescriptor[]): Promise<void>;
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
  /**
   * Let the agent decide for itself whether a tool may run, instead of asking
   * in the chat before each one. On by default: an assistant that stops for a
   * yes/no on every step is unusable on a phone. Irreversible commands still
   * ask — that carve-out lives in the consent executor and is not bypassed.
   */
  autoApprove?: boolean;
  /**
   * Show what the agent is doing while it works — tool calls and their results
   * in a message that updates as the turn runs. On by default: a reply that
   * takes minutes with no sign of life is indistinguishable from a hang.
   */
  progress?: boolean;
  /**
   * Deliver gateway notifications (and anything routines push through them) to
   * this channel's allowed senders. Off by default — turning a messenger into a
   * notification sink is the user's call, not a side effect of linking it.
   */
  notifications?: boolean;
  /**
   * Model override for this channel, set in-chat with `/model`. Empty/undefined
   * falls back to the model picked in the web UI.
   */
  model?: string;
  /**
   * Provider serving `model`. Empty/"jait" means one of the HTTP backends;
   * anything else is a CLI (ACP) provider account such as Claude Code or Codex,
   * which the reply path runs as a supervised one-shot session.
   */
  modelProvider?: string;
  /**
   * Model used for a single turn when `model` cannot answer — a rejected key,
   * an expired login, an exhausted quota. Set with `/model fallback <id>`;
   * unset means the gateway default is tried instead. Never persisted as the
   * channel's model: a fallback covers one message, it does not silently
   * become the choice the user made.
   */
  fallbackModel?: string;
  /** Provider serving `fallbackModel`, same encoding as `modelProvider`. */
  fallbackModelProvider?: string;
  /**
   * IANA zone the chat's wall clock is measured in ("tomorrow at 5"). Unset
   * means the gateway host's zone, which is right whenever Jait runs on the
   * user's own machine.
   */
  timeZone?: string;
  /**
   * Channel credential (Telegram bot token from @BotFather). Stored server-side
   * and never returned by the REST API — reads report `tokenSet` instead.
   */
  token?: string;
}
