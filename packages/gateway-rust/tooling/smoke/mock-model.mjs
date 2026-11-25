#!/usr/bin/env node
// A local OpenAI-compatible model for the browser smoke run against the Rust gateway.
//
//   node mock-model.mjs <address-file> [<request-log>]
//
// Binds 127.0.0.1 on an ephemeral port, writes "http://127.0.0.1:<port>/v1" to <address-file>
// and answers the three calls the gateway makes:
//   GET  /v1/models            the model catalogue (one model, "smoke-model")
//   POST /v1/chat/completions  streamed (SSE) when the body asks for it, plain JSON otherwise
// Replies are driven by the newest message so a browser walk is deterministic:
//   "write the smoke note"  -> a consent-gated file_write tool call on smoke-note.txt
//   "read the smoke file"   -> a file_read tool call on README.md
//   a tool result           -> a sentence that quotes the start of that result
//   anything else           -> an echo of what the user wrote
// Every request body is appended to <request-log> (one JSON object per line) so the run can show
// what the gateway actually sent to the provider.
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const [addressFile, requestLog] = process.argv.slice(2);
if (!addressFile) {
  console.error("usage: mock-model.mjs <address-file> [<request-log>]");
  process.exit(2);
}

const MODEL = "smoke-model";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function newestMessage(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages.at(-1) ?? {};
}

function contentText(message) {
  const { content } = message;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === "string" ? part : (part?.text ?? ""))).join("");
  }
  return "";
}

/** Decides the reply: either plain text or one tool call. */
function plan(body) {
  const last = newestMessage(body);
  const text = contentText(last);
  if (last.role === "tool") {
    return { text: `The tool finished. Its result began: ${text.slice(0, 80).replace(/\s+/g, " ")}` };
  }
  if (text.includes("write the smoke note")) {
    return {
      tool: {
        id: "call_smoke_write",
        name: "file_write",
        arguments: { path: "smoke-note.txt", content: "written by the smoke model\n" },
      },
    };
  }
  if (text.includes("read the smoke file")) {
    return {
      tool: { id: "call_smoke_read", name: "file_read", arguments: { path: "README.md" } },
    };
  }
  return { text: `Hello from the smoke model. You said: ${text.slice(0, 200)}` };
}

function chunk(delta, finish) {
  return {
    id: "chatcmpl-smoke",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finish ?? null }],
  };
}

async function streamReply(response, reply) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  const send = (value) => response.write(`data: ${JSON.stringify(value)}\n\n`);
  send(chunk({ role: "assistant", content: "" }));
  if (reply.tool) {
    send(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: reply.tool.id,
            type: "function",
            function: { name: reply.tool.name, arguments: JSON.stringify(reply.tool.arguments) },
          },
        ],
      }),
    );
    send(chunk({}, "tool_calls"));
  } else {
    // Several small pieces, so a UI that only renders the final text is visible as such.
    const words = reply.text.split(/(\s+)/);
    for (let index = 0; index < words.length; index += 3) {
      send(chunk({ content: words.slice(index, index + 3).join("") }));
      await sleep(40);
    }
    send(chunk({}, "stop"));
  }
  response.write("data: [DONE]\n\n");
  response.end();
}

function completion(reply) {
  const message = reply.tool
    ? {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: reply.tool.id,
            type: "function",
            function: { name: reply.tool.name, arguments: JSON.stringify(reply.tool.arguments) },
          },
        ],
      }
    : { role: "assistant", content: reply.text };
  return {
    id: "chatcmpl-smoke",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [{ index: 0, message, finish_reason: reply.tool ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

async function readBody(request) {
  const parts = [];
  for await (const part of request) parts.push(part);
  const raw = Buffer.concat(parts).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { unparsed: raw };
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && /\/v1\/models\/?$/.test(url.pathname)) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ object: "list", data: [{ id: MODEL, object: "model" }] }));
    return;
  }
  if (request.method === "POST" && /\/v1\/chat\/completions\/?$/.test(url.pathname)) {
    const body = await readBody(request);
    if (requestLog) {
      appendFileSync(
        requestLog,
        `${JSON.stringify({ at: new Date().toISOString(), authorization: request.headers.authorization ? "present" : "absent", body })}\n`,
      );
    }
    const reply = plan(body);
    if (body.stream === true) {
      await streamReply(response, reply);
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(completion(reply)));
    }
    return;
  }
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: { message: `unknown route ${request.method} ${url.pathname}` } }));
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  writeFileSync(addressFile, `http://127.0.0.1:${port}/v1\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
