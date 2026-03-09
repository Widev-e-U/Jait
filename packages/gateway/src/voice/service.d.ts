import type { ConsentManager } from "../security/consent-manager.js";
export interface VoiceState {
    sessionId: string;
    wakeWordEnabled: boolean;
    talkModeEnabled: boolean;
    listening: boolean;
    lastTranscriptAt?: string;
    lastSpokenAt?: string;
}
export interface TranscriptionResult {
    text: string;
    wakeWordDetected: boolean;
    sentToAgent: boolean;
}
export declare class VoiceService {
    private readonly bySession;
    getState(sessionId: string): VoiceState;
    updateState(sessionId: string, patch: Partial<Omit<VoiceState, "sessionId">>): VoiceState;
    transcribe(input: {
        transcript?: string;
        audioBase64?: string;
        sessionId: string;
    }): TranscriptionResult;
    speak(input: {
        sessionId: string;
        text: string;
    }): {
        ok: true;
        audioBase64: string;
        mimeType: string;
    };
    resolveConsentFromUtterance(consentManager: ConsentManager, input: {
        text: string;
        sessionId?: string;
    }): {
        handled: boolean;
        approved?: boolean;
        requestId?: string;
    };
    private decodeAudioAsText;
}
//# sourceMappingURL=service.d.ts.map