import type { ToolDefinition } from "./contracts.js";
import type { VoiceService } from "../voice/service.js";
interface SpeakInput {
    text: string;
}
export declare function createVoiceSpeakTool(voiceService: VoiceService): ToolDefinition<SpeakInput>;
export {};
//# sourceMappingURL=voice-tools.d.ts.map