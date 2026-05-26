import { BlockList, isIP } from "node:net";

export interface SSRFGuardOptions {
  allowPrivateHosts?: boolean;
  allowedHosts?: string[];
}

const PRIVATE_IP_BLOCKLIST = new BlockList();
PRIVATE_IP_BLOCKLIST.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.0.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.0.2.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.18.0.0", 15, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("198.51.100.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("203.0.113.0", 24, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE_IP_BLOCKLIST.addSubnet("240.0.0.0", 4, "ipv4");
PRIVATE_IP_BLOCKLIST.addAddress("::", "ipv6");
PRIVATE_IP_BLOCKLIST.addAddress("::1", "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("fe80::", 10, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("ff00::", 8, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("2001:db8::", 32, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:0.0.0.0", 104, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:10.0.0.0", 104, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:127.0.0.0", 104, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:100.64.0.0", 106, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:169.254.0.0", 112, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:172.16.0.0", 108, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:192.0.0.0", 120, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:192.0.2.0", 120, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:192.168.0.0", 112, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:198.18.0.0", 111, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:198.51.100.0", 120, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:203.0.113.0", 120, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:224.0.0.0", 100, "ipv6");
PRIVATE_IP_BLOCKLIST.addSubnet("::ffff:240.0.0.0", 100, "ipv6");

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
