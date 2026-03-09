export declare const VERSION = "0.1.0";
export declare const DEFAULT_PORT = 8000;
export declare const DEFAULT_WS_PORT = 18789;
export declare const DEFAULT_WEB_PORT = 3000;
export declare const MAX_MESSAGE_LENGTH = 100000;
export declare const MAX_SESSION_NAME_LENGTH = 200;
export declare const CONSENT_TIMEOUT_MS: number;
export declare const ERROR_CODES: {
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly SESSION_NOT_FOUND: "SESSION_NOT_FOUND";
    readonly SESSION_CLOSED: "SESSION_CLOSED";
    readonly ACTION_NOT_FOUND: "ACTION_NOT_FOUND";
    readonly ACTION_ALREADY_EXECUTED: "ACTION_ALREADY_EXECUTED";
    readonly CONSENT_TIMEOUT: "CONSENT_TIMEOUT";
    readonly CONSENT_REJECTED: "CONSENT_REJECTED";
    readonly TOOL_NOT_FOUND: "TOOL_NOT_FOUND";
    readonly TOOL_EXECUTION_FAILED: "TOOL_EXECUTION_FAILED";
    readonly TOOL_PERMISSION_DENIED: "TOOL_PERMISSION_DENIED";
    readonly SURFACE_NOT_FOUND: "SURFACE_NOT_FOUND";
    readonly SURFACE_UNAVAILABLE: "SURFACE_UNAVAILABLE";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly RATE_LIMITED: "RATE_LIMITED";
};
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
//# sourceMappingURL=index.d.ts.map