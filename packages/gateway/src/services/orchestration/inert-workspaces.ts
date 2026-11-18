import type { WorkspaceProvider } from "./workspace.js";

/**
 * Workspace double for tests that exercise scheduling, retries, halts or recovery
 * rather than git. Every task gets the same placeholder path, the scope is always
 * clean and nothing is merged. Git behaviour is covered by workspace.test.ts.
 */
export const inertWorkspaces: WorkspaceProvider = {
  assertRunHost() {},
  async prepareRead() {
    return { path: "/inert/workspace", branch: "inert" };
  },
  async prepareWrite() {
    return { path: "/inert/workspace", branch: "inert" };
  },
  async checkScope() {
    return { ok: true, outside: [], changed: [] };
  },
  async integrate() {
    return { integrated: false, head: "inert" };
  },
};
