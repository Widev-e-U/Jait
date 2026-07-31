import type { Surface } from "./contracts.js";

export function shouldSyncProjectSurfaceUi(surface: Surface): boolean {
  if (surface.type !== "filesystem" && surface.type !== "remote-filesystem") return false;
  return typeof surface.snapshot().metadata.panelOpen === "boolean";
}
