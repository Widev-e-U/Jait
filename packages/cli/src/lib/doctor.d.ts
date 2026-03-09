import type { JaitConfig } from "../types.js";
export interface DoctorCheck {
    name: string;
    healthy: boolean;
    message: string;
}
export declare const runDoctor: (config: JaitConfig) => Promise<DoctorCheck[]>;
//# sourceMappingURL=doctor.d.ts.map