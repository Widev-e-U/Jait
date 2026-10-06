import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tlsConnect, checkServerIdentity } from "node:tls";
import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import type { SecurityEvidence } from "@jait/shared";

export interface RuleObservation {
  ruleId: string; title: string; severity: "info" | "low" | "medium" | "high" | "critical";
  status?: "observed" | "suspected"; confidence?: "high" | "medium" | "low";
  evidenceIndex: number; remediation: string; rollback: string;
}
export interface AdapterResult {
  engine: string; engineVersion: string; evidence: SecurityEvidence[]; rules: RuleObservation[];
  coverageGaps: string[]; conclusive: boolean; raw?: string; contentType?: string;
}
export function evidence(target: string, port: number | undefined, summary: string, facts: SecurityEvidence["facts"]): SecurityEvidence {
  return { id: randomUUID(), target, ...(port === undefined ? {} : { port }), observedAt: new Date().toISOString(), summary, facts };
}
export function rule(ruleId: string, title: string, severity: RuleObservation["severity"], remediation: string, evidenceIndex = 0): RuleObservation {
  return { ruleId, title, severity, remediation, evidenceIndex, rollback: "Preserve the previous configuration and restore it if legitimate access is affected." };
}
const version = () => process.versions.bun ? "bun:" + process.versions.bun : process.version;
function result(engine: string): AdapterResult {
  return { engine, engineVersion: version(), evidence: [], rules: [], coverageGaps: ["Gateway-side observation; WAN exposure and exploitability are not established."], conclusive: false };
}

export function checkTls(target: string, port: number, serverName: string | undefined, signal: AbortSignal): Promise<AdapterResult> {
  return new Promise(resolve => {
    const output = result("node-tls");
    if (signal.aborted) return resolve(output);
    const socket = tlsConnect({ host: target, port, rejectUnauthorized: false, ...(serverName ? { servername: serverName } : {}), minVersion: "TLSv1.2" });
    let done = false;
    const finish = () => {
      if (done) return; done = true; socket.destroy(); signal.removeEventListener("abort", abort); resolve(output);
    };
    const abort = () => { output.coverageGaps.push("TLS check cancelled"); finish(); };
    signal.addEventListener("abort", abort, { once: true });
    socket.setTimeout(3000, () => { output.coverageGaps.push("TLS handshake timed out"); finish(); });
    socket.once("error", () => { output.coverageGaps.push("TLS handshake failed; certificate policy cannot be determined"); finish(); });
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const expires = Date.parse(certificate.valid_to ?? "");
      const begins = Date.parse(certificate.valid_from ?? "");
      const identityError = certificate.raw ? checkServerIdentity(serverName ?? target, certificate) : new Error("No certificate");
      output.conclusive = Boolean(certificate.raw) && Number.isFinite(expires) && Number.isFinite(begins);
      output.evidence.push(evidence(target, port, "TLS certificate and negotiated protocol", {
        negotiatedProtocol: socket.getProtocol(), trustedByGateway: socket.authorized,
        identityMatches: !identityError, validFrom: Number.isFinite(begins) ? new Date(begins).toISOString() : null,
        validTo: Number.isFinite(expires) ? new Date(expires).toISOString() : null,
        fingerprint256: certificate.fingerprint256 ?? null,
        expired: Number.isFinite(expires) && expires <= Date.now(),
        notYetValid: Number.isFinite(begins) && begins > Date.now(),
        expiringSoon: Number.isFinite(expires) && expires > Date.now() && expires - Date.now() < 30 * 86400_000,
      }));
      if (expires <= Date.now()) output.rules.push(rule("tls.expired", "TLS certificate is expired", "high", "Renew the certificate through the service's configured issuer, then reload the service and repeat this TLS check."));
      else if (expires - Date.now() < 30 * 86400_000) output.rules.push(rule("tls.expiring", "TLS certificate expires within 30 days", "low", "Schedule certificate renewal and repeat this check after reloading the service."));
      if (begins > Date.now()) output.rules.push(rule("tls.not-yet-valid", "TLS certificate is not yet valid", "medium", "Check system time and certificate issuance dates."));
      if (!socket.authorized) output.rules.push(rule("tls.gateway-trust", "Certificate chain is not trusted by this gateway", "medium", "Review the certificate chain and intended private CA trust. Install an approved CA on the gateway or serve the correct chain."));
      if (identityError) output.rules.push(rule("tls.identity", "Certificate identity does not match the checked name", "medium", "Check the intended DNS name, certificate SANs and virtual-host configuration; configure the approved TLS server name in the scope."));
      output.coverageGaps.push("Negotiated TLS >=1.2 only; acceptance of older protocols and full cipher coverage were not tested. Trust is relative to this gateway's CA store.");
      finish();
    });
  });
}

