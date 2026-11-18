/** Run production model-result functions; return before/after data to detect mutation. */
import { projectModelData, boundModelData, serializeToolResultForModel } from '../../../packages/gateway/src/tools/model-result.ts';
export async function dispatch(call: any): Promise<any> {
  const before = JSON.stringify(call.value);
  let result: unknown;
  switch (call.op) {
    case 'nativemodelresult.project': result = projectModelData(call.value); break;
    case 'nativemodelresult.bound': result = boundModelData(call.value, call.maxChars); break;
    case 'nativemodelresult.serialize': result = serializeToolResultForModel(call.value); break;
    default: throw new Error('unknown model-result operation');
  }
  return { result, unchanged: before === JSON.stringify(call.value) };
}
