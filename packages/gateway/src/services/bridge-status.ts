import { exec } from 'node:child_process';

export type BridgeState = 'connected' | 'expired' | 'error' | 'unknown';

export interface BridgeTenant {
  id: string;
  name: string;
  connected: boolean;
}

export interface BridgeAccount {
  id: string;
  name: string;
  state: BridgeState;
  detail?: string;
  expiresAt?: string;
  tenants?: BridgeTenant[];
  tenantError?: string;
}

export interface BridgeStatus {
  platform: string;
  label: string;
  state: BridgeState;
  checkedAt: string;
  expiresAt?: string;
  detail?: string;
  /** One entry per signed-in account when the probe reports them. */
  accounts?: BridgeAccount[];
  reauth?: {
    command?: string;
    hint?: string;
  };
}

interface ProbeResult {
  platform?: string;
  label?: string;
  state?: BridgeState;
  expiresAt?: string;
  detail?: string;
  accounts?: unknown;
}

export function normaliseAccounts(value: unknown): BridgeAccount[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const accounts: BridgeAccount[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !entry.id) continue;
    accounts.push({
      id: entry.id,
      name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
      state: normaliseState(entry.state),
      detail: typeof entry.detail === 'string' ? entry.detail : undefined,
      expiresAt: typeof entry.expiresAt === 'string' ? entry.expiresAt : undefined,
      tenants: normaliseTenants(entry.tenants),
      tenantError: typeof entry.tenantError === 'string' ? entry.tenantError.slice(0, 200) : undefined,
    });
  }
  return accounts;
}

function normaliseTenants(value: unknown): BridgeTenant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tenants: BridgeTenant[] = [];
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(entry.id)) continue;
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200) continue;
    const id = entry.id.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    tenants.push({ id, name: entry.name.trim(), connected: entry.connected === true });
  }
  return tenants;
}

interface BridgeDefinition {
  platform: string;
  label: string;
  commandEnv: string;
  reauthEnv: string;
  hint: string;
}

const BRIDGES: BridgeDefinition[] = [
  {
    platform: 'teams',
    label: 'Microsoft Teams',
    commandEnv: 'JAIT_TEAMS_STATUS_CMD',
    reauthEnv: 'JAIT_TEAMS_REAUTH_CMD',
    hint: 'Teams-Sitzung ist abgelaufen. Führe den Reauth-Befehl aus und aktualisiere danach diesen Status.',
  },
];

const CACHE_TTL_MS = 45_000;
const PROBE_TIMEOUT_MS = 45_000;

interface CacheEntry {
  status: BridgeStatus;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<BridgeStatus>>();

function emptyStatus(definition: BridgeDefinition, state: BridgeState, detail: string): BridgeStatus {
  return {
    platform: definition.platform,
    label: definition.label,
    state,
    checkedAt: new Date().toISOString(),
    detail,
    reauth: { command: process.env[definition.reauthEnv]?.trim() || undefined, hint: definition.hint },
  };
}

function normaliseState(value: unknown): BridgeState {
  return value === 'connected' || value === 'expired' || value === 'error' || value === 'unknown'
    ? value
    : 'unknown';
}

function runProbe(command: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: 64 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        const trimmed = stdout.trim();
        if (!trimmed) {
          reject(new Error('Probe lieferte keine Ausgabe.'));
          return;
        }
        try {
          resolve(JSON.parse(trimmed) as ProbeResult);
        } catch {
          reject(new Error('Probe lieferte kein gültiges JSON.'));
        }
      },
    );
  });
}

async function probeBridge(definition: BridgeDefinition): Promise<BridgeStatus> {
  const command = process.env[definition.commandEnv]?.trim();
  if (!command) {
    return emptyStatus(definition, 'unknown', 'Kein Status-Probe konfiguriert.');
  }
  try {
    const result = await runProbe(command);
    const status: BridgeStatus = {
      platform: definition.platform,
      label: result.label?.trim() || definition.label,
      state: normaliseState(result.state),
      checkedAt: new Date().toISOString(),
      expiresAt: result.expiresAt,
      detail: result.detail,
      accounts: normaliseAccounts(result.accounts),
    };
    if (status.state !== 'connected') {
      status.reauth = {
        command: process.env[definition.reauthEnv]?.trim() || undefined,
        hint: definition.hint,
      };
    }
    return status;
  } catch (error) {
    return emptyStatus(
      definition,
      'error',
      error instanceof Error ? error.message.slice(0, 200) : 'Status-Abfrage fehlgeschlagen.',
    );
  }
}

async function getBridgeStatus(definition: BridgeDefinition, force: boolean): Promise<BridgeStatus> {
  const cached = cache.get(definition.platform);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.status;

  const pending = inflight.get(definition.platform);
  if (pending) return pending;

  const promise = probeBridge(definition)
    .then((status) => {
      cache.set(definition.platform, { status, fetchedAt: Date.now() });
      return status;
    })
    .finally(() => {
      inflight.delete(definition.platform);
    });

  inflight.set(definition.platform, promise);
  return promise;
}

export async function bridgeStatuses(force = false): Promise<BridgeStatus[]> {
  return Promise.all(BRIDGES.map((definition) => getBridgeStatus(definition, force)));
}
