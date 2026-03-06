# Screen Share Status

This file tracks what is implemented vs. scaffolded for screen sharing.

## Implemented Foundation

- Device registration model
- Session state and viewer/controller tracking
- Transport mode representation (`p2p` vs. `turn`)
- Control transfer flow
- Route wiring in gateway

## Currently Stubbed / Placeholder Areas

- Actual screen capture payloads are placeholder values
- End-to-end real-time media transport maturity depends on broader WebRTC integration
- Production-grade recording pipeline remains incomplete

## Immediate Next Milestones

1. Replace placeholder screen capture output with real capture pipeline.
2. Validate end-to-end session on at least one host + one viewer device.
3. Add integration tests for state transitions (start/share/transfer/stop).
4. Add explicit capability flags in API responses when features are stubbed.
