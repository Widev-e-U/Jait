import { BlockList, isIP } from "node:net";

export interface SSRFGuardOptions {
  allowPrivateHosts?: boolean;
  allowedHosts?: string[];
}

const PRIVATE_IP_BLOCKLIST = new BlockList();
PRIVATE_IP_BLOCKLIST.addAddress("0.0.0.0", "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addAddress("::", "ipv6");
PRIVATE_IP_BLOCKLIST.addAddress("::1", "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:0.0.0.0", 128, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:10.0.0.0", 104, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:127.0.0.0", 104, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:169.254.0.0", 112, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:172.16.0.0", 108, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:192.168.0.0", 112, "ipv6");

function normalizeHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

export class SSRFGuard {
  constructor(private readonly options: SSRFGuardOptions = {}) {}

  validate(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error(`Invalid URL: ${rawUrl}`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Blocked protocol: ${parsed.protocol}`);
    }

    const host = normalizeHost(parsed.hostname);
    if (this.options.allowedHosts?.length) {
      const allowed = this.options.allowedHosts.some((candidate) => candidate.toLowerCase() === host);
      if (!allowed) {
        throw new Error(`Host not allowlisted: ${host}`);
      }
    }

    if (!this.options.allowPrivateHosts && this.isPrivateHost(host)) {
      throw new Error(`Blocked private host: ${host}`);
    }

    return parsed;
  }

  private isPrivateHost(host: string): boolean {
    if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;

    const ipVersion = isIP(host);
    if (ipVersion === 4) return PRIVATE_IP_BLOCKLIST.check(host, "ipv4");
    if (ipVersion === 6) return PRIVATE_IP_BLOCKLIST.check(host, "ipv6");
    return false;
  }
}
