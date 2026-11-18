/** Test-only storage2 reference bridge. Rust owns vectors and expected results. */
export async function dispatch(call: any): Promise<unknown> {
  switch (call.op) {
    default: throw new Error('unknown storage2 operation');
  }
}
