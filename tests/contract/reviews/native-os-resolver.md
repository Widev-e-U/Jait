# Native OS sandbox resolver review

Scope: `os-control/resolver.ts`. Native sandbox selection, connection presentation
and factory dispatch operate over explicit manager and driver-factory ports.
No Docker listing, SSH connection, desktop input or driver execution is credited.
Native driver contracts enforce the factory's result type. Driver execution in
contract fixtures explicitly rejects all calls. The resolver grants no authority.

The reference driver evaluates the actual resolver source, replacing only its
two concrete desktop constructor imports with trace fixtures. Exact import counts
fail closed on seam changes. The manager is scripted in both implementations.
Rust owns all selection, list, credential and failure cases. Comparisons cover
source list order, newest-running default, duplicate names, first matching stopped
entries, repeated fresh manager calls and new driver construction, trimmed lookup
with untrimmed error names, empty/Unicode whitespace names, no matches/no running
sandboxes, port defaults/nullish/zero/custom/negative/fractional ports, default and
empty SSH usernames, optional fake passwords, manager throws and constructor
rejections. Error messages, binding type, factory arguments and manager identity
are exact. No response fields are normalized. Inputs use declared sandbox/driver
types; arbitrary malformed JavaScript values and real platform engines remain
separate concerns.

Three focused checks plus four protocol checks pass, as do all four original
Vitest resolver tests. Four mutations (oldest target, stopped target admission,
wrong VNC default, treating empty username as absent) were caught by failed
behavioral assertions, restored byte-exactly and the restored target passed.
Evidence: `.jait/artifacts/gateway-rust/os-resolver/`. Full gate controls credit.

Reference SHA256: 9a9f2f99e36caa217714e813fbec852e5d06a074cc73e518ab78f19b7d6b2d69
