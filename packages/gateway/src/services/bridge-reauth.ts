import { spawn } from 'node:child_process';
import type { SurfaceRegistry } from '../surfaces/registry.js';
import type { BrowserSurface } from '../surfaces/browser.js';

export type TeamsReauthPhase = 'idle' | 'starting' | 'waiting_login' | 'applying' | 'done' | 'error';

export interface TeamsReauthState {
  phase: TeamsReauthPhase;
  message: string;
  /** noVNC live view of the Teams login; only set while the browser is open. */
  liveViewUrl: string | null;
  startedAt: string | null;
}

const TEAMS_URL = 'https://teams.microsoft.com/';
const TEAMS_CLIENT_ID = '5e3ce6c0-2b1f-4285-8d4b-75ee78787346';
const TOKEN_ENDPOINT = '/oauth2/v2.0/token';
const POLL_MS = 2_500;
const MAX_WAIT_MS = 15 * 60_000;
const APPLY_TIMEOUT_MS = 90_000;

const IDLE: TeamsReauthState = { phase: 'idle', message: '', liveViewUrl: null, startedAt: null };

interface Run {
  state: TeamsReauthState;
  browserId: string;
  timer?: NodeJS.Timeout;
  nextSeq: number;
  polling: boolean;
  deadline: number;
  tenant?: { accountId: string; tenantId: string };
}

/**
 * Teams re-authentication without a shell: opens the Teams web client in a gateway
 * live-view browser, waits for the user to sign in, lifts the refresh token out of the
 * browser's own token response and hands it to the bridge host over stdin.
 */
export class TeamsReauthService {
  private readonly runs = new Map<string, Run>();

  constructor(
    private readonly registry: SurfaceRegistry,
    private readonly onApplied: () => void = () => {},
  ) {}

  get(userId: string): TeamsReauthState {
    return this.runs.get(userId)?.state ?? IDLE;
  }

  async start(userId: string, tenant?: { accountId: string; tenantId: string }): Promise<TeamsReauthState> {
    const existing = this.runs.get(userId);
    if (existing && ['starting', 'waiting_login', 'applying'].includes(existing.state.phase)) {
      if (existing.tenant?.accountId !== tenant?.accountId || existing.tenant?.tenantId !== tenant?.tenantId) {
        return { phase: 'error', message: 'Another Teams sign-in is already in progress.', liveViewUrl: null, startedAt: existing.state.startedAt };
      }
      return existing.state;
    }
    if (tenant && (!LOGIN_ID.test(tenant.accountId) || !TENANT_ID.test(tenant.tenantId))) {
      return this.fail(userId, 'Invalid account or organization.');
    }
    if (tenant && !tenantApplyCommand()) return this.fail(userId, 'Tenant sign-in is not configured.');
    if (!tenant && !applyCommand()) {
      return this.fail(userId, 'Kein Apply-Befehl konfiguriert (JAIT_TEAMS_APPLY_CMD oder JAIT_TEAMS_REAUTH_CMD).');
    }

    const browserId = `teams-reauth-${userId}`;
    await this.registry.stopSurface(browserId, 'teams-reauth-restart').catch(() => {});
    const run: Run = {
      state: { phase: 'starting', message: 'Browser wird gestartet…', liveViewUrl: null, startedAt: new Date().toISOString() },
      browserId,
      nextSeq: 0,
      polling: false,
      deadline: Date.now() + MAX_WAIT_MS,
      tenant,
    };
    this.runs.set(userId, run);

    try {
      const surface = (await this.registry.startSurface('browser', browserId, {
        sessionId: browserId,
        projectRoot: process.cwd(),
        userId,
        requireLiveView: true,
      })) as BrowserSurface;
      const live = surface.getLiveViewInfo();
      if (!live) throw new Error('Der Browser stellt keine Live-Ansicht bereit.');
      await surface.navigate(tenant ? `${TEAMS_URL}v2/?tenantId=${encodeURIComponent(tenant.tenantId)}` : TEAMS_URL);
      run.state = {
        ...run.state,
        phase: 'waiting_login',
        message: tenant
          ? 'Melde dich mit deinem normalen Konto an und wähle die gewünschte Organisation in Teams aus.'
          : 'Melde dich im geöffneten Teams-Fenster an. Das Token wird danach automatisch übernommen.',
        liveViewUrl: `/noVNC/vnc_lite.html?path=api/live-view/${live.websockifyPort}/websockify`,
      };
      run.timer = setInterval(() => void this.poll(userId), POLL_MS);
    } catch (error) {
      await this.fail(userId, error instanceof Error ? error.message : 'Browser-Start fehlgeschlagen.');
    }
    return this.get(userId);
  }

