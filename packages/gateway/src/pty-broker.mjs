#!/usr/bin/env node
/**
 * PTY Broker — runs under Node.js to work around Bun's broken ConPTY pipe.
 *
 * Protocol: newline-delimited JSON over stdin (commands) / stdout (events).
 *
 * Commands  (gateway → broker):
 *   { id, cmd:"spawn",  shell, cols, rows, cwd, env }
 *   { id, cmd:"write",  ptyId, data }
 *   { id, cmd:"resize", ptyId, cols, rows }
 *   { id, cmd:"kill",   ptyId }
 *   { id, cmd:"ping" }
 *
 * Events    (broker → gateway):
 *   { id, ok:true, ptyId, pid }                   — spawn reply
 *   { id, ok:true }                               — write/resize/kill ack
 *   { id, ok:false, error }                       — error reply
 *   { event:"output", ptyId, data }               — PTY output chunk
 *   { event:"exit",   ptyId, exitCode, signal }   — PTY exited
 */

import { createRequire } from "node:module";
import { createInterface } from "node:readline";

// node-pty is installed inside packages/gateway/node_modules
const require = createRequire(import.meta.url);
const pty = require("node-pty");

/** @type {Map<string, import("node-pty").IPty>} */
const ptys = new Map();
let nextPtyId = 1;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function handleCommand(msg) {
  const { id, cmd } = msg;

  try {
    switch (cmd) {
      case "ping": {
        send({ id, ok: true });
        break;
      }

      case "spawn": {
        const { shell, cols, rows, cwd, env } = msg;
        const ptyId = `pty-${nextPtyId++}`;
        const proc = pty.spawn(shell || "powershell.exe", [], {
          name: "xterm-256color",
          cols: cols || 120,
          rows: rows || 30,
          cwd: cwd || process.cwd(),
          env: { ...process.env, TERM: "xterm-256color", ...(env || {}) },
        });

        ptys.set(ptyId, proc);

        proc.onData((data) => {
          send({ event: "output", ptyId, data });
        });

        proc.onExit(({ exitCode, signal }) => {
          ptys.delete(ptyId);
          send({ event: "exit", ptyId, exitCode, signal });
        });

        send({ id, ok: true, ptyId, pid: proc.pid });
        break;
      }

      case "write": {
        const proc = ptys.get(msg.ptyId);
        if (!proc) {
          send({ id, ok: false, error: `PTY ${msg.ptyId} not found` });
          return;
        }
        proc.write(msg.data);
        send({ id, ok: true });
        break;
      }

      case "resize": {
        const proc = ptys.get(msg.ptyId);
        if (!proc) {
          send({ id, ok: false, error: `PTY ${msg.ptyId} not found` });
          return;
        }
        proc.resize(msg.cols || 120, msg.rows || 30);
        send({ id, ok: true });
        break;
      }

      case "kill": {
        const proc = ptys.get(msg.ptyId);
        if (proc) {
          try { proc.kill(); } catch { /* already dead */ }
          ptys.delete(msg.ptyId);
        }
        send({ id, ok: true });
        break;
      }

      default:
        send({ id, ok: false, error: `Unknown command: ${cmd}` });
    }
  } catch (err) {
    send({ id, ok: false, error: err.message || String(err) });
  }
}

// Read newline-delimited JSON from stdin
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    handleCommand(msg);
  } catch {
    // ignore malformed input
  }
});

// Cleanup on exit
process.on("SIGINT", () => {
  for (const proc of ptys.values()) {
    try { proc.kill(); } catch { /* */ }
  }
  process.exit(0);
});
process.on("SIGTERM", () => {
  for (const proc of ptys.values()) {
    try { proc.kill(); } catch { /* */ }
  }
  process.exit(0);
});

// Signal readiness — stderr so it doesn't pollute the JSON protocol on stdout
process.stderr.write("pty-broker ready\n");
