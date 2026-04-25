import { describe, expect, it } from "vitest";

import { SSRFGuard } from "./ssrf-guard.js";

describe("SSRFGuard", () => {
  it("blocks localhost and private IPv4 targets", () => {
    const guard = new SSRFGuard();

    expect(() => guard.validate("http://127.0.0.1:8080")).toThrow(/Blocked private host: 127.0.0.1/);
    expect(() => guard.validate("http://192.168.1.20")).toThrow(/Blocked private host: 192.168.1.20/);
    expect(() => guard.validate("http://LOCALHOST")).toThrow(/Blocked private host: localhost/);
  });

  it("blocks IPv6 loopback, unique-local, link-local, and mapped private targets", () => {
    const guard = new SSRFGuard();

    expect(() => guard.validate("http://[::1]/")).toThrow(/Blocked private host: ::1/);
    expect(() => guard.validate("http://[fd00::1]/")).toThrow(/Blocked private host: fd00::1/);
    expect(() => guard.validate("http://[fe80::1]/")).toThrow(/Blocked private host: fe80::1/);
    expect(() => guard.validate("http://[::ffff:127.0.0.1]/")).toThrow(/Blocked private host: ::ffff:7f00:1/);
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
