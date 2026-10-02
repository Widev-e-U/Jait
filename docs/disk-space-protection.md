# Disk space protection

The scheduler checks gateway state storage, temporary storage, and enabled agent
jobs' project roots before each cron tick (every 30 seconds). It warns through
Jait notifications when disk or inode usage reaches 80%, and persistently disables
affected agent jobs at 90%. System jobs continue to run. Job prompts, models, and
schedules are preserved; the job metadata records `diskSpacePausedAt`.

Free space and manually enable paused jobs in Jobs. Recovery never automatically
enables jobs. Failed storage checks produce a warning; missing remote project
directories are skipped. This protects scheduled launches, not already running
agents or manually launched threads.

## Host cron before gateway upgrade

`bun scripts/disk-space-watchdog.ts` performs one check using the same database
and policy, without migrations or launching agents. It prints alerts for cron to
forward to syslog. Run it as the gateway user with the same state-directory
environment. For example, using absolute paths for this host:

```cron
* * * * * cd /home/jakob/jait && /home/jakob/.npm-global/bin/bun scripts/disk-space-watchdog.ts 2>&1 | /usr/bin/logger -t jait-disk-watchdog
```

This cron keeps checking while the old gateway is running. After upgrading,
the scheduler's pre-launch check also prevents an agent from launching in the
same tick as the check. A separate host cron can only pause future launches;
already running agents continue.

## Journal limits (Linux hosts)

Run `sudo bash scripts/install-journal-limits.sh` from the repository root.
This installs `ops/journald/60-jait-disk-limits.conf` as a systemd drop-in and
restarts journald. An existing different drop-in is backed up before replacement.

The policy sets a 30-second rate-limit interval, a burst of 1,000 messages,
a 2 GiB persistent journal cap, 5 GiB reserved free space, a 256 MiB runtime
journal cap, and two weeks of retention. systemd scales the effective burst by
available space. These limits apply to journal storage; syslog files and other
applications still need their own rotation policies.

Verify with `systemd-analyze cat-config systemd/journald.conf` and
`systemctl is-active systemd-journald`. To undo, remove the installed drop-in
(or restore its backup) and restart journald.
