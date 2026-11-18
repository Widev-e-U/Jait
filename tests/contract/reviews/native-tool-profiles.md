# Native security profile review

Reference: `security/tool-profiles.ts`. Native: `security/tool_profiles.rs` plus
embedded `tool-profile-assets.json`. Regenerate reviewed data using
`tooling/extract-tool-profile-assets.mjs` with Bun; the native runtime uses no JS.

All four exports are implemented: list, get, extend and serialize. Every built-in
permission, description, risk, consent level and deny pattern is compared directly
with the actual TypeScript module. Ordered maps preserve existing override positions
and last-override-wins behavior. Map structure is independent, permission values are
shared. Mutating a shared permission is visible in later maps and retained serialized
values; changing toolName affects newly created map keys, not existing keys.
Overrides retain their input identity. Each registry owns its catalogue; free-function
exports use one static registry matching the source module's lifetime.

Nine host checks pass (five component checks plus four bounded bridge guards).
The driver creates an isolated import of the unchanged source, then exercises real
operations and mutations. Unknown/prototype/case-varied names all throw. Mutations
that disable terminal consent in the embedded catalogue or clone values instead
of sharing them both fail assertions and are restored. Evidence: `profile-mutations/`
and `policy-history-restored.log`. Strict native Clippy passes. Full gate controls
credit; this adds no second credit for the permission engine.

Shared native values use explicit synchronization. Data must satisfy ToolPermission;
arbitrary non-typed JS values/prototypes are outside that DTO boundary. Profiles do
not authorize targets or execution by themselves. Production policy selection and
UI remain unchanged. No database/schema/deployment change.

The first combined gate caught a reference-driver filename collision with the
existing assistant-profile adapter: all five assistant-profile component tests
failed with unknown profile operations. The security driver now has the distinct
name `nativetoolprofiles.ts`; `nativeprofiles.ts` again drives assistant profiles.
The unchanged existing assertions and new security-profile assertions both pass
(9/9 checks each), recorded in `profile-driver-restored.log`. The original full-gate
failure remains in `continuation-153-reviewed-inventory.log` and profile-collision.before.log.
