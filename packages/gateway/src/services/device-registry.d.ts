import type { DeviceInfo } from "@jait/shared";
export interface RegisterDeviceInput {
    id: string;
    name: string;
    platform: DeviceInfo["platform"];
    capabilities: string[];
}
export declare class DeviceRegistry {
    private readonly devices;
    register(input: RegisterDeviceInput): DeviceInfo;
    heartbeat(deviceId: string): DeviceInfo | null;
    list(): DeviceInfo[];
    count(): number;
}
//# sourceMappingURL=device-registry.d.ts.map