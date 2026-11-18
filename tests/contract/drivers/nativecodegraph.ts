/** Reference graph algorithms, with only storage/file ports replaced for this lane. */
import { CodeGraphService, parseGraphifyGraph } from '../../../packages/gateway/src/services/code-graph/code-graphs.ts';
export async function dispatch(call: any) {
  const parsed = parseGraphifyGraph(call.graph);
  if (call.op === 'nativecodegraph.parse') return parsed;
  const service = new CodeGraphService({} as any, { dataRoot: '/unused-fixture' });
  service.getIndex = () => call.index ?? { graphVersion: 'v', graphRagStatus: 'not-prepared' };
  (service as any).readParsedGraph = async () => parsed;
  try {
    const params = { projectRoot: '/project', ...call.params };
    if (call.op === 'nativecodegraph.snapshot') return await service.snapshot(params);
    if (call.op === 'nativecodegraph.query') return await service.query(params);
    if (call.op === 'nativecodegraph.path') return await service.shortestPath(params);
    throw Error('Unsupported graph operation');
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
