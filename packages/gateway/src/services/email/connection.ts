import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { SSRFGuard } from "../../security/ssrf-guard.js";
import type { DiscoveredMailSettings, MailServerConfig } from "@jait/shared";

const host = z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/, "Enter a hostname or IP address");
const server = z.object({
  host, port: z.number().int().min(1).max(65535), secure: z.boolean(),
  user: z.string().trim().min(1).max(320).refine(value => !/[\r\n\0]/.test(value)),
  password: z.string().min(1).max(4096),
}).strict();
export const connectMailboxSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(200).optional(),
  imap: server, smtp: server,
}).strict();
export const emailAccountSettingsSchema = z.object({
  displayName: z.string().trim().max(200).optional(),
  signature: z.string().max(10_000).optional(),
  signatureEnabled: z.boolean().optional(),
}).strict();

const headerValue = z.string().max(10_000).refine(value => !/[\r\n\0]/.test(value), "Mail headers cannot contain line breaks");
export const sendEmailSchema = z.object({
  to: headerValue, subject: headerValue, body: z.string().max(2 * 1024 * 1024),
  cc: headerValue.optional(), bcc: headerValue.optional(),
  replyToMessageId: z.string().min(1).max(2048).refine(value => !/[\r\n\0]/.test(value)).optional(),
  html: z.boolean().optional(), includeSignature: z.boolean().optional(),
}).strict().refine(value => Boolean(value.to.trim() || value.replyToMessageId), "A recipient or reply message is required");

/** Resolve once, reject every private result, and connect to the pinned IP. */
export async function publicMailServer(
  config: MailServerConfig,
  resolveAddresses: (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>> = lookup,
): Promise<MailServerConfig & { servername: string }> {
  const guard = new SSRFGuard();
  guard.validate(`https://${isIP(config.host) === 6 ? '[' + config.host + ']' : config.host}/`);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    resolveAddresses(config.host, { all: true }),
    new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Mail server DNS timed out")), 8000); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  if (!addresses.length) throw new Error("Mail server did not resolve");
  for (const { address } of addresses) guard.validate(`https://${isIP(address) === 6 ? '[' + address + ']' : address}/`);
  return { ...config, host: addresses[0]!.address, servername: config.host };
}

/** Consult only Thunderbird's fixed HTTPS registry, never a supplied URL. */
export async function discoverMailSettings(email: string): Promise<DiscoveredMailSettings> {
  const parsed = z.string().email().max(320).parse(email.trim());
  const domain = domainToASCII(parsed.split("@")[1]!).toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter a public email domain");
  const response = await fetch(`https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`, {
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error("No automatic settings found. Enter your provider's IMAP and SMTP settings.");
  const reader = response.body.getReader();
  let xml = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65_536) throw new Error("Provider settings response is too large");
      xml += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel(); }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid provider settings");
  const data = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(xml)?.clientConfig?.emailProvider;
  const provider = Array.isArray(data) ? data[0] : data;
  const choose = (value: unknown, type: string): Omit<MailServerConfig, "password"> => {
    const options = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
    const option = options.find(item => item && item["@_type"] === type && ["SSL", "STARTTLS"].includes(String(item.socketType)));
    if (!option) throw new Error("This provider does not advertise secure IMAP/SMTP. Enter settings manually.");
    const username = String(option.username || "%EMAILADDRESS%").replace(/%EMAILADDRESS%/g, parsed).replace(/%EMAILLOCALPART%/g, parsed.split("@")[0]!).replace(/%EMAILDOMAIN%/g, domain);
    const valueWithPassword = server.parse({ host: option.hostname, port: Number(option.port), secure: option.socketType === "SSL", user: username, password: "validation-only" });
    const { password: _password, ...result } = valueWithPassword;
    return result;
  };
  return { name: String(provider?.displayName || domain), imap: choose(provider?.incomingServer, "imap"), smtp: choose(provider?.outgoingServer, "smtp") };
}
