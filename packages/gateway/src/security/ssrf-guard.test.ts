import { describe, expect, it } from "vitest";

import { SSRFGuard } from "./ssrf-guard.js";

describe("SSRFGuard", () => {
  it("blocks localhost and private IPv4 targets", () => {
    const guard = new SSRFGuard();

    expect(() => guard.validate("http://0.1.2.3")).toThrow(/Blocked private host: 0.1.2.3/);
    expect(() => guard.validate("http://127.0.0.1:8080")).toThrow(/Blocked private host: 127.0.0.1/);
    expect(() => guard.validate("http://192.168.1.20")).toThrow(/Blocked private host: 192.168.1.20/);
    expect(() => guard.validate("http://LOCALHOST")).toThrow(/Blocked private host: localhost/);
  });

  it("blocks shared, documentation, benchmarking, multicast, and reserved IPv4 targets", () => {
    const guard = new SSRFGuard();

    expect(() => guard.validate("http://100.64.0.1")).toThrow(/Blocked private host: 100.64.0.1/);
    expect(() => guard.validate("http://192.0.2.10")).toThrow(/Blocked private host: 192.0.2.10/);
    expect(() => guard.validate("http://198.18.0.1")).toThrow(/Blocked private host: 198.18.0.1/);
    expect(() => guard.validate("http://198.51.100.10")).toThrow(/Blocked private host: 198.51.100.10/);
    expect(() => guard.validate("http://203.0.113.10")).toThrow(/Blocked private host: 203.0.113.10/);
    expect(() => guard.validate("http://224.0.0.1")).toThrow(/Blocked private host: 224.0.0.1/);
    expect(() => guard.validate("http://240.0.0.1")).toThrow(/Blocked private host: 240.0.0.1/);
  });

  it("blocks IPv6 loopback, unique-local, link-local, and mapped private targets", () => {
    const guard = new SSRFGuard();

    expect(() => guard.validate("http://[::1]/")).toThrow(/Blocked private host: ::1/);
    expect(() => guard.validate("http://[fd00::1]/")).toThrow(/Blocked private host: fd00::1/);
    expect(() => guard.validate("http://[fe80::1]/")).toThrow(/Blocked private host: fe80::1/);
    expect(() => guard.validate("http://[ff02::1]/")).toThrow(/Blocked private host: ff02::1/);
    expect(() => guard.validate("http://[2001:db8::1]/")).toThrow(/Blocked private host: 2001:db8::1/);
    expect(() => guard.validate("http://[::ffff:127.0.0.1]/")).toThrow(/Blocked private host: ::ffff:7f00:1/);
    expect(() => guard.validate("http://[::ffff:100.64.0.1]/")).toThrow(/Blocked private host: ::ffff:6440:1/);
    expect(() => guard.validate("http://[::ffff:192.168.1.20]/")).toThrow(/Blocked private host: ::ffff:c0a8:114/);
  });

  it("allows explicit private hosts only when configured", () => {
    const guard = new SSRFGuard({ allowPrivateHosts: true });

    expect(() => guard.validate("http://[::1]/")).not.toThrow();
    expect(() => guard.validate("http://192.168.1.20")).not.toThrow();
  });

  it("enforces host allowlists after normalization", () => {
    const guard = new SSRFGuard({ allowedHosts: ["EXAMPLE.com"] });

    expect(() => guard.validate("https://example.com/path")).not.toThrow();
    expect(() => guard.validate("https://api.example.com/path")).toThrow(/Host not allowlisted: api.example.com/);
  });
});
