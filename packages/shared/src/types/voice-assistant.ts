/** Voice-assistant types (OpenAI Realtime API, bundled in Jait). */

export type VoiceAssistantStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface VoiceAssistantState {
  status: VoiceAssistantStatus;
  /** Whether local mic is capturing. */
  micActive: boolean;
  /** Whether the assistant is currently outputting audio. */
  assistantSpeaking: boolean;
  /** Latest user transcript (partial or final). */
  userTranscript: string;
  /** Latest assistant transcript (partial or final). */
  assistantTranscript: string;
  error?: string;
}

export const VOICE_ASSISTANT_INITIAL_STATE: VoiceAssistantState = {
  status: "disconnected",
  micActive: false,
  assistantSpeaking: false,
  userTranscript: "",
  assistantTranscript: "",
};

// ── WebSocket protocol between browser ↔ gateway ────────────

/** Messages the browser sends to the gateway. */
export type VoiceClientMessage =
  | { type: "audio"; data: string }          // base64 PCM16 24kHz mono
  | { type: "commit" }                        // force commit current audio buffer
  | { type: "interrupt" }                     // user barged in — cancel assistant speech
  | { type: "announce"; text: string }        // ask current voice session to report an update
  | { type: "stop" };                         // end session

/** Messages the gateway sends to the browser. */
export type VoiceServerMessage =
  | { type: "session.started" }
  | { type: "audio"; data: string }           // base64 PCM16 24kHz mono
  | { type: "audio.done" }                    // assistant finished speaking
  | { type: "audio.interrupt" }               // user interrupted — clear playback
  | { type: "transcript"; role: "user" | "assistant"; text: string; final: boolean }
  | { type: "status"; status: VoiceAssistantStatus }
  | { type: "tool_call"; name: string; status: "running" | "completed"; result?: string }
  | { type: "error"; message: string };
