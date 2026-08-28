import WebSocket from "ws";
import { SignJWT } from "jose";

// Live probe: subscribe to a terminal surface mid-execution and print what the
// gateway replays (exactly what a chat card would receive/render).
const terminalId = process.argv[2];
const outputOffset = process.argv[3];
if (!terminalId) {
  console.error("usage: node terminal-ws-probe.mjs <terminalId> [outputOffset]");
  process.exit(2);
}
const secretRaw = process.env.GATEWAY_JWT_SECRET;
if (!secretRaw) {
  console.error("GATEWAY_JWT_SECRET not set");
  process.exit(2);
}
const secret = new TextEncoder().encode(secretRaw);
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setSubject("local-probe")
  .setIssuedAt()
  .sign(secret);

const ws = new WebSocket(`ws://localhost:5199/ws?token=${encodeURIComponent(token)}`);
const events = [];

ws.on("open", () => {
  const msg = { type: "terminal.subscribe", terminalId };
  if (outputOffset !== undefined) msg.outputOffset = Number(outputOffset);
  ws.send(JSON.stringify(msg));
});

ws.on("message", (raw) => {
  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (data.type === "surface.connected" && data.payload?.replay) {
    events.push(data);
    ws.close();
  } else if (data.type === "error") {
    events.push(data);
    ws.close();
  }
});

const timeout = setTimeout(() => ws.close(), 4000);
ws.on("close", () => {
  clearTimeout(timeout);
  if (events.length === 0) {
    console.log(JSON.stringify({ result: "NO_REPLAY_EVENT" }));
    process.exit(1);
  }
  for (const ev of events) {
    const payload = ev.payload ?? {};
    console.log(`event: ${JSON.stringify(ev.type)}`);
    console.log("--- decoded slice ---");
    const text = typeof payload.data === "string" ? payload.data : "";
    console.log(JSON.stringify(text));
    console.log("--- stats ---");
    console.log(
      JSON.stringify({
        len: text.length,
        startsWithNewline: text.startsWith("\n") || text.startsWith("\r"),
        hasCommand: /sleep|echo|probe/.test(text),
        endsWithPrompt: /\$\s*$|>\s*$/.test(text.trimEnd()),
        seq: payload.seq,
        streamId: payload.streamId,
        outputOffset: payload.outputOffset,
      }),
    );
  }
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("ws error:", err.message);
  process.exit(1);
});