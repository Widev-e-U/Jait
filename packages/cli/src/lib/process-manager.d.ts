import type { JaitConfig, JaitState, ServiceHealth } from "../types.js";
export declare const startServices: (config: JaitConfig) => Promise<JaitState>;
export declare const stopServices: () => Promise<JaitState>;
export declare const serviceStatus: () => Promise<ServiceHealth[]>;
//# sourceMappingURL=process-manager.d.ts.map