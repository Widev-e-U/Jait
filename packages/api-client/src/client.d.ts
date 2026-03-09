import type { GatewayStatus, ChatMessage, WsEvent, WsEventType } from "@jait/shared";
export interface JaitClientConfig {
    baseUrl: string;
    wsUrl: string;
    token?: string;
}
export declare class JaitClient {
    private config;
    private ws;
    private eventHandlers;
    constructor(config: JaitClientConfig);
    /** Update the auth token (e.g. after login or refresh) */
    setToken(token: string | undefined): void;
    private get headers();
    health(): Promise<GatewayStatus>;
    getMessages(sessionId: string): Promise<{
        messages: ChatMessage[];
    }>;
    sendMessage(sessionId: string, content: string, onDelta: (delta: string) => void, onDone: () => void): Promise<void>;
    connect(sessionId: string, deviceId: string): void;
    on(type: WsEventType | "*", handler: (event: WsEvent) => void): () => void;
    disconnect(): void;
}
//# sourceMappingURL=client.d.ts.map