import type { JaitConfig, JaitState } from "../types.js";
export declare const ensureJaitHome: () => Promise<void>;
export declare const writeConfig: (config: JaitConfig) => Promise<void>;
export declare const readConfig: () => Promise<JaitConfig | null>;
export declare const writeState: (state: JaitState) => Promise<void>;
export declare const readState: () => Promise<JaitState>;
export declare const resetJaitHome: () => Promise<void>;
export declare const resolveDataDir: (configuredPath: string) => string;
//# sourceMappingURL=storage.d.ts.map