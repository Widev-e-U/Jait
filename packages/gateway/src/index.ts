import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { WsControlPlane } from "./ws.js";

async function main() {
  const config = loadConfig();
  const server = await createServer(config);
  const ws = new WsControlPlane(config);

  ws.start();

  await server.listen({ port: config.port, host: config.host });
  console.log(`Jait Gateway listening on http://${config.host}:${config.port}`);

  const shutdown = async () => {
    console.log("Shutting down...");
    ws.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
