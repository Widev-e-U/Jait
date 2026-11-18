export async function dispatch(call: any) {
  const m = await import('../../../packages/gateway/src/services/provider-reset-windows.ts');
  if (call.op === 'nativewindows.windows') return call.values.map((v: any) => {
    try { return m.deriveOllamaResetWindow({...v, now: new Date(v.now)}); }
    catch (error) { return {error: (error as Error).message}; }
  });
  if (call.op === 'nativewindows.sources') return call.values.map((v: any) => {
    const source = m.parseOllamaResetSource(v);
    return {source, description:m.describeOllamaResetSource(source)};
  });
  throw new Error('unknown operation');
}
