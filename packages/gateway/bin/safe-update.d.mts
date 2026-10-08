export interface UpdatePlan {
  live: string;
  lock: string;
  stage: string;
  candidate: string;
  newVersion: string;
  previousVersion: string;
  backup: string;
}
type Runner = (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>;
export function prepareUpdate(options?: { live?: string; version?: string; runCommand?: Runner }): Promise<UpdatePlan>;
export function validatePackage(root: string, runCommand?: Runner): Promise<string>;
export function waitForVersion(port: number, version: string, timeoutMs?: number): Promise<void>;
export function activateUpdate(plan: UpdatePlan, options?: {
  restart?: () => Promise<unknown>;
  stop?: () => Promise<unknown>;
  health?: (port: number, version: string) => Promise<void>;
  port?: number;
}): Promise<void>;
export function activateSystemdUpdate(plan: UpdatePlan, unit: string, port: number): Promise<void>;
export function discardUpdate(plan: UpdatePlan): Promise<void>;
export function launchSystemdUpdate(plan: UpdatePlan, unit: string, port: number): Promise<void>;
