export interface MobileBootstrapResult {
    apiBaseUrl: string;
    wsUrl: string;
    connected: boolean;
    platform: "capacitor-android" | "capacitor-ios" | "browser";
}
/** Detect the Capacitor platform we're running on. */
declare function detectPlatform(): MobileBootstrapResult["platform"];
export declare function bootstrapMobileClient(gatewayUrl: string): Promise<MobileBootstrapResult>;
export { detectPlatform };
//# sourceMappingURL=mobile-bootstrap.d.ts.map