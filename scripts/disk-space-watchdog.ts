import { openDatabase } from "../packages/gateway/src/db/index.js";
import { SchedulerService } from "../packages/gateway/src/scheduler/service.js";
import { DiskSpaceWatchdog } from "../packages/gateway/src/services/disk-space-watchdog.js";

// Host-cron entrypoint for protection before the running gateway is upgraded.
// Use the same state directory/environment as the gateway. Never run migrations
// or launch work from this process.
const { db, sqlite } = await openDatabase();
try {
  const scheduler = new SchedulerService({
    db,
    executeTool: async () => { throw new Error("Watchdog cannot execute tools"); },
  });
  const notify = (title: string, body: string) => console.warn(`${title}: ${body}`);
  await new DiskSpaceWatchdog(scheduler, { warning: notify, error: notify }).check();
} finally {
  sqlite.close();
}
