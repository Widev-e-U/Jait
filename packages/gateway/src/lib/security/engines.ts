import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SecurityEngineStatus } from "@jait/shared";
import { evidence, rule, type AdapterResult } from "./protocols.js";

export class EngineUnavailable extends Error {}
export interface CommandResult { stdout: string; exitCode: number | null; limited: boolean }
export type CommandRunner = (engine: string, args: string[], signal: AbortSignal, maxBytes?: number) => Promise<CommandResult>;
export const runCommand: CommandRunner = async (engine, args, signal, maxBytes = 512 * 1024) => {
 const directory = await mkdtemp(join(tmpdir(), "jait-engine-"));
 try { return await new Promise<CommandResult>((resolve, reject) => {
  if (signal.aborted) return resolve({ stdout: "", exitCode: null, limited: true });
  const environment: NodeJS.ProcessEnv = { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", HOME: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory };
  if (process.platform === "win32") environment.SystemRoot = process.env.SystemRoot;
  const child = spawn(engine, args, { shell: false, windowsHide: true, cwd: directory, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  const chunks: Buffer[] = []; let bytes = 0; let limited = false; let finished = false;
  const stop = () => { limited = true; child.kill("SIGKILL"); };
  const timer = setTimeout(stop, 45_000);
  signal.addEventListener("abort", stop, { once: true });
  child.stdout.on("data", (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) { stop(); return; }
    chunks.push(chunk);
  });
  // Drain stderr without retaining banners, credentials or private paths.
  let errorBytes = 0;
  const versionOnly = args.length === 1 && ["--version", "-version", "-V"].includes(args[0]!);
  child.stderr.on("data", (chunk: Buffer) => {
    errorBytes += chunk.length;
    if (errorBytes > maxBytes) stop();
    else if (versionOnly) chunks.push(chunk);
  });
  const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", stop); };
  child.once("error", (error: NodeJS.ErrnoException) => {
    if (finished) return; finished = true; cleanup();
    reject(error.code === "ENOENT" ? new EngineUnavailable(engine + " is not installed on the gateway") : new Error(engine + " could not execute"));
  });
  child.once("close", code => {
    if (finished) return; finished = true; cleanup();
    resolve({ stdout: Buffer.concat(chunks).toString("utf8"), exitCode: code, limited });
  });
}); } finally { await rm(directory, { recursive: true, force: true }); }
};

export async function engineVersion(engine: "nmap" | "nuclei" | "trivy", signal: AbortSignal, runner = runCommand): Promise<string> {
  const result = await runner(engine, [engine === "nuclei" ? "-version" : "--version"], signal, 16384);
  if (result.exitCode !== 0 || result.limited) throw new Error("Unable to determine " + engine + " version");
  const match = /(?:Nmap version|Nuclei Engine Version:?|Version:|nuclei(?: version)?)\s*v?([0-9]+\.[0-9]+(?:\.[0-9]+)?[A-Za-z0-9+.-]{0,24})/i.exec(result.stdout);
  if (!match) throw new Error("Unrecognized " + engine + " version output");
  return match[1]!;
}
export async function engineStatus(signal: AbortSignal, runner = runCommand): Promise<SecurityEngineStatus[]> {
  return Promise.all((["nmap", "nuclei", "trivy"] as const).map(async name => {
    try { return { name, available: true, version: await engineVersion(name, signal, runner) }; }
    catch { return { name, available: false, version: null }; }
  }));
}
const array = (value: unknown): Record<string, unknown>[] => value === undefined ? [] : (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
const attributes = (value: unknown) => (value ?? {}) as Record<string, string>;
const cleanLabel = (value: unknown): string => typeof value === "string" ? value.replace(/[^a-zA-Z0-9._+ -]/g, "").slice(0, 80) : "";

export function parseNmap(raw: string, targets: string[], ports: number[], version: string): AdapterResult {
  if (Buffer.byteLength(raw) > 512 * 1024 || /<!ENTITY|<!DOCTYPE[^>]*(?:SYSTEM|PUBLIC|\[)|<script[\s>]/i.test(raw)) throw new Error("Unsupported or oversized Nmap XML");
  const xml = raw.replace(/<!DOCTYPE nmaprun\s*>/i, "");
  if (XMLValidator.validate(xml) !== true) throw new Error("Malformed Nmap XML");
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", processEntities: false, parseTagValue: false }).parse(xml);
  if (!parsed.nmaprun) throw new Error("Missing Nmap run");
  const output: AdapterResult = { engine: "nmap", engineVersion: version, evidence: [], rules: [], coverageGaps: ["Selected TCP ports only; port labels do not identify applications or establish CVEs. No NSE scripts, DNS, UDP, OS or active version detection."], conclusive: true, raw, contentType: "application/xml" };
  const measured = new Set<string>();
  for (const host of array(parsed.nmaprun.host)) {
    const addresses = array(host.address).filter(a => a.addrtype === "ipv4" || a.addrtype === "ipv6");
    if (addresses.length !== 1 || !targets.includes(String(addresses[0]?.addr))) throw new Error("Nmap returned an out-of-scope address");
    const target = String(addresses[0]!.addr);
    for (const observation of array((host.ports as Record<string, unknown> | undefined)?.port)) {
      const port = Number(observation.portid);
      if (observation.protocol !== "tcp" || !ports.includes(port)) throw new Error("Nmap returned an out-of-scope port");
      const key = target + ":" + port;
      if (measured.has(key)) throw new Error("Duplicate Nmap port observation");
      measured.add(key);
      const state = attributes(observation.state).state;
      if (!["open", "closed", "filtered", "unfiltered", "open|filtered", "closed|filtered"].includes(state ?? "")) throw new Error("Invalid Nmap port state");
      const service = attributes(observation.service);
      output.evidence.push(evidence(target, port, "Nmap TCP port observation", { state: state!, commonPortName: cleanLabel(service.name), identificationMethod: service.method === "probed" ? "probed" : "port-table" }));
    }
    const remaining = ports.filter(port => !measured.has(target + ":" + port));
    const aggregates = array((host.ports as Record<string, unknown> | undefined)?.extraports);
    if (aggregates.length === 1 && Number(aggregates[0]!.count) === remaining.length && remaining.length && ["closed", "filtered"].includes(String(aggregates[0]!.state))) {
      for (const port of remaining) {
        measured.add(target + ":" + port);
        output.evidence.push(evidence(target, port, "Nmap complete remaining-port aggregate", {state:String(aggregates[0]!.state), identificationMethod:"complete-aggregate"}));
      }
    }
  }
  if (targets.some(target => ports.some(port => !measured.has(target + ":" + port)))) {
    output.conclusive = false; output.coverageGaps.push("Some authorized target/port pairs lack a deterministic observation");
  }
  const finished = parsed.nmaprun.runstats?.finished;
  if (!finished || finished.exit !== "success") { output.conclusive = false; output.coverageGaps.push("Scanner did not report successful completion"); }
  if (!output.evidence.length) { output.conclusive = false; output.coverageGaps.push("No explicit port observations; empty output is not proof that targets are secure"); }
  return output;
}
export async function scanNmap(targets: string[], ports: number[], signal: AbortSignal, runner = runCommand): Promise<AdapterResult> {
  const version = await engineVersion("nmap", signal, runner);
  const result = await runner("nmap", ["--unprivileged", "-sT", "-Pn", "-n", "--disable-arp-ping", "--max-retries", "1", "--max-rate", "5", "--max-parallelism", "1", "--host-timeout", "15s", "-p", ports.join(","), "-oX", "-", ...targets], signal);
  const output = parseNmap(result.stdout, targets, ports, version);
  if (result.exitCode !== 0 || result.limited) { output.conclusive = false; output.coverageGaps.push("Nmap was stopped or failed; coverage is incomplete"); }
  return output;
}

// Exact reviewed template, single GET /, no redirects, callbacks or extracted values.
export const NUCLEI_TEMPLATE = `id: jait-nosniff-v1
info:
  name: Jait nosniff header observation
  author: jait
  severity: low
http:
  - method: GET
    path:
      - "{{BaseURL}}/"
    redirects: false
    max-redirects: 0
    matchers-condition: and
    matchers:
      - type: status
        status: [200]
      - type: word
        part: header
        words: ["X-Content-Type-Options: nosniff"]
        case-insensitive: true
        negative: true
`;
export const NUCLEI_REVISION = createHash("sha256").update(NUCLEI_TEMPLATE).digest("hex");
export function parseNuclei(raw: string, url: string, version: string): AdapterResult {
  if (Buffer.byteLength(raw) > 512 * 1024) throw new Error("Oversized Nuclei output");
  const targetUrl = new URL(url); const target = targetUrl.hostname; const port = Number(targetUrl.port || (targetUrl.protocol === "https:" ? 443 : 80));
  const output: AdapterResult = { engine: "nuclei", engineVersion: version + "/template-" + NUCLEI_REVISION.slice(0, 16), evidence: [], rules: [], coverageGaps: ["Only Jait's revision-pinned nosniff template was run. No other vulnerability templates, crawling, redirects, callbacks, headless, code or fuzzing modes."], conclusive: false, raw, contentType: "application/x-ndjson" };
  for (const line of raw.split("\n").filter(Boolean)) {
    const item = JSON.parse(line) as Record<string, unknown>;
    if (item["template-id"] !== "jait-nosniff-v1" || ![url, url + "/"].includes(String(item["matched-at"]))) throw new Error("Nuclei result escaped the template or target allowlist");
    const index = output.evidence.length;
    output.evidence.push(evidence(target, port, "Reviewed Nuclei header-policy match", { templateId: "jait-nosniff-v1", templateRevision: NUCLEI_REVISION, nosniffObservedAbsent: true }));
    output.rules.push(rule("http.nosniff", "Response omits X-Content-Type-Options: nosniff", "low", "Configure X-Content-Type-Options: nosniff after validating MIME types.", index));
  }
  output.evidence.unshift(evidence(url, undefined, "Reviewed Nuclei profile revision", { templateId: "jait-nosniff-v1", templateRevision: NUCLEI_REVISION, method: "GET /", matchCount: output.rules.length }));
  output.rules.forEach(observation => observation.evidenceIndex++);
  output.coverageGaps.push("An unmatched template alone cannot establish absence; verification requires the dedicated HTTP check to receive a conclusive response.");
  return output;
}
export async function scanNuclei(url: string, signal: AbortSignal, runner = runCommand): Promise<AdapterResult> {
  const version = await engineVersion("nuclei", signal, runner);
  const directory = await mkdtemp(join(tmpdir(), "jait-nuclei-"));
  try {
    const template = join(directory, "reviewed.yaml"); const config = join(directory, "config.yaml");
    await writeFile(template, NUCLEI_TEMPLATE, { mode: 0o600 }); await writeFile(config, "{}\n", { mode: 0o600 });
    const result = await runner("nuclei", ["-u", url, "-t", template, "-config", config, "-jsonl", "-omit-raw", "-silent", "-no-color", "-no-interactsh", "-disable-redirects", "-disable-update-check", "-no-httpx", "-rate-limit", "1", "-concurrency", "1", "-bulk-size", "1", "-timeout", "3", "-retries", "0"], signal);
    const output = parseNuclei(result.stdout, url, version);
    // Establish response coverage independently; an empty template output may
    // mean a failure, not a passing header. The caller adds a bounded HTTP check.
    if (result.exitCode !== 0 || result.limited) output.coverageGaps.push("Nuclei exited unsuccessfully or exceeded its budget");
    return output;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function parseTrivy(raw: string, target: string, version: string): AdapterResult {
  if (Buffer.byteLength(raw) > 512 * 1024) throw new Error("Oversized Trivy output");
  const parsed = JSON.parse(raw) as { SchemaVersion?: number; Results?: Array<Record<string, unknown>> };
  if (parsed.SchemaVersion !== 2 || !Array.isArray(parsed.Results) || parsed.Results.length > 128) throw new Error("Unsupported Trivy JSON");
  const output: AdapterResult = { engine: "trivy", engineVersion: version, evidence: [], rules: [], coverageGaps: ["Filesystem snapshot only; network exploitability and running software state are not established. Secret scanning is disabled. Database/check updates and remote lookups are disabled."], conclusive: true, raw, contentType: "application/json" };
  let count = 0; let evaluated = false; const passingConfigurationRules = new Set<string>();
  if (parsed.Results.length === 0) { output.conclusive = false; output.coverageGaps.push("No supported files were evaluated; rule absence is inconclusive"); }
  for (const result of parsed.Results) {
    const outcomes = array(result.Misconfigurations);
    for (const item of outcomes) {
      if (!["PASS", "FAIL", "EXCEPTION"].includes(String(item.Status)) || !cleanLabel(item.ID)) throw new Error("Invalid Trivy configuration outcome");
      evaluated = true;
      if (item.Status === "PASS") {
        const rawId = cleanLabel(item.ID); passingConfigurationRules.add(/^DS-\d{4}$/.test(rawId) ? "AVD-" + rawId : rawId);
      }
    }
    if (result.Class === "lang-pkgs" || result.Class === "os-pkgs" || array(result.Vulnerabilities).length) evaluated = true;
    for (const item of array(result.Misconfigurations).filter(i => i.Status === "FAIL")) {
      if (++count > 256) throw new Error("Trivy finding limit exceeded");
      const index = output.evidence.length; const scannerRuleId = cleanLabel(item.ID);
      const id = /^DS-\d{4}$/.test(scannerRuleId) ? "AVD-" + scannerRuleId : scannerRuleId;
      if (!id) throw new Error("Trivy result missing rule ID");
      output.evidence.push(evidence(target, undefined, "Trivy configuration rule failed", { ruleId: id, scannerRuleId, result: "FAIL" }));
      const nonRoot = id === "AVD-DS-0002";
      output.rules.push({ ...rule("trivy.config." + id, nonRoot ? "Container image has no non-root user configured" : "Configuration rule " + id + " failed", normalizeSeverity(item.Severity), nonRoot ? "Create a service-specific unprivileged user and set USER in the Dockerfile. Check file permissions and required capabilities, build and test a new image, and retain the previous image tag for rollback before any deployment." : "Review the scanner's documented rule and prepare a configuration change with a backup.", index), confidence: "medium" });
    }
    for (const item of array(result.Vulnerabilities)) {
      if (++count > 256) throw new Error("Trivy finding limit exceeded");
      const index = output.evidence.length; const id = cleanLabel(item.VulnerabilityID);
      if (!/^CVE-\d{4}-\d{4,}$/.test(id)) continue;
      output.evidence.push(evidence(target, undefined, "Package database vulnerability correlation", { vulnerabilityId: id, package: cleanLabel(item.PkgName), installedVersion: cleanLabel(item.InstalledVersion), fixedVersion: cleanLabel(item.FixedVersion) }));
      output.rules.push({ ...rule("trivy.package." + id + "." + cleanLabel(item.PkgName), "Package correlates with " + id, normalizeSeverity(item.Severity), "Confirm the package is deployed and applicable; update to a reviewed fixed version, then repeat the software scan.", index), status: "suspected", confidence: "medium" });
    }
  }
  if (!evaluated || passingConfigurationRules.size > 256) { output.conclusive = false; output.coverageGaps.push("No bounded recognized check coverage was established; absence is inconclusive"); }
  output.evidence.unshift(evidence(target, undefined, "Trivy snapshot assessment completed", { schemaVersion: 2, resultCount: parsed.Results.length, passingConfigurationRules: [...passingConfigurationRules].slice(0, 256).join(",") }));
  output.rules.forEach(r => r.evidenceIndex++);
  return output;
}
function normalizeSeverity(value: unknown): "info" | "low" | "medium" | "high" | "critical" {
  const severity = String(value).toLowerCase();
  return ["low", "medium", "high", "critical"].includes(severity) ? severity as "low" | "medium" | "high" | "critical" : "info";
}
