# Remote gateway updates

A paired full gateway running under systemd can opt in to updates from its primary gateway. On the remote machine, set `JAIT_ALLOW_REMOTE_UPDATE=1` in the gateway's systemd environment and restart that service. Its HTTP health endpoint must be enabled; node-only mode is not supported. Configure the appropriate `JAIT_UNIT` when the service is not named `jait-gateway`.

On the primary gateway, grant the paired node the **Update** permission in Settings. Both the node-side opt-in and the primary-side grant are required. To revoke access, remove the grant or remove the environment variable and restart the remote service.

The Network panel can start an update only when the connected node advertises support, the grant is enabled, and npm reports a newer release. Both gateways verify the requested release against npm's current latest version. The remote gateway stages the update and starts the systemd activation controller, which performs the existing health check and rollback. A started update is not yet a confirmed installation: check the node's version after it reconnects. If the connection drops during the request, the outcome is unknown; check the node before retrying.

Older gateways, node-only installations, desktop and mobile clients do not support this remote gateway update path. They must be updated by their own installation method.
