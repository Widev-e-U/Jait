// Explicit-IP TCP baseline, revision 1. No DNS, redirects or application requests.
export interface SecurityScopeInput {
  targets: string[];
  exclusions: string[];
  ports: number[];
  expiresAt: string;
  authorized: boolean;
  methods?: import("./security-workbench.js").SecurityMethod[];
  paths?: string[];
  serverNames?: string[];
  sshUsernames?: string[];
}
export interface SecurityScope extends SecurityScopeInput {
  id: string;
  operatorId: string;
  createdAt: string;
  nodeId: "gateway";
  vantagePoint: string;
  profile: "tcp-connect-v1";
  projectRoot?: string;
}
export type SecurityProbeState = "open" | "refused" | "timeout" | "error";
export interface SecurityObservation {
  evidenceId: string;
  target: string;
  port: number;
  state: SecurityProbeState;
  observedAt: string;
}
export interface SecurityAssessmentRun {
  id: string;
  scopeId: string;
  operatorId: string;
  scope: SecurityScope;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "cancelled" | "partial" | "interrupted";
  engine: "node-net-tcp-connect";
  engineVersion: string;
  observations: SecurityObservation[];
  plannedChecks: number;
  coverageGaps: string[];
}
export interface SecurityAssessmentHistory {
  scopes: SecurityScope[];
  runs: SecurityAssessmentRun[];
}
