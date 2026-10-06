import { lstat, readdir, open, mkdtemp, mkdir, writeFile, rm, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { join, relative, dirname } from "node:path";
import { tmpdir, homedir, platform, release, networkInterfaces } from "node:os";
import { PathGuard } from "../../security/path-guard.js";
import { evidence, rule, type AdapterResult } from "./protocols.js";
import { runCommand, engineVersion, parseTrivy, EngineUnavailable, type CommandRunner } from "./engines.js";

export async function guardedRealPath(projectRoot: string, path: string): Promise<string> {
  const guard = new PathGuard({ projectRoot });
  const selected = guard.validate(path);
  const root = await realpath(projectRoot);
  const actual = await realpath(selected);
  new PathGuard({ projectRoot: root }).validate(actual);
  if (relative(root, actual).split(/[\\/]/).some(part => part.startsWith(".env") || SKIPPED_DIRECTORIES.has(part))) throw new Error("Credential and internal cache paths are excluded from assessment");
  return selected;
}
export async function validateSnapshotDescriptor(projectRoot: string, fd: number): Promise<void> {
  if (platform() !== "linux") throw new EngineUnavailable("Filesystem assessment currently requires Linux descriptor-path validation");
  const actual = await realpath("/proc/self/fd/" + fd);
  await guardedRealPath(projectRoot, actual);
}
const MAX_BYTES = 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set([".git", ".jait", "node_modules", "vendor", ".ssh", ".gnupg", ".aws"]);
export async function createSnapshot(projectRoot: string, path: string, signal: AbortSignal): Promise<{ root: string; cleanup: () => Promise<void>; files: number }> {
  if (platform() !== "linux") throw new EngineUnavailable("Filesystem assessment currently requires Linux descriptor-path validation");
  const canonicalRoot = await realpath(projectRoot);
  const selected = await guardedRealPath(canonicalRoot, path);
  const destination = await mkdtemp(join(tmpdir(), "jait-security-snapshot-"));
  let bytes = 0; let files = 0; let entriesVisited = 0;
  const walk = async (source: string, depth = 0) => {
    if (++entriesVisited > 4096 || depth > 32) throw new Error("Snapshot traversal limit exceeded");
    if (signal.aborted) throw new Error("Snapshot cancelled");
    const name = source.split(/[\\/]/).pop() ?? "";
    if (name.startsWith(".env") || SKIPPED_DIRECTORIES.has(name)) return;
    await guardedRealPath(canonicalRoot, source);
    const stat = await lstat(source);
    if (stat.isSymbolicLink()) throw new Error("Symbolic links are not allowed in software snapshots");
    if (stat.isDirectory()) {
      const entries = await readdir(source);
      if (entries.length > 2048) throw new Error("Snapshot directory limit exceeded");
      for (const entry of entries) await walk(join(source, entry), depth + 1);
      return;
    }
    if (!stat.isFile()) throw new Error("Only regular files can be assessed");
    if (++files > 128 || stat.size > MAX_BYTES || (bytes += stat.size) > MAX_BYTES) throw new Error("Snapshot exceeds 128 files or 1 MiB");
    // O_NOFOLLOW also protects the final component against a symlink swap.
    const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      // Validate the opened inode, even if an ancestor changed between realpath and open.
      await validateSnapshotDescriptor(canonicalRoot, handle.fd);
      const actual = await handle.stat();
      if (!actual.isFile() || actual.dev !== stat.dev || actual.ino !== stat.ino || actual.size > MAX_BYTES) throw new Error("Snapshot source changed");
      const buffer = Buffer.alloc(Math.min(actual.size + 1, MAX_BYTES + 1));
      const result = await handle.read(buffer, 0, buffer.length, 0);
      if (result.bytesRead > stat.size || result.bytesRead > MAX_BYTES) throw new Error("Snapshot source grew during capture");
      const suffix = stat.isFile() && source === selected ? name : relative(selected, source);
      const target = join(destination, suffix);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, buffer.subarray(0, result.bytesRead), { mode: 0o600 });
    } finally { await handle.close(); }
  };
  try {
    await walk(selected);
    return { root: destination, files, cleanup: () => rm(destination, { recursive: true, force: true }) };
  } catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
}
export async function scanSoftware(projectRoot: string, path: string, signal: AbortSignal, runner = runCommand, includePackages = false, databaseCache = join(homedir(), ".cache", "trivy")): Promise<AdapterResult> {
  let version = await engineVersion("trivy", signal, runner);
  if (includePackages) {
    let metadata: string;
    try {
      const metadataPath = join(databaseCache, "db", "metadata.json");
      const info = await lstat(metadataPath);
      if (!info.isFile() || info.size > 16384) throw new Error("Invalid cache metadata");
      metadata = await readFile(metadataPath, "utf8");
      const parsed = JSON.parse(metadata) as {Version?: number};
      if (parsed.Version !== 2) throw new Error("Unsupported vulnerability database");
    } catch { throw new EngineUnavailable("A prepared local Trivy vulnerability database is required; no database was downloaded"); }
    version += "/db-" + createHash("sha256").update(metadata).digest("hex").slice(0, 16);
  }
  const snapshot = await createSnapshot(projectRoot, path, signal);
  try {
    const config = join(snapshot.root, ".jait-trivy-config.yaml");
    await writeFile(config, "{}\n", { mode: 0o600 });
    const cache = includePackages ? databaseCache : await mkdtemp(join(tmpdir(), "jait-trivy-cache-"));
    try {
      const result = await runner("trivy", ["filesystem", "--config", config, "--cache-dir", cache, "--format", "json", "--quiet", "--scanners", includePackages ? "vuln,misconfig" : "misconfig", "--skip-db-update", "--skip-java-db-update", "--skip-vex-repo-update", "--misconfig-scanners", "dockerfile,kubernetes", "--include-non-failures", "--skip-version-check", "--skip-check-update", "--offline-scan", "--timeout", "30s", "--no-progress", snapshot.root], signal);
      const output = parseTrivy(result.stdout, path, version);
      output.evidence[0]!.facts.snapshotFiles = snapshot.files;
      if (snapshot.files === 0) output.conclusive = false;
      output.coverageGaps.push(includePackages ? "Prepared local package database only. Database metadata revision is recorded in the engine version; correlations remain suspected and do not establish remote exploitability." : "Only built-in Dockerfile/Kubernetes configuration checks ran. Package CVE scanning requires the explicit cached-database option. No vulnerability database was downloaded.");
      output.coverageGaps.push("Credential directories and .env files were excluded. Terraform/Helm and remote module loading are outside this profile.");
      if (result.exitCode !== 0 || result.limited) { output.conclusive = false; output.coverageGaps.push("Trivy did not complete successfully"); }
      return output;
    } finally { if (!includePackages) await rm(cache, { recursive: true, force: true }); }
  } finally { await snapshot.cleanup(); }
}

