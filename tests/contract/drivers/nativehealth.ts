/** Reference transport only: execute the existing handler; Rust owns expectations. */
import Fastify from '../../../packages/gateway/node_modules/fastify';
import { registerHealthRoutes } from '../../../packages/gateway/src/routes/health.ts';
import type { AppConfig } from '../../../packages/gateway/src/config.ts';

type Call = { op: string; config?: Partial<AppConfig>; snapshot?: {
  schemaVersion?: number; sessions?: number; surfaces?: number; devices?: number; userCount?: number;
} };
export async function dispatch(call: Call): Promise<unknown> {
  if (call.op !== 'nativehealth.response') throw new Error('unknown health operation');
  const app = Fastify({ logger: false });
  const snapshot = call.snapshot ?? {};
  registerHealthRoutes(app, call.config as AppConfig | undefined, {
    getSchemaVersion: () => snapshot.schemaVersion ?? 0,
    getSessionCount: () => snapshot.sessions ?? 0,
    getSurfaceCount: () => snapshot.surfaces ?? 0,
    getDeviceCount: () => snapshot.devices ?? 0,
    getUserCount: () => snapshot.userCount ?? 0,
  });
  try {
    const response = await app.inject({ url: '/health' });
    return { status: response.statusCode, body: response.json() };
  } finally { await app.close(); }
}
