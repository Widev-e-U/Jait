import type { DeviceInfo } from "@jait/shared";

export interface RegisterDeviceInput {
  id: string;
  name: string;
  platform: DeviceInfo["platform"];
  capabilities: string[];
}

export class DeviceRegistry {
  private readonly devices = new Map<string, DeviceInfo>();

  register(input: RegisterDeviceInput): DeviceInfo {
    const now = new Date().toISOString();
    const existing = this.devices.get(input.id);
    const next: DeviceInfo = {
      id: input.id,
      name: input.name,
      platform: input.platform,
      capabilities: [...new Set(input.capabilities)],
      connectedAt: existing?.connectedAt ?? now,
      lastSeen: now,
    };
    this.devices.set(input.id, next);
    return next;
  }

  heartbeat(deviceId: string): DeviceInfo | null {
    const existing = this.devices.get(deviceId);
    if (!existing) return null;
    const next: DeviceInfo = { ...existing, lastSeen: new Date().toISOString() };
    this.devices.set(deviceId, next);
    return next;
  }

  list(): DeviceInfo[] {
    return [...this.devices.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  }

  count(): number {
    return this.devices.size;
  }
}
