export class DeviceRegistry {
    devices = new Map();
    register(input) {
        const now = new Date().toISOString();
        const existing = this.devices.get(input.id);
        const next = {
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
    heartbeat(deviceId) {
        const existing = this.devices.get(deviceId);
        if (!existing)
            return null;
        const next = { ...existing, lastSeen: new Date().toISOString() };
        this.devices.set(deviceId, next);
        return next;
    }
    list() {
        return [...this.devices.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    }
    count() {
        return this.devices.size;
    }
}
//# sourceMappingURL=device-registry.js.map