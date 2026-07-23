import { describe, expect, it } from "vitest";
import type { FsNode } from "@jait/shared";

import { resolveRemoteGitNodeId } from "./git-node-routing.js";

const nodes: FsNode[] = [
  {
    id: "windows-one",
    name: "Windows One",
    platform: "windows",
    clientId: "client-one",
    isGateway: false,
    registeredAt: "2026-07-23T00:00:00.000Z",
  },
  {
    id: "windows-two",
    name: "Windows Two",
    platform: "windows",
    clientId: "client-two",
    isGateway: false,
    registeredAt: "2026-07-23T00:00:00.000Z",
  },
];

describe("resolveRemoteGitNodeId", () => {
  it("routes a Windows project to its explicit node instead of the first platform match", () => {
    expect(resolveRemoteGitNodeId(nodes, "C:\\work\\project", "windows-two", false)).toBe("windows-two");
  });

  it("keeps gateway projects local", () => {
    expect(resolveRemoteGitNodeId(nodes, "/home/jakob/jait", "gateway", true)).toBeNull();
  });
});
