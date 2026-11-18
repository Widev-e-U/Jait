// Production builds bundle this adapter so the SDK resolves the gateway's patched Rust binding.
export {
  MatrixClient,
  SimpleFsStorageProvider,
  RustSdkCryptoStorageProvider,
  EncryptedRoomEvent,
  LogService,
  LogLevel,
} from 'matrix-bot-sdk';
export type { RustSdkCryptoStoreType } from 'matrix-bot-sdk';
