export const SECURITY_PROFILES = ["tls", "http", "https", "ssh", "host-audit", "nmap", "nuclei", "trivy", "telemetry"] as const;
export type SecurityProfile = typeof SECURITY_PROFILES[number];
export type SecurityMethod = "tcp" | SecurityProfile;
export interface SecurityCheckInput {
  scopeId: string;
  profile: SecurityProfile;
  target?: string;
  port?: number;
  serverName?: string;
  username?: string;
  path?: string;
  source?: "wazuh" | "suricata";
  scheme?: "http" | "https";
  includePackages?: boolean;
}
export interface SecurityEvidence {
  id: string;
  target: string;
  port?: number;
  observedAt: string;
  facts: Record<string, string | number | boolean | null>;
  summary: string;
}
export interface SecurityFinding {
  id: string;
  scopeId: string;
  runId: string;
  ruleId: string;
  target: string;
  port?: number;
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: "high" | "medium" | "low";
  status: "observed" | "suspected";
  disposition: "open" | "accepted-risk" | "false-positive" | "verified-absent";
  evidenceIds: string[];
  firstSeen: string;
  lastSeen: string;
  remediation: string;
  rollback: string;
  decisionBy?: string;
  decisionAt?: string;
  verifiedByRunId?: string;
}
export interface SecurityCheckRun {
  id: string;
  operatorId: string;
  scopeId: string;
  scope: import("./security-assessment.js").SecurityScope;
  input: SecurityCheckInput;
  profileRevision: "security-profiles-v1";
  status: "running" | "completed" | "partial" | "cancelled" | "unavailable" | "interrupted";
  startedAt: string;
  completedAt: string | null;
  engine: string;
  engineVersion: string;
  evidence: SecurityEvidence[];
  findingIds: string[];
  findings: SecurityFinding[];
  coverageGaps: string[];
  artifact?: { id: string; sha256: string; bytes: number; contentType: string };
}
export interface SecurityEngineStatus {
  name: string;
  available: boolean;
  version: string | null;
}
export interface SecurityWorkbenchHistory {
  runs: SecurityCheckRun[];
  findings: SecurityFinding[];
}
export interface SecurityRemediationPlan {
  findingId: string;
  target: string;
  port?: number;
  recommendation: string;
  steps: string[];
  rollback: string[];
  verificationInput: SecurityCheckInput;
  requiresApproval: true;
}
export interface SecurityVerificationResult {
  findingId: string;
  runId: string;
  status: "verified-absent" | "still-observed" | "inconclusive";
  reason: string;
}
export interface SecurityBaselineComparison {
  beforeRunId: string;
  afterRunId: string;
  addedRules: string[];
  noLongerObservedRules: string[];
  comparable: boolean;
  coverageGaps: string[];
}