export function isGatewayAddress(target: string): boolean {
  return target === "127.0.0.1" || target === "::1" || Object.values(networkInterfaces()).flat().some(address => address?.address === target);
}
export async function auditHost(target: string, port: number, username: string | undefined, signal: AbortSignal, runner: CommandRunner = runCommand): Promise<AdapterResult> {
  const output: AdapterResult = { engine: username ? "openssh-readonly-audit" : "gateway-readonly-audit", engineVersion: process.version, evidence: [], rules: [], coverageGaps: ["Read-only inventory; effective firewall rules, full package inventory, include/Match resolution and WAN reachability are not established."], conclusive: false };
  if (username) {
    const version = await runner("ssh", ["-V"], signal, 8192);
    const clientVersion = /OpenSSH_([A-Za-z0-9.+-]{1,32})/.exec(version.stdout)?.[1];
    if (!clientVersion || version.exitCode !== 0 || version.limited) throw new Error("SSH client version is unavailable");
    output.engineVersion = "openssh:" + clientVersion;
    const command = "LC_ALL=C; printf 'OS='; uname -s; printf 'RELEASE='; uname -r; printf 'UID='; id -u; printf 'SSH_POLICY_BEGIN\\n'; if [ -r /etc/ssh/sshd_config ]; then awk '/^[[:space:]]*(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication)[[:space:]]/ {print $1, $2}' /etc/ssh/sshd_config; fi; printf 'SSH_POLICY_END\\n'";
    const response = await runner("ssh", ["-F", "/dev/null", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ProxyCommand=none", "-o", "ProxyJump=none", "-o", "PermitLocalCommand=no", "-o", "ClearAllForwardings=yes", "-o", "ConnectTimeout=5", "-p", String(port), username + "@" + target, command], signal, 32768);
    if (response.exitCode !== 0 || response.limited) { output.coverageGaps.push("Authenticated audit failed; trusted SSH host keys and an existing authorized key are required."); return output; }
    const os = /^OS=([A-Za-z0-9._ -]{1,80})$/m.exec(response.stdout)?.[1] ?? null;
    const osRelease = /^RELEASE=([A-Za-z0-9._+-]{1,80})$/m.exec(response.stdout)?.[1] ?? null;
    output.conclusive = Boolean(os);
    output.evidence.push(evidence(target, port, "Authenticated host inventory", { os, release: osRelease, privileged: /^UID=0$/m.test(response.stdout) }));
    const policy = /SSH_POLICY_BEGIN\n([\s\S]*?)SSH_POLICY_END/.exec(response.stdout)?.[1] ?? "";
    addSshPolicy(output, target, port, policy);
    return output;
  }
  if (!isGatewayAddress(target)) throw new Error("Local audit target must be an address of this gateway");
  output.evidence.push(evidence(target, undefined, "Gateway operating-system inventory", { os: platform(), release: release() }));
  output.conclusive = true;
  if (platform() === "linux") {
    try { addSshPolicy(output, target, undefined, await readFile("/etc/ssh/sshd_config", "utf8")); }
    catch { output.coverageGaps.push("SSH configuration was unavailable to the gateway user"); }
  } else output.coverageGaps.push("SSH configuration audit currently supports Linux only");
  return output;
}
function addSshPolicy(output: AdapterResult, target: string, port: number | undefined, config: string) {
  if (Buffer.byteLength(config) > 32768) { output.coverageGaps.push("SSH configuration exceeded the audit limit"); return; }
  const root = /^\s*PermitRootLogin\s+(yes|no|prohibit-password|without-password|forced-commands-only)\s*(?:#.*)?$/im.exec(config)?.[1]?.toLowerCase();
  const password = /^\s*PasswordAuthentication\s+(yes|no)\s*(?:#.*)?$/im.exec(config)?.[1]?.toLowerCase();
  const index = output.evidence.length;
  output.evidence.push(evidence(target, port, "SSH file directives (effective settings may differ)", { permitRootLoginDirective: root ?? null, passwordAuthenticationDirective: password ?? null, effectivePolicyConfirmed: false }));
  if (root === "yes") output.rules.push({ ...rule("host.ssh-root-login", "SSH configuration file permits root login", "medium", "Review effective sshd settings and access requirements; prepare PermitRootLogin prohibit-password or no, validate with sshd -t and preserve an existing session.", index), status: "suspected", confidence: "medium" });
  if (password === "yes") output.rules.push({ ...rule("host.ssh-password", "SSH configuration file enables password authentication", "low", "Review whether key-only authentication is appropriate. Verify key access before disabling password authentication; keep an existing session and a configuration backup.", index), status: "suspected", confidence: "medium" });
  if (!root || !password) output.coverageGaps.push("Missing directives are unknown; defaults and included configuration were not inferred");
}

export function parseTelemetry(raw: string, source: "wazuh" | "suricata", allowedTargets: string[]): AdapterResult {
  if (Buffer.byteLength(raw) > 65536) throw new Error("Telemetry import exceeds 64 KiB");
  const output: AdapterResult = { engine: source + "-import", engineVersion: "reported-version-unknown", evidence: [], rules: [], coverageGaps: ["Imported alerts are unverified reports from the source sensor. Sensor version and original vantage point must be reviewed separately."], conclusive: false, contentType: "application/x-ndjson" };
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length > 100) throw new Error("Telemetry import exceeds 100 events");
  let skipped = 0;
  for (const line of lines) {
    const event = JSON.parse(line) as Record<string, unknown>;
    const nested = (key: string) => (event[key] ?? {}) as Record<string, unknown>;
    const address = source === "wazuh" ? String(nested("agent").ip ?? "") : [event.dest_ip, event.src_ip].map(String).find(ip => allowedTargets.includes(ip)) ?? "";
    if (!allowedTargets.includes(address) || (source === "suricata" && event.event_type !== "alert")) { skipped++; continue; }
    const id = source === "wazuh" ? String(nested("rule").id ?? "") : String(nested("alert").signature_id ?? "");
    if (!/^[0-9]{1,12}$/.test(id)) throw new Error("Telemetry alert is missing a bounded numeric rule ID");
    const index = output.evidence.length;
    output.evidence.push(evidence(address, undefined, "Imported " + source + " alert", { source, sourceRuleId: id, imported: true, independentlyVerified: false }));
    output.rules.push({ ...rule(source + "." + id, "Imported " + source + " alert " + id, "info", "Review the original sensor evidence and reproduce the relevant condition with an authorized independent check.", index), status: "suspected", confidence: "low" });
  }
  if (skipped) output.coverageGaps.push(skipped + " out-of-scope or unsupported events were skipped");
  return output;
}
