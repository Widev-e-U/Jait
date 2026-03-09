export interface SSRFGuardOptions {
    allowPrivateHosts?: boolean;
    allowedHosts?: string[];
}
export declare class SSRFGuard {
    private readonly options;
    constructor(options?: SSRFGuardOptions);
    validate(rawUrl: string): URL;
    private isPrivateHost;
}
//# sourceMappingURL=ssrf-guard.d.ts.map