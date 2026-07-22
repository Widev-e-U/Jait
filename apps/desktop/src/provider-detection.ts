export type DesktopRemoteProviderId = "codex" | "claude-code";

export function isSupportedDesktopProviderId(providerId: string): providerId is DesktopRemoteProviderId {
  return providerId === "codex" || providerId === "claude-code";
}

export interface DesktopProviderStatus {
  id: string;
  installed: boolean;
  authenticated: boolean | null;
  detail?: string;
}

interface DesktopProviderProbe {
  id: string;
  binary: string;
  authArgs: string[];
}

const PROVIDER_PROBES: DesktopProviderProbe[] = [
  { id: "codex", binary: "codex", authArgs: ["login", "status"] },
  { id: "claude-code", binary: "claude", authArgs: ["auth", "status"] },
];

export function detectDesktopProviders(
  isInstalled: (binary: string) => boolean,
  isAuthenticated: (binary: string, args: string[]) => boolean,
): DesktopProviderStatus[] {
  return PROVIDER_PROBES.flatMap((provider) => {
    if (!isInstalled(provider.binary)) return [];
    const authenticated = isAuthenticated(provider.binary, provider.authArgs);
    return [{
      id: provider.id,
      installed: true,
      authenticated,
      detail: authenticated ? "Authenticated on this device" : "Login required on this device",
    }];
  });
}
