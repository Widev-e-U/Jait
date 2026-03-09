/**
 * Device identification utilities.
 *
 * Generates a persistent device ID per platform (web, capacitor, electron)
 * stored in localStorage. Used to track which device registered a repository.
 */
export declare function detectPlatform(): 'electron' | 'capacitor' | 'web';
export declare function generateDeviceId(): string;
//# sourceMappingURL=device-id.d.ts.map