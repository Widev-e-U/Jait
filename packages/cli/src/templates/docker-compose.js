export const renderComposeTemplate = (config) => {
    const turnService = config.turnEnabled
        ? `\n  coturn:\n    image: coturn/coturn:4.6\n    restart: unless-stopped\n    ports:\n      - "${config.turnPort}:3478"\n`
        : "";
    return `services:\n  gateway:\n    image: ghcr.io/jait/gateway:latest\n    restart: unless-stopped\n    environment:\n      - PORT=${config.gatewayPort}\n      - WS_PORT=${config.wsPort}\n    ports:\n      - "${config.gatewayPort}:${config.gatewayPort}"\n      - "${config.wsPort}:${config.wsPort}"\n\n  web:\n    image: ghcr.io/jait/web:latest\n    restart: unless-stopped\n    environment:\n      - VITE_API_BASE_URL=http://localhost:${config.gatewayPort}\n    ports:\n      - "${config.webPort}:80"\n${turnService}`;
};
//# sourceMappingURL=docker-compose.js.map