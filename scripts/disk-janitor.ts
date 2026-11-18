import { openDatabase } from "../packages/gateway/src/db/index.js";
import {
  DiskJanitor,
  loadDiskJanitorPolicy,
  type DiskJanitorReport,
} from "../packages/gateway/src/services/disk-janitor.js";

// Host entrypoint for reclaiming what jait allocates but never frees.
//
// The in-gateway janitor runs as the gateway's own user. That is enough for
// worktrees and sandbox disks under ~/.jait, but it can never clear scratch
// directories in a shared temp root such as /tmp: the sticky bit reserves those
// for the account that created them, so CI runs (a dedicated `ci-builder` user)
// leave behind debris the gateway is not allowed to touch. Running this from
// root cron — or by hand with sudo — is what actually converges.
//
// Usage:
//   bun scripts/disk-janitor.ts            # report only (default)
//   bun scripts/disk-janitor.ts --apply    # delete
//   sudo bun scripts/disk-janitor.ts --apply
//
// Environment: the JAIT_JANITOR_* / JAIT_DISK_JANITOR_* variables documented in
// loadDiskJanitorPolicy. Run with the same environment as the gateway so it
// resolves the same state directory.

const apply = process.argv.includes("--apply");

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarise(report: DiskJanitorReport): void {
  const mode = report.dryRun ? "DRY RUN (nothing deleted)" : "APPLIED";
  console.log(`[disk-janitor] ${mode}`);
  const MAX_LISTED = 10;
  for (const [label, entries] of [
    ["worktrees", report.worktrees],
    ["sandbox storage", report.sandboxStorage],
    ["temp scratch", report.tempScratch],
  ] as const) {
    if (entries.length === 0) continue;
    console.log(`  ${label}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
    for (const entry of entries.slice(0, MAX_LISTED)) {
      console.log(`    - ${entry.path} (${mb(entry.bytes)}, ${entry.reason})`);
    }
    if (entries.length > MAX_LISTED) {
      console.log(`    ... and ${entries.length - MAX_LISTED} more`);
    }
  }
  console.log(`  reclaimable: ${mb(report.bytesReclaimed)}`);
  if (report.blockedForeignOwned > 0) {
    console.log(
      `  blocked: ${report.blockedForeignOwned} jait-* entr` +
        `${report.blockedForeignOwned === 1 ? "y" : "ies"} in the temp root belong to another user ` +
        "and cannot be removed by this account.",
    );
  }
  if (report.errors.length > 0) {
    console.log(`  failures: ${report.errors.length}`);
    for (const error of report.errors.slice(0, 10)) console.log(`    ! ${error}`);
  }
  if (report.skippedReason) console.log(`  skipped: ${report.skippedReason}`);
}

const { db: _db, sqlite } = await openDatabase();
try {
  const janitor = new DiskJanitor(
    sqlite,
    loadDiskJanitorPolicy(),
    {
      info: (message) => console.log(message),
      warn: (message) => console.warn(message),
      error: (message) => console.error(message),
    },
    undefined,
    undefined,
    (title, body) => console.warn(`${title}: ${body}`),
  );
  const report = apply ? await janitor.run() : await janitor.inspect();
  summarise(report);
  // Non-zero when work is still blocked, so cron/monitoring notices instead of
  // reporting a clean sweep every night.
  process.exitCode = report.errors.length > 0 || report.blockedForeignOwned > 0 ? 1 : 0;
} finally {
  sqlite.close();
}
