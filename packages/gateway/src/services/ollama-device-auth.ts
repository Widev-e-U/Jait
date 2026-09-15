import { createPrivateKey, createPublicKey, sign, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchOllamaUsageFrom, isOllamaUsageResponse, OllamaUsageError, type OllamaCloudAccount, type OllamaUsageResponse } from "./provider-quota-fetchers.js";

/** Only the gateway's local daemon can use the gateway's device credentials. */
export function isLocalOllamaUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

/** Decode Ollama's unencrypted OpenSSH Ed25519 key; Node only imports PKCS8. */
export function parseOllamaDeviceKey(pem: string): KeyObject {
  const fail = () => new Error("Unsupported Ollama device key: expected an unencrypted OpenSSH Ed25519 key.");
  const match = pem.trim().match(/^-----BEGIN OPENSSH PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)-----END OPENSSH PRIVATE KEY-----$/);
  if (!match?.[1] || pem.length > 16_384) throw fail();
  const data = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  const magic = Buffer.from("openssh-key-v1\0");
  if (!data.subarray(0, magic.length).equals(magic)) throw fail();
  function reader(buffer: Buffer, start = 0) {
    let offset = start;
    const uint = () => {
      if (offset + 4 > buffer.length) throw fail();
      const n = buffer.readUInt32BE(offset); offset += 4; return n;
    };
    const bytes = () => {
      const length = uint();
      if (length > buffer.length - offset) throw fail();
      const value = buffer.subarray(offset, offset + length); offset += length; return value;
    };
    return { uint, bytes };
  }
  const outer = reader(data, magic.length);
  if (outer.bytes().toString() !== "none" || outer.bytes().toString() !== "none" || outer.bytes().length !== 0 || outer.uint() !== 1) throw fail();
  const publicBlob = outer.bytes();
  const inner = reader(outer.bytes());
  if (inner.uint() !== inner.uint() || inner.bytes().toString() !== "ssh-ed25519") throw fail();
  const publicKey = inner.bytes();
  const privateKey = inner.bytes();
  if (publicKey.length !== 32 || privateKey.length !== 64 || !privateKey.subarray(32).equals(publicKey)) throw fail();
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), privateKey.subarray(0, 32)]), format: "der", type: "pkcs8" });
  const derived = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32);
  if (!derived.equals(publicKey) || !publicBlob.equals(sshPublicKey(derived))) throw fail();
  return key;
}

function sshPublicKey(raw: Buffer): Buffer {
  return Buffer.concat([Buffer.from("0000000b7373682d6564323535313900000020", "hex"), raw]);
}

export function signOllamaRequest(key: KeyObject, method: string, path: string, timestamp: string): string {
  const publicKey = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32);
  const signature = sign(null, Buffer.from(`${method},${path}?ts=${timestamp}`), key);
  return `${sshPublicKey(publicKey).toString("base64")}:${signature.toString("base64")}`;
}

export function ollamaDeviceKeyPaths(): string[] {
  // Operator configuration only: never accept a key path from an HTTP request.
  const configured = process.env.JAIT_OLLAMA_DEVICE_KEY_PATH?.trim();
  return configured ? [configured] : [join(homedir(), ".ollama", "id_ed25519"), ...(process.platform === "linux" ? ["/usr/share/ollama/.ollama/id_ed25519"] : [])];
}

async function readDeviceKey(): Promise<KeyObject> {
  const paths = ollamaDeviceKeyPaths();
  for (const path of paths) {
    let pem: string;
    try { pem = await readFile(path, "utf8"); } catch { continue; }
    return parseOllamaDeviceKey(pem);
  }
  throw new Error("Ollama device key is not readable by Jait. Configure JAIT_OLLAMA_DEVICE_KEY_PATH and grant the gateway user read access, or add an Ollama Cloud API key.");
}

async function signedRequest(key: KeyObject, method: string, path: string): Promise<unknown> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Fixed origin and no redirects: signatures must never reach a backend URL.
  const response = await fetch(`https://ollama.com${path}?ts=${timestamp}`, {
    method, redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: signOllamaRequest(key, method, path, timestamp), Accept: "application/json" },
  });
  if (!response.ok) throw new OllamaUsageError(`Ollama device authentication request failed (${response.status})`, response.status);
  return response.json();
}

export async function fetchOllamaDeviceUsage(account: OllamaCloudAccount, key?: KeyObject): Promise<OllamaUsageResponse> {
  const deviceKey = key ?? await readDeviceKey();
  const body = await signedRequest(deviceKey, "POST", "/api/me") as Record<string, unknown> | null;
  const email = body?.email ?? body?.Email;
  const name = body?.name ?? body?.Name;
  // Refuse to attach a different local installation's quota to this backend.
  const matches = account.email ? email === account.email : Boolean(account.name && name === account.name);
  if (!matches) throw new Error("Ollama device key belongs to a different or unverified account. Use the matching daemon key or an Ollama Cloud API key.");
  const usage = await signedRequest(deviceKey, "GET", "/api/usage");
  if (!isOllamaUsageResponse(usage)) throw new Error("Ollama returned an unexpected usage response");
  return usage;
}

export async function fetchSignedInOllamaUsage(baseUrl: string, account: OllamaCloudAccount): Promise<OllamaUsageResponse> {
  try { return await fetchOllamaUsageFrom(baseUrl); } catch (error) {
    if (!(error instanceof OllamaUsageError) || error.status !== 404 || !isLocalOllamaUrl(baseUrl)) throw error;
  }
  return fetchOllamaDeviceUsage(account);
}
