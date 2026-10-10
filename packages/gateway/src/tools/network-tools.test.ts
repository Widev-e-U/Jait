import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/network-scan.js", () => ({ scanNetwork: vi.fn() }));
import { scanNetwork } from "../lib/network-scan.js";
import { createNetworkScanTool, getLatestNetworkScan, type NetworkScanData } from "./network-tools.js";
const context = { sessionId: "network-tests", actionId: "network-action", projectRoot: "/project", requestedBy: "test" };
const result: NetworkScanData = {
  subnet: "192.0.2", scannedAt: "2026-10-09T08:00:00Z", durationMs: 25,
  hosts: [{ ip: "192.0.2.1", mac: null, hostname: "owned-fixture", alive: true,
    openPorts: [22], sshReachable: true, agentStatus: "running", osVersion: null, lastSeen: "2026-10-09T08:00:00Z" }],
};
beforeEach(() => { vi.mocked(scanNetwork).mockReset().mockResolvedValue(result); });
describe("network.scan (isolated scanner fixture)", () => {
  it("forwards explicit scan options and caches observations", async () => {
    const response = await createNetworkScanTool().execute({ subnet: "192.0.2", deep: false, includeIps: ["192.0.2.1"] }, context);
    expect(scanNetwork).toHaveBeenCalledWith({ subnet: "192.0.2", deep: false, includeIps: ["192.0.2.1"] });
    expect(response).toMatchObject({ ok: true, data: result });
    expect(response.message).toContain("1 with SSH, 1 running Jait Gateway");
    expect(getLatestNetworkScan()).toEqual(result);
  });
  it("reports engine failure and preserves the previous observations", async () => {
    await createNetworkScanTool().execute({}, context);
    vi.mocked(scanNetwork).mockRejectedValue(new Error("Execution node offline"));
    expect(await createNetworkScanTool().execute({}, context)).toEqual({ ok: false, message: "Execution node offline" });
    expect(getLatestNetworkScan()).toEqual(result);
  });
});