export function checkHttp(target: string, port: number, secure: boolean, signal: AbortSignal): Promise<AdapterResult> {
  return new Promise(resolve => {
    const output = result(secure ? "node-https" : "node-http");
    if (signal.aborted) return resolve(output);
    let done = false;
    const factory = secure ? httpsRequest : httpRequest;
    const req = factory({
      hostname: target, port, path: "/", method: "GET", agent: false,
      headers: { "User-Agent": "Jait-Security/1", Accept: "*/*", Connection: "close" },
      maxHeaderSize: 16384,
      ...(secure ? { rejectUnauthorized: false, minVersion: "TLSv1.2" as const } : {}),
    }, response => {
      let bytes = 0;
      const status = response.statusCode ?? 0;
      // Do not retain cookies, bodies, Location URLs, auth headers or banners.
      const hsts = String(response.headers["strict-transport-security"] ?? "");
      const maxAgeMatch = /^max-age\s*=\s*(\d+)(?:\s*;|$)/i.exec(hsts);
      const hstsEnabled = Boolean(maxAgeMatch && Number(maxAgeMatch[1]) > 0);
      const noSniff = response.headers["x-content-type-options"] === "nosniff";
      const framing = Boolean(response.headers["x-frame-options"] || String(response.headers["content-security-policy"] ?? "").includes("frame-ancestors"));
      output.evidence.push(evidence(target, port, "HTTP root response and security-header presence", {
        statusCode: status, transport: secure ? "https" : "http", redirectObserved: status >= 300 && status < 400,
        hstsEnabled, noSniff, framingPolicyPresent: framing, bodyRetained: false,
      }));
      output.conclusive = status >= 200 && status < 300;
      output.coverageGaps.push("Only GET / was requested. Redirects were not followed; response bodies and sensitive headers were discarded. Missing headers are policy observations, not confirmed exploitable vulnerabilities.");
      if (status >= 300 && status < 400) output.coverageGaps.push("Redirect destination and final response were not assessed.");
      if (output.conclusive) {
        if (secure && !hstsEnabled) output.rules.push(rule("http.hsts", "HTTPS response has no active HSTS policy", "low", "Consider an appropriate Strict-Transport-Security policy after confirming HTTPS works for the intended hostname; avoid enabling preload or includeSubDomains without reviewing their scope."));
        if (!noSniff) output.rules.push(rule("http.nosniff", "Response omits X-Content-Type-Options: nosniff", "low", "Configure X-Content-Type-Options: nosniff after validating MIME types."));
        if (!framing) output.rules.push(rule("http.framing", "Response has no framing policy", "info", "Review whether embedding is intended; configure CSP frame-ancestors if embedding should be restricted."));
      }
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 65536) { output.coverageGaps.push("Response body consumption stopped at 64 KiB"); response.destroy(); finish(); }
      });
      response.once("end", finish);
      response.once("error", () => { output.conclusive = false; output.coverageGaps.push("Response stream was incomplete"); finish(); });
    });
    const finish = () => { if (done) return; done = true; req.destroy(); signal.removeEventListener("abort", abort); resolve(output); };
    const abort = () => { output.conclusive = false; output.coverageGaps.push("HTTP check cancelled"); finish(); };
    signal.addEventListener("abort", abort, { once: true });
    req.setTimeout(3000, () => { output.conclusive = false; output.coverageGaps.push("HTTP request timed out"); finish(); });
    req.once("error", () => { output.conclusive = false; output.coverageGaps.push("HTTP request failed"); finish(); });
    req.end();
  });
}

export function checkSsh(target: string, port: number, signal: AbortSignal): Promise<AdapterResult> {
  return new Promise(resolve => {
    const output = result("node-net-ssh-identification");
    if (signal.aborted) return resolve(output);
    const socket = createConnection({ host: target, port });
    let done = false; let buffer = "";
    const finish = () => { if (done) return; done = true; socket.destroy(); signal.removeEventListener("abort", abort); resolve(output); };
    const abort = () => { output.coverageGaps.push("SSH identification cancelled"); finish(); };
    signal.addEventListener("abort", abort, { once: true });
    socket.setTimeout(3000, () => { output.coverageGaps.push("SSH identification timed out"); finish(); });
    socket.once("error", () => { output.coverageGaps.push("SSH connection failed"); finish(); });
    socket.on("data", chunk => {
      buffer += chunk.toString("ascii");
      if (buffer.length > 4096) { output.coverageGaps.push("SSH identification exceeded 4 KiB"); finish(); return; }
      for (const line of buffer.split("\n").slice(0, -1)) {
        const match = /^SSH-(1\.0|1\.5|1\.99|2\.0)-([A-Za-z0-9._-]{1,64})(?:[ \r]|$)/.exec(line);
        if (!match) continue;
        const protocol = match[1]!;
        output.conclusive = true;
        output.evidence.push(evidence(target, port, "SSH identification observed; no authentication attempted", {
          protocol, softwareIdentifier: match[2]!, authenticationAttempted: false,
        }));
        if (protocol !== "2.0") output.rules.push(rule("ssh.legacy-identification", "SSH server advertises a legacy-compatible protocol", "medium", "Review SSH server protocol settings and disable SSHv1 compatibility where supported."));
        output.coverageGaps.push("Identification strings are untrusted self-reports. Cipher negotiation, credentials, configuration and CVEs were not tested.");
        finish(); return;
      }
    });
    socket.once("end", () => { if (!output.conclusive) output.coverageGaps.push("No valid SSH identification received"); finish(); });
  });
}
