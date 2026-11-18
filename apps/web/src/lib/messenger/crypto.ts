import type { MatrixClient } from 'matrix-js-sdk'
import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm'
import wasmUrl from 'matrix-crypto-wasm-asset?url'

/** Explicit asset URL survives both Vite dependency optimization and relative production bases. */
export async function initializeCrypto(client: MatrixClient, prefix: string) {
  await initAsync(wasmUrl)
  await client.initRustCrypto({ cryptoDatabasePrefix: prefix })
}
