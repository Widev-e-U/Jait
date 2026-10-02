import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getStateDirectory } from "../state-directory.js";
import type { ScheduledJobRecord, SchedulerService } from "../scheduler/service.js";
import type { NotificationService } from "./notifications.js";

interface DiskSample { blocks: number; bavail: number; files: number; ffree: number }
interface DiskPressure { path: string; usedPercent: number; inodesUsedPercent: number }

export function isAgentJob(job: ScheduledJobRecord): boolean {
  const input = job.input as { action?: string; __jaitJobMeta?: { jobType?: string } } | null;
  const kind = input?.__jaitJobMeta?.jobType;
  return kind === "agent_task" || kind === "agent_thread_job"
    || job.toolName === "agent.spawn"
    || (job.toolName === "thread.control" && input?.action === "create");
}

/** Runs before cron launches, so the watchdog cannot race an agent in the same tick. */
export class DiskSpaceWatchdog {
  private lastAlert = new Map<string, string>();

  constructor(
    private scheduler: Pick<SchedulerService, "list" | "update">,
    private notifications: Pick<NotificationService, "warning" | "error">,
    private readDisk: (path: string) => Promise<DiskSample> = statfs,
    private paths: string[] = [getStateDirectory(), tmpdir()],
  ) {}

  async check(): Promise<void> {
    const agents = this.scheduler.list().filter((job) => job.enabled && isAgentJob(job));
    const paths = [...new Set([...this.paths, ...agents.map((job) => job.projectRoot)])];
    const pressures: DiskPressure[] = [];
    for (const path of paths) {
      try {
        const disk = await this.readDisk(path);
        if (!Number.isFinite(disk.blocks) || disk.blocks <= 0) {
          throw new Error("Filesystem capacity is unavailable");
        }
        const pressure = {
          path,
          usedPercent: 100 * (1 - disk.bavail / disk.blocks),
          inodesUsedPercent: disk.files > 0 ? 100 * (1 - disk.ffree / disk.files) : 0,
        };
        const usage = Math.max(pressure.usedPercent, pressure.inodesUsedPercent);
        const level = usage >= 90 ? "critical" : usage >= 80 ? "warning" : "healthy";
        if (level === "critical") pressures.push(pressure);
        if (level === "healthy") {
          this.lastAlert.delete(path);
        } else if (this.lastAlert.get(path) !== level) {
          const message = `${path}: ${pressure.usedPercent.toFixed(1)}% disk used, ${pressure.inodesUsedPercent.toFixed(1)}% inodes used.`;
          this.notifications[level === "critical" ? "error" : "warning"]("Disk space watchdog", message);
          this.lastAlert.set(path, level);
        }
      } catch (err) {
        // A missing remote project path must not prevent checks of local storage.
        if ((err as NodeJS.ErrnoException).code === "ENOENT" && !this.paths.includes(path)) continue;
        if (this.lastAlert.get(path) !== "unavailable") {
          this.notifications.warning("Disk space check failed", `${path}: ${String(err)}`);
          this.lastAlert.set(path, "unavailable");
        }
      }
    }

    const storageCritical = pressures.some((pressure) => this.paths.includes(pressure.path));
    for (const job of agents) {
      if (!storageCritical && !pressures.some((pressure) => pressure.path === job.projectRoot)) continue;
      const input = job.input as Record<string, unknown> | null;
      const meta = input?.["__jaitJobMeta"] as Record<string, unknown> | undefined;
      this.scheduler.update(job.id, {
        enabled: false,
        input: {
          ...input,
          __jaitJobMeta: { ...meta, diskSpacePausedAt: new Date().toISOString() },
        },
      });
      this.notifications.error(
        "Agent job paused",
        `${job.name} paused because disk or inode usage reached 90%. Free space, then enable it in Jobs.`,
      );
    }
    // Jobs stay paused after recovery; never override a user's disable action.
  }
}
