# Thread recovery after gateway outages

Threads that were running when the gateway exited automatically continue when it starts again. Both delivery and delegation threads keep their IDs, workspace, provider, model, runtime mode, skills, and saved activity. Recovery starts a fresh provider session and replays recent conversation history, including checkpointed partial assistant output. The continuation asks the agent to inspect workspace state, completed actions, ongoing commands, and existing helper threads before repeating work.

A durable recovery queue waits for unavailable providers or execution nodes. Remote work stays on its original node; any surviving old remote provider session is stopped before a replacement starts. The gateway retries pending starts every 15 seconds. These availability checks do not consume crash recovery attempts.

Stopped, completed, idle, deleted, and ownerless threads are not automatically started. Stopping a queued recovery cancels it. After three consecutive recovery attempts interrupted by gateway failure, the thread displays an error and requires manual continuation. A completed turn or manual restart resets that limit.

Streaming assistant progress is checkpointed at most once per second after the first token. The latest uncheckpointed tokens can be lost during a hard crash. Recovery continues the task from persisted context; it cannot restore an in-flight model request or guarantee exactly-once external side effects.

Migration 70 adds the internal `thread_recovery` queue. It does not change user configuration or saved agent profiles.
