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

export class VoiceService {
  private readonly bySession = new Map<string, VoiceState>();

  getState(sessionId: string): VoiceState {
    const existing = this.bySession.get(sessionId);
    if (existing) return existing;
    const created: VoiceState = {
      sessionId,
      wakeWordEnabled: true,
      talkModeEnabled: false,
      listening: false,
    };
    this.bySession.set(sessionId, created);
    return created;
  }

  updateState(sessionId: string, patch: Partial<Omit<VoiceState, "sessionId">>): VoiceState {
    const current = this.getState(sessionId);
    const next = { ...current, ...patch, sessionId };
    this.bySession.set(sessionId, next);
    return next;
  }

  transcribe(input: { transcript?: string; audioBase64?: string; sessionId: string }): TranscriptionResult {
    const text = (input.transcript ?? this.decodeAudioAsText(input.audioBase64) ?? "").trim();
    const wakeWordDetected = /\bhey\s+jait\b/i.test(text);
    const state = this.getState(input.sessionId);

    if (wakeWordDetected && state.wakeWordEnabled) {
      this.updateState(input.sessionId, { listening: true });
    }

    if (text.length > 0) {
      this.updateState(input.sessionId, { lastTranscriptAt: new Date().toISOString() });
    }

    return {
      text,
      wakeWordDetected,
      sentToAgent: text.length > 0,
    };
  }

  speak(input: { sessionId: string; text: string }): { ok: true; audioBase64: string; mimeType: string } {
    this.updateState(input.sessionId, { lastSpokenAt: new Date().toISOString() });
    return {
      ok: true,
      audioBase64: Buffer.from(input.text, "utf8").toString("base64"),
      mimeType: "text/plain;base64",
    };
  }

  resolveConsentFromUtterance(
    consentManager: ConsentManager,
    input: { text: string; sessionId?: string },
  ): { handled: boolean; approved?: boolean; requestId?: string } {
    const normalized = input.text.trim().toLowerCase();
    const pending = consentManager.listPending(input.sessionId);
    if (pending.length === 0) return { handled: false };

    const target = pending[0];
    if (!target) return { handled: false };

    if (/^yes\b/.test(normalized)) {
      consentManager.approve(target.id, "voice", input.text);
      return { handled: true, approved: true, requestId: target.id };
    }
    if (/^(no|stop)\b/.test(normalized)) {
      consentManager.reject(target.id, "voice", input.text);
      return { handled: true, approved: false, requestId: target.id };
    }

    return { handled: false };
  }

  private decodeAudioAsText(audioBase64?: string): string | null {
    if (!audioBase64) return null;
    try {
      return Buffer.from(audioBase64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
}
