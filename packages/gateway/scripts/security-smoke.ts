// Optional local-fixture validation. Requires Bun, OpenSSL and the three scanner binaries on PATH.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { createServer as createSshFixture } from "node:net";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAssessmentService } from "../src/security/assessment.ts";
import { getSecurityWorkbench } from "../src/security/workbench.ts";
import { runCommand } from "../src/lib/security/engines.ts";
const root = await mkdtemp(join(tmpdir(), "jait-bun-security-"));
const closers: Array<() => Promise<void>> = [];
let fixed = false;
const handler = (_req: IncomingMessage, res: ServerResponse) => {
  if (fixed) res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY"); res.end("fixture body, discarded");
};
async function listen(server: ReturnType<typeof createServer> | ReturnType<typeof createSecureServer> | ReturnType<typeof createSshFixture>) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected fixture port");
  return address.port;
}
try {
  const cert = join(root, "certificate.pem"), key = join(root, "key.pem");
  const generated = await runCommand("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=fixture.example", "-addext", "subjectAltName=DNS:fixture.example,IP:127.0.0.1"], new AbortController().signal, 16384);
  if (generated.exitCode !== 0 || generated.limited) throw new Error("Could not generate disposable certificate");
  const httpPort = await listen(createServer(handler));
  const tlsPort = await listen(createSecureServer({ cert: await readFile(cert), key: await readFile(key) }, handler));
  const sshPort = await listen(createSshFixture(socket => { socket.on("error", () => {}); socket.end("SSH-2.0-FixtureSSH_1.0 private comment discarded\r\n"); }));
  const scope = getAssessmentService().createScope({
    targets: ["127.0.0.1"], exclusions: [], ports: [httpPort, tlsPort, sshPort],
    methods: ["tcp", "tls", "http", "https", "ssh", "host-audit", "nmap", "nuclei", "trivy", "telemetry"],
    paths: ["Dockerfile", "alerts.jsonl"], serverNames: ["fixture.example"], authorized: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, "bun-fixture", root);
  const workbench = getSecurityWorkbench();
  const run = async (input: Parameters<typeof workbench.start>[0]) => workbench.wait(workbench.start(input, "bun-fixture").id, "bun-fixture");
  const input = { scopeId: scope.id, profile: "http" as const, target: "127.0.0.1", port: httpPort };
  const before = await run(input);
  const headerIssue = before.findings.find(f => f.ruleId === "http.nosniff");
  if (before.status !== "completed" || !headerIssue) throw new Error("Bun did not detect fixture header issue");
  fixed = true;
  if ((await workbench.verify(headerIssue.id, "bun-fixture")).status !== "verified-absent") throw new Error("Bun did not verify header fix");
  const tls = await run({ ...input, profile: "tls", port: tlsPort, serverName: "fixture.example" });
  if (tls.status !== "completed" || tls.evidence[0]?.facts.identityMatches !== true || tls.evidence[0]?.facts.trustedByGateway !== false) throw new Error("Bun TLS certificate measurement failed");
  const https = await run({ ...input, profile: "https", port: tlsPort });
  if (https.status !== "completed" || !https.findings.some(f => f.ruleId === "http.hsts")) throw new Error("Bun HTTPS policy check failed");
  const ssh = await run({ ...input, profile: "ssh", port: sshPort });
  if (ssh.status !== "completed" || ssh.evidence[0]?.facts.authenticationAttempted !== false) throw new Error("Bun SSH identification failed");
  const host = await run({ scopeId: scope.id, profile: "host-audit", target: "127.0.0.1" });
  if (host.status !== "completed" || !host.evidence.length) throw new Error("Bun local host inventory failed");
  const native = await getAssessmentService().wait(getAssessmentService().start(scope.id, "bun-fixture").id, "bun-fixture");
  if (native.status !== "completed" || native.observations.some(o => o.state !== "open")) throw new Error("Bun native inventory failed");
  for (const profile of ["nmap", "nuclei"] as const) {
    if (profile === "nuclei") fixed = false;
    const result = await run({ ...input, profile });
    if (result.status !== "completed") throw new Error(profile + " failed on Bun: " + JSON.stringify(result.coverageGaps));
    if (profile === "nuclei") {
      const issue = result.findings.find(f => f.ruleId === "http.nosniff");
      if (!issue) throw new Error("Nuclei did not observe fixture issue");
      fixed = true;
      if ((await workbench.verify(issue.id, "bun-fixture")).status !== "verified-absent") throw new Error("Nuclei verification failed on Bun");
    }
  }
  await writeFile(join(root, "Dockerfile"), 'FROM alpine:3.20\nCMD ["sleep","3600"]\n');
  const config = await run({ scopeId: scope.id, profile: "trivy", path: "Dockerfile" });
  const configIssue = config.findings.find(f => f.ruleId === "trivy.config.AVD-DS-0002");
  if (config.status !== "completed" || !configIssue) throw new Error("Expected nonroot policy finding");
  await writeFile(join(root, "Dockerfile"), 'FROM alpine:3.20\nRUN adduser -D app\nUSER app\nHEALTHCHECK NONE\nCMD ["sleep","3600"]\n');
  if ((await workbench.verify(configIssue.id, "bun-fixture")).status !== "verified-absent") throw new Error("Trivy verification failed on Bun");
  await writeFile(join(root, "alerts.jsonl"), JSON.stringify({ event_type: "alert", dest_ip: "127.0.0.1", alert: { signature_id: 42, signature: "untrusted content discarded" } }));
  const imported = await run({ scopeId: scope.id, profile: "telemetry", source: "suricata", path: "alerts.jsonl" });
  if (imported.status !== "partial" || imported.findings[0]?.status !== "suspected") throw new Error("Telemetry unexpectedly claimed independent verification");
  console.log(JSON.stringify({ runtime: Bun.version, tcp: "passed", tls: "passed", https: "passed", sshIdentification: "passed", localHostAudit: "passed", httpIssueFixVerification: "passed", nmap: "passed", nucleiIssueFixVerification: "passed", trivyIssueFixVerification: "passed", telemetryUnverifiedImport: "passed" }));
} finally {
  await Promise.all(closers.map(close => close()));
  await rm(root, { recursive: true, force: true });
}