  async cancel(userId: string): Promise<TeamsReauthState> {
    const run = this.runs.get(userId);
    if (run) await this.finish(userId, run, { ...IDLE });
    return this.get(userId);
  }

  private async fail(userId: string, message: string): Promise<TeamsReauthState> {
    const run = this.runs.get(userId);
    const state: TeamsReauthState = { phase: 'error', message, liveViewUrl: null, startedAt: run?.state.startedAt ?? null };
    if (run) await this.finish(userId, run, state);
    else this.runs.set(userId, { state, browserId: '', nextSeq: 0, polling: false, deadline: 0 });
    return state;
  }

  private async finish(userId: string, run: Run, state: TeamsReauthState): Promise<void> {
    if (run.timer) clearInterval(run.timer);
    run.timer = undefined;
    run.state = state;
    await this.registry.stopSurface(run.browserId, 'teams-reauth-finished').catch(() => {});
    if (state.phase === 'idle') this.runs.delete(userId);
  }

  private async poll(userId: string): Promise<void> {
    const run = this.runs.get(userId);
    if (!run || run.polling || run.state.phase !== 'waiting_login') return;
    if (Date.now() > run.deadline) {
      await this.fail(userId, 'Zeitüberschreitung: keine Anmeldung innerhalb von 15 Minuten.');
      return;
    }
    run.polling = true;
    try {
      const surface = this.registry.getSurface(run.browserId) as BrowserSurface | undefined;
      if (!surface || surface.state !== 'running') {
        await this.fail(userId, 'Der Browser wurde beendet, bevor die Anmeldung abgeschlossen war.');
        return;
      }
      const log = await surface.networkLog({
        urlIncludes: TOKEN_ENDPOINT,
        method: 'POST',
        includeBodies: true,
        bodyLimit: 32_768,
        sinceSeq: run.nextSeq,
        limit: 50,
      });
      run.nextSeq = Math.max(run.nextSeq, log.nextSeq);
      const token = pickRefreshToken(log.entries, run.tenant?.tenantId);
      if (!token) return;

      run.state = { ...run.state, phase: 'applying', message: 'Token erkannt – wird in die Bridge übernommen…' };
      if (run.timer) clearInterval(run.timer);
      run.timer = undefined;
      await this.apply(userId, run, token);
    } catch (error) {
      // Transient CDP/network hiccups should not abort a login the user is in the middle of.
      if (run.state.phase === 'applying') {
        await this.fail(userId, error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.');
      }
    } finally {
      run.polling = false;
    }
  }

  private async apply(userId: string, run: Run, token: string): Promise<void> {
    try {
      if (run.tenant) {
        const command = tenantApplyCommand();
        if (!command) throw new Error('Tenant sign-in is not configured.');
        await runHostCommand(command, JSON.stringify({ ...run.tenant, token }));
      } else {
        await runApply(token);
      }
    } catch (error) {
      await this.fail(userId, error instanceof Error ? error.message : 'Übernahme fehlgeschlagen.');
      return;
    }
    await this.finish(userId, run, {
      phase: 'done',
      message: 'Teams ist wieder verbunden.',
      liveViewUrl: null,
      startedAt: run.state.startedAt,
    });
    this.onApplied();
  }

  /** Deletes one Teams account (login) from the bridge. Throws with a user-facing message. */
  async removeAccount(loginId: string): Promise<void> {
    if (!LOGIN_ID.test(loginId)) throw new Error('Ungültige Konto-ID.');
    const command = removeCommand();
    if (!command) throw new Error('Kein Entfernen-Befehl konfiguriert (JAIT_TEAMS_REMOVE_CMD).');
    await runHostCommand(command, loginId);
    this.onApplied();
  }
}

interface NetworkEntryLike {
  url: string | null;
  status: number | null;
  requestBody: { text?: string } | null;
  responseBody: { text?: string } | null;
}

/** Newest successful token response issued to the Teams web client that carries a refresh token. */
export function pickRefreshToken(entries: NetworkEntryLike[], tenantId?: string): string | null {
  for (const entry of [...entries].reverse()) {
    if (entry.status !== 200 || !entry.url?.includes(TOKEN_ENDPOINT)) continue;
    const request = entry.requestBody?.text ?? '';
    if (tenantId && new URLSearchParams(request).get('client_id') !== TEAMS_CLIENT_ID) continue;
    if (!tenantId && request && !request.includes(TEAMS_CLIENT_ID)) continue;
    try {
      const body = JSON.parse(entry.responseBody?.text ?? '') as { refresh_token?: unknown; id_token?: unknown };
      if (tenantId && !matchesTenant(entry.url, body.id_token, tenantId)) continue;
      if (typeof body.refresh_token === 'string' && body.refresh_token.length >= 100) return body.refresh_token;
    } catch {
      // body truncated or not JSON: ignore
    }
  }
  return null;
}


// Tenant evidence comes from the token response, not the browser's displayed URL.
// The ID token is used only to correlate an HTTPS response from Microsoft; it is not
// accepted as a signed identity assertion or used to grant access.
function matchesTenant(rawUrl: string, idToken: unknown, tenantId: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com' || url.port || url.username || url.password) return false;
    const match = /^\/([^/]+)\/oauth2\/v2\.0\/token\/?$/.exec(url.pathname);
    if (!match?.[1]) return false;
    const authority = match[1].toLowerCase();
    const expected = tenantId.toLowerCase();
    if (authority !== expected && !['common', 'organizations'].includes(authority)) return false;
    if (typeof idToken === 'string') {
      const parts = idToken.split('.');
      if (parts.length !== 3 || !parts[1]) return false;
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { tid?: unknown };
      return typeof claims.tid === 'string' && claims.tid.toLowerCase() === expected;
    }
    return authority === expected;
  } catch {
    return false;
  }
}

