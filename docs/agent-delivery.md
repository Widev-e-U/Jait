# Saved agents in conversations

The Agents page offers a list and an interactive reporting graph. Each agent shows its configured provider/model; changes can be saved directly from either view. Save failures remain visible. Provider changes also update assigned scheduled tasks. Runtime counts and waiting/running state come from owned gateway runs; unavailable activity is shown as unknown.

In an ordinary chat, choose a saved agent with the recipient picker. The gateway validates ownership and paused state, applies the saved provider, model, instructions, skills and approval setting, and uses the existing chat stream and cancellation path. Queued messages keep the recipient selected when they were sent. Team work sessions keep their assigned member identity.

Assistant messages persist an identity snapshot, so renaming or deleting an agent does not change the author of earlier replies. CLI sessions are replaced when the selected agent or its configuration changes, preventing reuse of another agent's instructions. Restart recovery preserves the selected persona and revalidates its current ownership and availability.

Database migration 71 adds nullable persona attribution to messages. Existing messages remain valid without attribution; migration 70 provides thread restart recovery (see [thread recovery](thread-recovery.md)). No new configuration or model-service dependency is required.

Validation covers owned/foreign/paused selection, CLI identity changes, queue routing, outage continuation, persisted history and real runtime counts. Browser regressions cover provider saves, failure display, graph/list controls, streamed identity, cancellation and restored attribution. The deterministic browser provider stream does not require paid model access; gateway integration tests exercise real provider routing with test providers.
