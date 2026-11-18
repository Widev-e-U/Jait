/**
 * Voice-assistant service — bridges the browser to OpenAI's Realtime API.
 *
 * Architecture:
 *   Browser  ←WebSocket→  Gateway  ←WebSocket→  OpenAI Realtime API
 *
 * The gateway sits in the middle, relaying audio in both directions and
 * intercepting function calls to execute them locally with full Jait access.
 * This is a GLOBAL session — not tied to any project.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { VoiceClientMessage, VoiceServerMessage } from "@jait/shared";
import { getVoiceToolSchemas, executeVoiceTool, type VoiceToolDeps, type BackgroundTask, BackgroundTaskManager } from "./tools.js";
import { VoiceService } from "../voice/service.js";

type RuntimeVoiceClientMessage =
  | VoiceClientMessage
  | { type: "interrupt" }
  | { type: "announce"; text: string };

type RealtimeTurnDetection =
  | {
      type: "server_vad";
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
      create_response: boolean;
      interrupt_response: boolean;
    }
  | {
      type: "semantic_vad";
      eagerness: "low" | "medium" | "high" | "auto";
      create_response: boolean;
      interrupt_response: boolean;
    }
  | null;

interface VoiceTiming {
  speechStartedAt?: number;
  speechStoppedAt?: number;
  responseStartedAt?: number;
  firstAudioAt?: number;
  interruptStartedAt?: number;
}

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

    // Per-user STT prompt override (falls back to server config default).
    const sttPrompt = userApiKeys.STT_PROMPT?.trim() || this.deps.config.sttPrompt;

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
    const timing: VoiceTiming = {};
    const pendingAnnouncements: string[] = [];
    // Per-connection holder so `select_project` persists across tool calls.
    const projectContext: { activeProjectId?: string } = {};

    const logTiming = (event: string, data: Record<string, number | string | boolean | undefined>) => {
      console.log(`[voice-assistant] timing.${event}`, JSON.stringify(data));
    };

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

    // ── Background delegation wiring ────────────────────────
    const backgroundTasks = new BackgroundTaskManager();
    const onBackgroundTaskComplete = (task: BackgroundTask) => {
      if (openaiWs.readyState !== WebSocket.OPEN || !openaiReady) return;
      const summary =
        task.status === "completed"
          ? `Background task "${task.title}" finished. Tell the user the result in 1-2 short sentences: ${(task.result ?? "").slice(0, 1500)}`
          : task.status === "error"
            ? `Background task "${task.title}" failed. Tell the user it failed and briefly why: ${(task.error ?? "").slice(0, 500)}`
            : `Background task "${task.title}" was cancelled.`;
      pendingAnnouncements.push(summary);
      flushNextAnnouncement();
    };

    // ── OpenAI → Gateway → Browser ───────────────────────────
    openaiWs.on("open", () => {
      openaiReady = true;
      console.log(`[voice-assistant] OpenAI Realtime connected (model: ${model})`);

      openaiWs.send(JSON.stringify(this.buildSessionUpdate(user.username, sttPrompt)));
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
        case "response.created":
          timing.responseStartedAt = performance.now();
          break;

        // ── Audio from assistant ──────────────────────────────
        case "response.audio.delta":
        case "response.output_audio.delta":
          responseInProgress = true;
          if (suppressAssistantAudio) break;
          if (timing.firstAudioAt === undefined) {
            timing.firstAudioAt = performance.now();
            logTiming("first_audio", {
              ms_after_speech_stop: timing.speechStoppedAt === undefined
                ? undefined
                : Math.round(timing.firstAudioAt - timing.speechStoppedAt),
              ms_after_response_start: timing.responseStartedAt === undefined
                ? undefined
                : Math.round(timing.firstAudioAt - timing.responseStartedAt),
            });
          }
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
          send(clientWs, { type: "transcript", role: "user", text: VoiceService.normalizeTranscript(event.transcript ?? ""), final: true });
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

          // Resolve the project root from the currently selected project (if any).
          let projectRoot = "";
          if (projectContext.activeProjectId && this.deps.projectService) {
            try {
              const project = await this.deps.projectService.getById(projectContext.activeProjectId, user.id);
              projectRoot = project?.rootPath ?? "";
            } catch {}
          }

          const connectionDeps: VoiceToolDeps = {
            ...this.deps,
            userApiKeys,
            userId: user.id,
            clientIp: getClientIp(req),
            sessionId: `voice-${user.id}`,
            actionId: `voice-${Date.now()}`,
            projectContext,
            projectRoot,
            backgroundTasks,
            onBackgroundTaskComplete,
          };
          // Cover the escalation gap out loud: if a foreground escalation runs
          // past the filler budget, speak a short ack instead of dead air.
          const fillerText = "Still working on that — one moment.";
          const isForegroundEscalation =
            fnName === "ask_agent_about_request" && fnArgs.background !== true;
          let fillerTimer: ReturnType<typeof setTimeout> | undefined;
          if (isForegroundEscalation && this.deps.config.voiceEscalationFillerMs > 0) {
            fillerTimer = setTimeout(() => {
              if (openaiWs.readyState !== WebSocket.OPEN || !openaiReady) return;
              pendingAnnouncements.push(fillerText);
              flushNextAnnouncement();
            }, Math.max(500, this.deps.config.voiceEscalationFillerMs));
          }

          let result: string;
          try {
            result = await executeVoiceTool(fnName, fnArgs, connectionDeps);
          } finally {
            if (fillerTimer) clearTimeout(fillerTimer);
            const queuedFiller = pendingAnnouncements.indexOf(fillerText);
            if (queuedFiller >= 0) pendingAnnouncements.splice(queuedFiller, 1);
          }

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
          timing.speechStartedAt = performance.now();
          logTiming("speech_started", {
            ms_after_first_audio: timing.firstAudioAt === undefined
              ? undefined
              : Math.round(timing.speechStartedAt - timing.firstAudioAt),
            response_in_progress: responseInProgress,
          });
          // User started speaking — cancel only if assistant is actively responding
          if (responseInProgress) {
            timing.interruptStartedAt = performance.now();
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
          timing.speechStoppedAt = performance.now();
          timing.responseStartedAt = undefined;
          timing.firstAudioAt = undefined;
          logTiming("speech_stopped", {
            speech_ms: timing.speechStartedAt === undefined
              ? undefined
              : Math.round(timing.speechStoppedAt - timing.speechStartedAt),
          });
          // Server VAD detected end of speech — response will be created automatically
          break;

        case "response.cancelled":
          if (timing.interruptStartedAt !== undefined) {
            logTiming("interrupt_cancelled", {
              cancel_ms: Math.round(performance.now() - timing.interruptStartedAt),
            });
            timing.interruptStartedAt = undefined;
          }
          responseInProgress = false;
          suppressAssistantAudio = false;
          flushNextAnnouncement();
          send(clientWs, { type: "status", status: "listening" });
          break;

        case "response.done":
          if (timing.firstAudioAt !== undefined) {
            logTiming("response_done", {
              audio_ms: Math.round(performance.now() - timing.firstAudioAt),
            });
          }
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
    let acceptedInitialText = false;
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

        case "initial_text": {
          const text = typeof msg.text === "string" ? msg.text.trim() : "";
          if (acceptedInitialText || !text || text.length > 4000) break;
          acceptedInitialText = true;
          openaiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
          }));
          responseInProgress = true;
          openaiWs.send(JSON.stringify({ type: "response.create" }));
          send(clientWs, { type: "status", status: "thinking" });
          break;
        }

        case "commit":
          openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          break;

        case "interrupt":
          if (responseInProgress) {
            timing.interruptStartedAt = performance.now();
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
      const running = backgroundTasks.list().filter((t) => t.status === "running");
      if (running.length > 0) {
        console.log(`[voice-assistant] Cancelling ${running.length} running background task(s) on disconnect`);
      }
      void backgroundTasks.clear();
      if (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING) {
        openaiWs.close(1000, "Client disconnected");
      }
    });

    clientWs.on("error", () => {
      try { openaiWs.close(); } catch {}
    });
  }

  private buildSessionUpdate(username: string, sttPrompt: string) {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        instructions: this.buildInstructions(username),
        voice: this.deps.config.realtimeVoice,
        turn_detection: this.buildTurnDetection(),
        tools: getVoiceToolSchemas(this.deps.toolRegistry),
        tool_choice: "auto",
        // Bias speech-to-text toward domain proper nouns (e.g. "Jait", not "Jade").
        input_audio_transcription: {
          model: this.deps.config.realtimeTranscribeModel,
          prompt: sttPrompt,
        },
      },
    };
  }

  private buildTurnDetection(): RealtimeTurnDetection {
    const mode = (process.env["OPENAI_REALTIME_TURN_DETECTION"] ?? "semantic_vad").trim();
    if (mode === "disabled" || mode === "none" || mode === "manual") return null;

    if (mode === "semantic_vad") {
      const rawEagerness = process.env["OPENAI_REALTIME_SEMANTIC_EAGERNESS"] ?? "auto";
      const eagerness = ["low", "medium", "high", "auto"].includes(rawEagerness)
        ? rawEagerness as "low" | "medium" | "high" | "auto"
        : "auto";
      return {
        type: "semantic_vad",
        eagerness,
        create_response: true,
        interrupt_response: true,
      };
    }

    return {
      type: "server_vad",
      threshold: envNumber("OPENAI_REALTIME_VAD_THRESHOLD", 0.5),
      prefix_padding_ms: envInteger("OPENAI_REALTIME_PREFIX_PADDING_MS", 300),
      silence_duration_ms: envInteger("OPENAI_REALTIME_SILENCE_DURATION_MS", 450),
      create_response: true,
      interrupt_response: true,
    };
  }

  private buildInstructions(username: string): string {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || "en";
    return `# Persona
You are Jait — a personal AI assistant modelled after JARVIS from Iron Man.
You are the voice interface for the Jait project management system.
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
- list_sessions, list_projects, list_threads — see what's open
- ask_agent_about_request — ask a normal Jait agent for a better-informed explanation or answer
- send_to_agent — delegate coding tasks to CLI agents
- search_memory, save_memory — recall and store information
- search_web — look up current events, news, facts
- get_location — approximate current location for local questions
- get_weather — weather by city
- get_time_and_date — current time
- get_system_info — host computer resources
- list_background_tasks — see what background tasks are running or recently finished
- cancel_background_task — stop a running background task by id
- stop_voice — end this voice session (when user says goodbye or asks you to stop)

# Tool Usage Rules
- For ANY factual question about current events, ALWAYS call search_web with a clear search query string.
- When calling search_web, the "query" parameter MUST be a non-empty descriptive search string.
- When the user tells you personal information, use save_memory to remember it.
- Before answering questions about past interactions, use search_memory.
- Decide local-vs-escalate on every turn. That judgment is the core of this session.
- Answer locally and instantly for: greetings, acknowledgements, "thanks/ok/yes", restating what you just said, short factual recall you are certain of, time/date/weather/memory/system lookups, and anything already in the transcript. Never spend an escalation on these.
- Escalate with ask_agent_about_request for: Jait state you cannot see (what projects, threads, sessions, tools, providers or agents are doing), anything about the user's code or repo, multi-step reasoning, comparisons and trade-offs, design or architecture questions, error diagnosis, and anything where being wrong would cost the user real time.
- When the user names an agent ("ask the normal agent", "ask Jait", "ask Codex"), call ask_agent_about_request with their exact request even if you could guess an answer.
- You decide whether to escalate; Jait decides which model answers. Leave tier as "auto" so cheap questions go to the fast tier and hard ones to the deep tier. Force tier "deep" only when the user explicitly wants the strongest or most careful answer.
- Escalated answers take a few seconds, so speak a brief natural lead-in first ("let me check that") instead of going silent. After the answer returns, summarize it in one or two spoken sentences rather than reading raw structured output.
- For work that will obviously take minutes (deep research, analysis, multi-step code work), call ask_agent_about_request with background set to true, then tell the user you started it.
- When the user asks what's running in the background, call list_background_tasks; to stop one, call cancel_background_task with its id.
- When the user asks you to code or fix something, use send_to_agent.`;
  }
}

function send(ws: WebSocket, msg: VoiceServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function getClientIp(req: IncomingMessage): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0]?.trim();
  }
  return req.socket.remoteAddress;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envInteger(name: string, fallback: number): number {
  return Math.round(envNumber(name, fallback));
}