export function applyCommand(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.JAIT_TEAMS_APPLY_CMD?.trim();
  if (explicit) return explicit;
  const reauth = env.JAIT_TEAMS_REAUTH_CMD?.trim();
  if (reauth && /teams-reauth\.sh\s*$/.test(reauth)) return reauth.replace(/teams-reauth\.sh\s*$/, 'teams-apply-token.sh');
  return undefined;
}

/** Host script that deletes one Teams login; sits next to the apply script. */
export function removeCommand(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const apply = applyCommand(env);
  return apply && /teams-apply-token\.sh\s*$/.test(apply)
    ? apply.replace(/teams-apply-token\.sh\s*$/, 'teams-remove-login.sh')
    : env.JAIT_TEAMS_REMOVE_CMD?.trim() || undefined;
}

const LOGIN_ID = /^8:orgid:[0-9a-fA-F-]{36}$/;
const TENANT_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function tenantApplyCommand(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = env.JAIT_TEAMS_TENANT_APPLY_CMD?.trim();
  if (explicit) return explicit;
  const apply = applyCommand(env);
  return apply && /teams-apply-token\.sh\s*$/.test(apply)
    ? apply.replace(/teams-apply-token\.sh\s*$/, 'teams-apply-tenant.sh') : undefined;
}

function runApply(token: string): Promise<void> {
  const command = applyCommand();
  if (!command) return Promise.reject(new Error('Kein Apply-Befehl konfiguriert.'));
  return runHostCommand(command, token);
}

/** Pipes `secret` to the host command's stdin and checks its JSON status line. */
function runHostCommand(command: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Bridge-Übernahme hat zu lange gedauert.'));
    }, APPLY_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-4096); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(redact(stderr.trim().split('\n').pop() || `Apply-Befehl endete mit Code ${code}.`, token)));
        return;
      }
      try {
        const status = JSON.parse(stdout.trim().split('\n').pop() ?? '') as { state?: string; detail?: string };
        // Only a down bridge fails the call; other accounts being expired is not this command's fault.
        if (status.state === 'error') {
          reject(new Error(status.detail || `Bridge meldet Status "${status.state}".`));
          return;
        }
      } catch {
        // status line is advisory; exit code 0 means the import succeeded
      }
      resolve();
    });
    child.stdin.on('error', () => {});
    child.stdin.end(token);
  });
}

function redact(message: string, token: string): string {
  return message.split(token).join('[token]').slice(0, 300);
}
