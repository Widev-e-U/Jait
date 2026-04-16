/** Voice-assistant types (OpenAI Realtime API, bundled in Jait). */
export type VoiceAssistantStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "listening" | "thinking" | "speaking" | "error";
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
export declare const VOICE_ASSISTANT_INITIAL_STATE: VoiceAssistantState;
/** Messages the browser sends to the gateway. */
export type VoiceClientMessage = {
    type: "audio";
    data: string;
} | {
    type: "commit";
} | {
    type: "interrupt";
} | {
    type: "announce";
    text: string;
} | {
    type: "stop";
};
/** Messages the gateway sends to the browser. */
export type VoiceServerMessage = {
    type: "session.started";
} | {
    type: "audio";
    data: string;
} | {
    type: "audio.done";
} | {
    type: "audio.interrupt";
} | {
    type: "transcript";
    role: "user" | "assistant";
    text: string;
    final: boolean;
} | {
    type: "status";
    status: VoiceAssistantStatus;
} | {
    type: "tool_call";
    name: string;
    status: "running" | "completed";
    result?: string;
} | {
    type: "error";
    message: string;
};
//# sourceMappingURL=voice-assistant.d.ts.map