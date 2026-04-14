/**
 * Voice-assistant service — bridges the browser to OpenAI's Realtime API.
 *
 * Architecture:
 *   Browser  ←WebSocket→  Gateway  ←WebSocket→  OpenAI Realtime API
 *
 * The gateway sits in the middle, relaying audio in both directions and
 * intercepting function calls to execute them locally with full Jait access.
 * This is a GLOBAL session — not tied to any workspace.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { VoiceClientMessage, VoiceServerMessage } from "@jait/shared";
import { getVoiceToolSchemas, executeVoiceTool, type VoiceToolDeps } from "./tools.js";

type RuntimeVoiceClientMessage =
  | VoiceClientMessage
  | { type: "interrupt" }
  | { type: "announce"; text: string };

export interface VoiceAssistantServiceDeps extends VoiceToolDeps {
  /** Verify a JWT token → return user info or null. */
  verifyToken: (token: string) => Promise<{ id: string; username: string } | null>;
  /** Look up per-user API keys from their settings. */
  getUserApiKeys?: (userId: string) => Record<string, string>;
}

export class VoiceAssistantService {
  private wss: WebSocketServer;
  private deps: VoiceAssistantServiceDeps;

  constructor(deps: VoiceAssistantServiceDeps) {
    this.deps = deps;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req).catch((err) => {
        console.error("[voice-assistant] Connection handler error:", err);
        try { ws.close(1011, "Internal error"); } catch {}
      });
    });
  }

  /** Handle HTTP → WebSocket upgrade for the /ws/voice-assistant path. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
    });
  }

  private async handleConnection(clientWs: WebSocket, req: IncomingMessage) {
    // ── Auth ──────────────────────────────────────────────────
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") ?? "";
    const user = await this.deps.verifyToken(token);
    if (!user) {
      send(clientWs, { type: "error", message: "Unauthorized" });
      clientWs.close(4001, "Unauthorized");
      return;
    }

    // ── Resolve API key: user settings first, then server config ─
    const userApiKeys = this.deps.getUserApiKeys?.(user.id) ?? {};
    const apiKey = userApiKeys.OPENAI_API_KEY?.trim() || this.deps.config.openaiApiKey;
    if (!apiKey) {
      send(clientWs, { type: "error", message: "OpenAI API key not configured. Set it in Settings → API Keys." });
      clientWs.close(4002, "Not configured");
      return;
    }

    console.log(`[voice-assistant] ${user.username} connected (key source: ${userApiKeys.OPENAI_API_KEY ? "user" : "server"})`);

    // ── Connect to OpenAI Realtime API ───────────────────────
    const model = this.deps.config.realtimeModel;
    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

    let openaiWs: WebSocket;
    try {
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
      });
    } catch (err) {
      send(clientWs, { type: "error", message: `Failed to connect to OpenAI: ${err}` });
      clientWs.close(4003, "OpenAI connection failed");
      return;
    }

    let openaiReady = false;
    let responseInProgress = false;
    let pendingToolResponse = false;
    let suppressAssistantAudio = false;
    const pendingAnnouncements: string[] = [];

    const flushNextAnnouncement = () => {
      if (responseInProgress) return;
      const nextAnnouncement = pendingAnnouncements.shift();
      if (!nextAnnouncement) return;
      openaiWs.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{
            type: "input_text",
            text: `System update. Speak this update to the user in one short sentence: ${nextAnnouncement}`,
          }],
        },
      }));
      openaiWs.send(JSON.stringify({ type: "response.create" }));
    };

    // ── OpenAI → Gateway → Browser ───────────────────────────
    openaiWs.on("open", () => {
      openaiReady = true;
      console.log(`[voice-assistant] OpenAI Realtime connected (model: ${model})`);

      // Configure the session
      const sessionUpdate = {
        type: "session.update",
        session: {
          type: "realtime",
          instructions: this.buildInstructions(user.username),
          tools: getVoiceToolSchemas(),
          tool_choice: "auto",
        },
      };
      openaiWs.send(JSON.stringify(sessionUpdate));
      send(clientWs, { type: "session.started" });
      send(clientWs, { type: "status", status: "listening" });
    });

    openaiWs.on("message", async (raw) => {
      let event: any;
      try {
        event = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        return;
      }

      // Debug: log all events from OpenAI
      if (event.type !== "response.audio.delta") {
        console.log(`[voice-assistant] OpenAI event: ${event.type}`, event.type === "error" ? event.error : "");
      }

      switch (event.type) {
        // ── Audio from assistant ──────────────────────────────
        case "response.audio.delta":
        case "response.output_audio.delta":
          responseInProgress = true;
          if (suppressAssistantAudio) break;
          send(clientWs, { type: "audio", data: event.delta });
          send(clientWs, { type: "status", status: "speaking" });
          break;

        case "response.audio.done":
        case "response.output_audio.done":
          responseInProgress = false;
          suppressAssistantAudio = false;
          send(clientWs, { type: "audio.done" });
          send(clientWs, { type: "status", status: "listening" });
          break;

        // ── Transcription ────────────────────────────────────
        case "conversation.item.input_audio_transcription.completed":
          send(clientWs, { type: "transcript", role: "user", text: event.transcript ?? "", final: true });
          break;

        case "response.audio_transcript.delta":
        case "response.output_audio_transcript.delta":
          send(clientWs, { type: "transcript", role: "assistant", text: event.delta ?? "", final: false });
          break;

        case "response.audio_transcript.done":
        case "response.output_audio_transcript.done":
          send(clientWs, { type: "transcript", role: "assistant", text: event.transcript ?? "", final: true });
          break;

        // ── Function calls ───────────────────────────────────
        case "response.function_call_arguments.done": {
          const callId = event.call_id;
          const fnName = event.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(event.arguments ?? "{}");
          } catch {}

          console.log(`[voice-assistant] Tool call: ${fnName}`, JSON.stringify(fnArgs));
          send(clientWs, { type: "tool_call", name: fnName, status: "running" });
          send(clientWs, { type: "status", status: "thinking" });

          const connectionDeps: VoiceToolDeps = { ...this.deps, userApiKeys };
          const result = await executeVoiceTool(fnName, fnArgs, connectionDeps);

          // ── Handle stop_voice: say goodbye then close ──
          if (result === "__STOP_VOICE__") {
            send(clientWs, { type: "tool_call", name: fnName, status: "completed", result: "Ending session." });
            send(clientWs, { type: "status", status: "disconnected" });
            // Give the client a moment to process, then close
            setTimeout(() => {
              try { openaiWs.close(1000, "Voice stopped by assistant"); } catch {}
              try { clientWs.close(1000, "Voice stopped by assistant"); } catch {}
            }, 500);
            break;
          }

          send(clientWs, { type: "tool_call", name: fnName, status: "completed", result });

          // Send function output back to OpenAI
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: result,
              },
            }));

            // Only create a new response if none is in progress; otherwise defer
            if (!responseInProgress) {
              openaiWs.send(JSON.stringify({ type: "response.create" }));
            } else {
              pendingToolResponse = true;
            }
          }
          break;
        }

        // ── Errors ───────────────────────────────────────────
        case "error": {
          const errMsg = event.error?.message ?? "OpenAI error";
          // Suppress harmless "no active response" from cancel attempts
          if (errMsg.includes("no active response")) break;
          console.error("[voice-assistant] OpenAI error:", event.error);
          send(clientWs, { type: "error", message: errMsg });
          break;
        }

        // ── Interruption (server VAD detected user speech) ───
        case "input_audio_buffer.speech_started":
          // User started speaking — cancel only if assistant is actively responding
          if (responseInProgress) {
            suppressAssistantAudio = true;
            openaiWs.send(JSON.stringify({ type: "response.cancel" }));
            send(clientWs, { type: "audio.interrupt" });
            responseInProgress = false;
          }
          send(clientWs, { type: "status", status: "listening" });
          break;

        case "conversation.item.truncated":
          // Acknowledged by OpenAI after we sent conversation.item.truncate
          break;

        case "input_audio_buffer.speech_stopped":
          // Server VAD detected end of speech — response will be created automatically
          break;

        case "response.cancelled":
          responseInProgress = false;
          suppressAssistantAudio = false;
          flushNextAnnouncement();
          send(clientWs, { type: "status", status: "listening" });
          break;

        case "response.done":
          responseInProgress = false;
          suppressAssistantAudio = false;
          // If a tool result was submitted while a response was active, trigger now
          if (pendingToolResponse) {
            pendingToolResponse = false;
            openaiWs.send(JSON.stringify({ type: "response.create" }));
          } else if (pendingAnnouncements.length > 0) {
            flushNextAnnouncement();
          } else {
            send(clientWs, { type: "status", status: "listening" });
          }
          break;

        default:
          // Ignore other events (session.created, session.updated, etc.)
          break;
      }
    });

    openaiWs.on("close", (code, reason) => {
      console.log(`[voice-assistant] OpenAI disconnected: ${code} ${reason}`);
      send(clientWs, { type: "error", message: "OpenAI session ended" });
      clientWs.close(1000, "OpenAI disconnected");
    });

    openaiWs.on("error", (err) => {
      console.error("[voice-assistant] OpenAI WS error:", err);
      send(clientWs, { type: "error", message: `OpenAI connection error: ${err.message}` });
    });

    // ── Browser → Gateway → OpenAI ───────────────────────────
    let audioChunkCount = 0;
    clientWs.on("message", (raw) => {
      if (!openaiReady) return;

      let msg: RuntimeVoiceClientMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "audio":
          audioChunkCount++;
          if (audioChunkCount <= 3 || audioChunkCount % 50 === 0) {
            console.log(`[voice-assistant] Audio chunk #${audioChunkCount} (${msg.data.length} base64 chars)`);
          }
          openaiWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: msg.data,
          }));
          break;

        case "commit":
          openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          break;

        case "interrupt":
          if (responseInProgress) {
            suppressAssistantAudio = true;
            openaiWs.send(JSON.stringify({ type: "response.cancel" }));
            send(clientWs, { type: "audio.interrupt" });
            responseInProgress = false;
          }
          send(clientWs, { type: "status", status: "listening" });
          break;

        case "announce": {
          const text = typeof msg.text === "string" ? msg.text.trim() : "";
          if (!text) break;
          pendingAnnouncements.push(text);
          if (!responseInProgress) {
            flushNextAnnouncement();
          }
          break;
        }

        case "stop":
          openaiWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          openaiWs.close(1000, "User ended session");
          break;
      }
    });

    // ── Cleanup ──────────────────────────────────────────────
    clientWs.on("close", () => {
      console.log(`[voice-assistant] ${user.username} disconnected`);
      if (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING) {
        openaiWs.close(1000, "Client disconnected");
      }
    });

    clientWs.on("error", () => {
      try { openaiWs.close(); } catch {}
    });
  }

  private buildInstructions(username: string): string {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
    return `# Persona
You are Jait — a personal AI assistant modelled after JARVIS from Iron Man.
You are the voice interface for the Jait workspace management system.
The user's name is ${username}. Address them respectfully ("Sir", "Boss", etc.).

# Language
The user's system locale is "${locale}". Respond in the language matching that locale.
If the user speaks a different language, switch to match theirs.
Always respond in the same language the user is using.

# Voice Behavior
- Be a proactive, intelligent assistant like JARVIS. Anticipate needs.
- Keep responses SHORT and conversational — you're speaking out loud, not writing an essay.
- Use clear, natural sentences. Avoid bullet lists, markdown, or code blocks in speech.
- Be direct, efficient, witty, and slightly formal — the JARVIS personality.
- Greeting style: acknowledge the user, then briefly share something useful (e.g. a quick status update, current time, or an interesting fact from memory).
- For simple facts (time, weather), answer in one sentence.
- For complex tool results, summarise the key points.

# On Startup / First Message
When the user first speaks (or says "Hey Jait"), provide a concise Jarvis-style greeting:
1. Greet them by name in their language
2. Use search_memory to check for any relevant context about them
3. Proactively mention 1-2 useful things: system status, current time, or any interesting context from memory

# System Integration
You have direct access to the Jait system through function calls:
- jait_system_status — check what's active
- list_sessions, list_workspaces, list_threads — see what's open
- send_to_agent — delegate coding tasks to CLI agents
- search_memory, save_memory — recall and store information
- search_web — look up current events, news, facts
- get_weather — weather by city
- get_time_and_date — current time
- get_system_info — host computer resources
- stop_voice — end this voice session (when user says goodbye or asks you to stop)

# Tool Usage Rules
- For ANY factual question about current events, ALWAYS call search_web with a clear search query string.
- When calling search_web, the "query" parameter MUST be a non-empty descriptive search string.
- When the user tells you personal information, use save_memory to remember it.
- Before answering questions about past interactions, use search_memory.
- When the user asks you to code or fix something, use send_to_agent.`;
  }
}

function send(ws: WebSocket, msg: VoiceServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
