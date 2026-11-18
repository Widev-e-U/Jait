# Native maintenance HTTP adapter review

Scope: `routes/maintenance.ts` only. Three route families retain authenticated
list/detail/run behavior over an explicit async runner port. Production mounting,
shell execution, repository scope and consent remain host responsibilities; the
service implementation is not credited here. The historical route authenticates
users without passing an owner into its backend. This adapter preserves that
contract and has no default mount; a production runner still needs the broader
replacement authorization checks. Notifications and broadcasts are explicit ports.

Real TypeScript server/routes/auth and native gateway HTTP are compared without
response normalization. The reference scripts only runner results and sinks.
Checks cover cookie/bearer/unknown-user rejection, all endpoints, missing records,
query duplication, decimal/radix/infinite/invalid limits and clamping, exact repo
strings, empty/non-string bodies, full returned records, projected broadcasts,
success/warning text/links and optional sinks. Service/broadcast/notification
rejections preserve ordering and prevent later effects. Transport checks include
HEAD, malformed URL/JSON, empty JSON, prototype poisoning, unsupported media,
plain text and the 25 MiB parser ceiling (generated input, not protocol inflation).

Four focused checks plus four protocol checks pass. Five deliberate behavioral
mutations (auth bypass, limit clamp, repository trimming, dropped broadcast,
wrong plan link) are caught and restored byte-exactly; the restored suite passes.
Evidence: `.jait/artifacts/gateway-rust/maintenance-http/`. No original dedicated
maintenance route Vitest target exists. Full source-bound gate controls credit.

Reference SHA256: 703cc68136a1234b6942d64880498010ee13809e010dbeeb06c5bb7ddcdfb835
