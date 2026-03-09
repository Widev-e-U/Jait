import { isIP } from "node:net";
export class SSRFGuard {
    options;
    constructor(options = {}) {
        this.options = options;
    }
    validate(rawUrl) {
        let parsed;
        try {
            parsed = new URL(rawUrl);
        }
        catch {
            throw new Error(`Invalid URL: ${rawUrl}`);
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error(`Blocked protocol: ${parsed.protocol}`);
        }
        const host = parsed.hostname.toLowerCase();
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
    isPrivateHost(host) {
        if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0")
            return true;
        const ipVersion = isIP(host);
        if (ipVersion === 4) {
            const [a = 0, b = 0] = host.split(".").map((v) => Number(v));
            if (a === 10)
                return true;
            if (a === 127)
                return true;
            if (a === 169 && b === 254)
                return true;
            if (a === 172 && b >= 16 && b <= 31)
                return true;
            if (a === 192 && b === 168)
                return true;
            return false;
        }
        if (ipVersion === 6) {
            if (host === "::1")
                return true;
            if (host.startsWith("fc") || host.startsWith("fd"))
                return true;
            if (host.startsWith("fe80"))
                return true;
        }
        return false;
    }
}
//# sourceMappingURL=ssrf-guard.js.map