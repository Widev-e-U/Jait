# Windows Notepad E2E — live run on user's win32 node

- Date: 2025-11-07, ~13:35 (session `defd8900-640a-4a4e-82b0-6de6567f5cce`, expires 12:56 CET window)
- Target: user's real Windows PC (win32 node), approved control session
- Result: **PASS** — all tool surfaces verified end-to-end on the real desktop

## Steps executed

| # | Step | Tool/action | Result |
|---|------|-------------|--------|
| 1 | Session start (user-approved, visible cursor) | computer_session start | PASS |
| 2 | Full desktop capture | computer_observe | PASS — desktop rendered |
| 3 | Open Run dialog | computer_act key `win+r` | PASS — Run dialog appeared |
| 4 | Type `notepad` | computer_act type | PASS — text visible in Run box |
| 5 | Launch Notepad | computer_act key `enter` | PASS — `Untitled - Notepad` open, focused |
| 6 | Type `hello im jait` in editor | computer_act type | PASS — text rendered in editor |
| 7 | Pointer click in editor area | computer_act click (756, 560) | PASS — caret repositioned, no window loss |
| 8 | Final verification capture | computer_observe | PASS — `hello im jait` visible on screen |

## Toolchain coverage in this run
- shot/capture ✓ (computer_observe)
- move/click ✓ (computer_act click)
- key/combo ✓ (`win+r`, `enter`)
- type ✓ (`notepad`, `hello im jait`)

## Notes
- Prior runs used synthetic/VNC verification (`rfb.py`) and produced `proof_notepad_hello_im_jait.png`; this run confirms the same flow on the physical machine via the live control-session pipeline.
- Flaky/dead earlier issues around `SetPixelFormat`/`SetEncodings` did not surface in the live session path (computer_act/computer_observe). Quarantined synthetic-path items remain untouched.
- Control session left running; auto-expires at timeout or via Ctrl+Alt+Escape on the local machine.