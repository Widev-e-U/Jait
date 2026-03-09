/**
 * OS Tools — Sprint 3.6
 *
 * os.query  — system info, processes, disk usage
 * os.install — winget/apt/brew wrapper
 */
import { platform, hostname, arch, cpus, totalmem, freemem, uptime, release, type as osType } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
export function createOsQueryTool() {
    return {
        name: "os.query",
        description: "Query system information: info, processes, disk usage, or environment",
        tier: "core",
        category: "os",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "What to query", enum: ["info", "processes", "disk", "env"] },
            },
            required: ["query"],
        },
        async execute(input, _context) {
            switch (input.query) {
                case "info": {
                    const data = {
                        platform: platform(),
                        type: osType(),
                        release: release(),
                        hostname: hostname(),
                        arch: arch(),
                        cpus: cpus().length,
                        cpuModel: cpus()[0]?.model ?? "unknown",
                        totalMemoryGB: +(totalmem() / 1073741824).toFixed(1),
                        freeMemoryGB: +(freemem() / 1073741824).toFixed(1),
                        uptimeHours: +(uptime() / 3600).toFixed(1),
                        cwd: process.cwd(),
                        nodeVersion: process.version,
                        pid: process.pid,
                    };
                    // Gather extra info in parallel (best-effort, don't fail the whole call)
                    const extras = await Promise.allSettled([
                        // Bun version
                        execAsync("bun --version", { timeout: 5000 }).then(r => ({ bunVersion: r.stdout.trim() })),
                        // Git branch + short status
                        execAsync("git rev-parse --abbrev-ref HEAD", { timeout: 5000 }).then(async (r) => {
                            const branch = r.stdout.trim();
                            const status = await execAsync("git status --porcelain | measure-object -line", { timeout: 5000 })
                                .then(s => {
                                const m = s.stdout.match(/(\d+)/);
                                return m?.[1] ? +m[1] : 0;
                            })
                                .catch(() => null);
                            const result = { gitBranch: branch };
                            if (status !== null)
                                result.gitDirtyFiles = status;
                            return result;
                        }),
                        // Windows build / edition
                        platform() === "win32"
                            ? execAsync('(Get-CimInstance Win32_OperatingSystem).Caption', { timeout: 5000, shell: "powershell.exe" })
                                .then(r => ({ osEdition: r.stdout.trim() }))
                            : Promise.resolve({}),
                        // Disk free for current drive (Windows) or root (Unix)
                        platform() === "win32"
                            ? execAsync(`powershell -NoProfile -c "(Get-PSDrive (Get-Location).Drive.Name) | Select-Object Used,Free | ConvertTo-Json"`, { timeout: 5000 })
                                .then(r => {
                                try {
                                    const d = JSON.parse(r.stdout.trim());
                                    return {
                                        diskUsedGB: +(d.Used / 1073741824).toFixed(1),
                                        diskFreeGB: +(d.Free / 1073741824).toFixed(1),
                                    };
                                }
                                catch {
                                    return {};
                                }
                            })
                            : execAsync("df -BG --output=used,avail / 2>/dev/null | tail -1", { timeout: 5000 })
                                .then(r => {
                                const [used, avail] = r.stdout.trim().split(/\s+/).map(s => parseInt(s));
                                return { diskUsedGB: used, diskFreeGB: avail };
                            }),
                        // Current user
                        platform() === "win32"
                            ? execAsync("whoami", { timeout: 3000 }).then(r => ({ user: r.stdout.trim() }))
                            : execAsync("whoami", { timeout: 3000 }).then(r => ({ user: r.stdout.trim() })),
                        // Shell version
                        platform() === "win32"
                            ? execAsync('powershell -NoProfile -c "$PSVersionTable.PSVersion.ToString()"', { timeout: 5000 })
                                .then(r => ({ shellVersion: `PowerShell ${r.stdout.trim()}` }))
                            : execAsync("$SHELL --version 2>/dev/null | head -1 || echo $SHELL", { timeout: 3000 })
                                .then(r => ({ shellVersion: r.stdout.trim() })),
                    ]);
                    for (const result of extras) {
                        if (result.status === "fulfilled" && result.value && typeof result.value === "object") {
                            Object.assign(data, result.value);
                        }
                    }
                    return { ok: true, message: "System info", data };
                }
                case "processes": {
                    try {
                        const cmd = platform() === "win32"
                            ? "tasklist /FO CSV /NH | Select-Object -First 25"
                            : "ps aux --sort=-%mem | head -25";
                        const { stdout } = await execAsync(cmd, { timeout: 10000 });
                        return {
                            ok: true,
                            message: "Top processes",
                            data: { output: stdout.trim() },
                        };
                    }
                    catch (err) {
                        return { ok: false, message: err instanceof Error ? err.message : "Failed to list processes" };
                    }
                }
                case "disk": {
                    try {
                        const cmd = platform() === "win32"
                            ? "wmic logicaldisk get size,freespace,caption /format:csv"
                            : "df -h";
                        const { stdout } = await execAsync(cmd, { timeout: 10000 });
                        return {
                            ok: true,
                            message: "Disk usage",
                            data: { output: stdout.trim() },
                        };
                    }
                    catch (err) {
                        return { ok: false, message: err instanceof Error ? err.message : "Failed to read disk info" };
                    }
                }
                case "env": {
                    // Only expose safe env vars
                    const safe = ["PATH", "HOME", "USERPROFILE", "SHELL", "TERM", "LANG", "NODE_ENV"];
                    const env = {};
                    for (const key of safe) {
                        if (process.env[key])
                            env[key] = process.env[key];
                    }
                    return { ok: true, message: "Environment variables (safe subset)", data: env };
                }
                default:
                    return { ok: false, message: `Unknown query: ${input.query}` };
            }
        },
    };
}
export function createOsInstallTool() {
    return {
        name: "os.install",
        description: "Install a system package via winget (Windows), apt (Linux), or brew (macOS)",
        tier: "standard",
        category: "os",
        source: "builtin",
        parameters: {
            type: "object",
            properties: {
                "package": { type: "string", description: "Package name to install" },
                manager: { type: "string", description: "Package manager to use", enum: ["winget", "apt", "brew", "auto"] },
            },
            required: ["package"],
        },
        async execute(input, _context) {
            const mgr = input.manager === "auto" || !input.manager
                ? detectPackageManager()
                : input.manager;
            const cmd = buildInstallCommand(mgr, input.package);
            if (!cmd) {
                return { ok: false, message: `No package manager available for platform ${platform()}` };
            }
            try {
                const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
                return {
                    ok: true,
                    message: `Installed ${input.package} via ${mgr}`,
                    data: { stdout: stdout.trim(), stderr: stderr.trim(), manager: mgr },
                };
            }
            catch (err) {
                return {
                    ok: false,
                    message: err instanceof Error ? err.message : "Install failed",
                };
            }
        },
    };
}
function detectPackageManager() {
    if (platform() === "win32")
        return "winget";
    if (platform() === "darwin")
        return "brew";
    return "apt";
}
function buildInstallCommand(manager, pkg) {
    // Sanitize package name — only allow alphanumeric, dash, dot, slash
    if (!/^[\w./@-]+$/.test(pkg))
        return null;
    switch (manager) {
        case "winget": return `winget install --accept-package-agreements --accept-source-agreements -e --id ${pkg}`;
        case "apt": return `sudo apt-get install -y ${pkg}`;
        case "brew": return `brew install ${pkg}`;
        default: return null;
    }
}
//# sourceMappingURL=os-tools.js.map