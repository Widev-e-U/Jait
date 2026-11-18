/** Differential driver for `providers/acp-binary-launcher.ts`.
 *
 * That module has no exports: it is a process entry point. The only faithful
 * way to exercise the real source is therefore to run the real file as a child
 * process against fixtures owned by the caller. Nothing here re-implements the
 * launcher; the driver only prepares an install root, serves the archive over a
 * loopback TLS peer, spawns the script, and reports what the filesystem, the
 * external archive tooling and the agent process observed.
 */
import {chmod, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {dirname, join, relative} from 'node:path';

const LAUNCHER = join(import.meta.dir, '../../../packages/gateway/src/providers/acp-binary-launcher.ts');
const MARKER = '.jait-acp-install.json';

type FileReport = {path: string; mode: string; size: number};

async function walk(directory: string, base: string = directory): Promise<FileReport[]> {
  const entries = await readdir(directory, {withFileTypes: true}).catch(() => []);
  const reports: FileReport[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      reports.push(...(await walk(full, base)));
      continue;
    }
    const info = await stat(full);
    reports.push({path: relative(base, full).split('\\').join('/'), mode: (info.mode & 0o777).toString(8), size: info.size});
  }
  return reports;
}

/** PATH shims that record the exact argv the source hands to `tar`/`unzip`
 * before delegating to the real tool, so argv ordering is testable without
 * substituting the tool. */
async function installToolShims(work: string): Promise<string> {
  const bin = join(work, 'bin');
  await mkdir(bin, {recursive: true});
  for (const [name, real] of [['tar', '/usr/bin/tar'], ['unzip', '/usr/bin/unzip']] as const) {
    const shim = [
      '#!/bin/sh',
      '{ printf "%s" "' + name + '"; for a in "$@"; do printf "\\t%s" "$a"; done; printf "\\n"; } >> "$JAIT_TOOL_LOG"',
      `exec ${real} "$@"`,
      '',
    ].join('\n');
    await writeFile(join(bin, name), shim);
    await chmod(join(bin, name), 0o755);
  }
  return bin;
}

async function startArchivePeer(work: string, body: Uint8Array, status: number) {
  const certPath = join(work, 'fixture-cert.pem');
  const keyPath = join(work, 'fixture-key.pem');
  let cert: string;
  let key: string;
  try {
    cert = await readFile(certPath, 'utf8');
    key = await readFile(keyPath, 'utf8');
  } catch {
    const generated = Bun.spawn(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=127.0.0.1'], {stdout: 'ignore', stderr: 'ignore'});
    if (await generated.exited !== 0) throw new Error('fixture certificate generations failed');
    cert = await readFile(certPath, 'utf8');
    key = await readFile(keyPath, 'utf8');
  }
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: {cert, key},
    fetch: () => new Response(body, {status}),
  });
  return {server, origin: `https://127.0.0.1:${server.port}`};
}

function readToolLog(text: string): string[][] {
  const invocations: string[][] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    invocations.push(line.split('\t'));
  }
  return invocations;
}

export async function dispatch(call: any) {
  if (call.op !== 'nativeacpbinarylauncher.launch') throw new Error('unknown driver operation');
  const work: string = call.workDir;
  const root: string = call.root ?? join(work, 'root');
  const state: string = call.stateDir ?? join(work, 'state');
  await rm(root, {recursive: true, force: true});
  await rm(state, {recursive: true, force: true});
  await mkdir(work, {recursive: true});
  const bin = await installToolShims(work);

  const baseEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (name.startsWith('JAIT_') || name === 'NODE_TLS_REJECT_UNAUTHORIZED') continue;
    baseEnv[name] = value;
  }
  const toolLog = join(work, 'tool.log');
  await rm(toolLog, {force: true});

  let spec: any = call.spec ? {...call.spec} : null;
  let peer: Awaited<ReturnType<typeof startArchivePeer>> | undefined;
  if (spec && call.fixture) {
    const body = new Uint8Array(await readFile(call.fixture.archivePath));
    peer = await startArchivePeer(work, body, call.fixture.status ?? 200);
    spec.archive = `${peer.origin}/${call.fixture.archiveName ?? 'agent.tar.gz'}`;
  }

  if (spec && call.preinstall) {
    const installDir = join(root, spec.id, spec.version, spec.target);
    await mkdir(installDir, {recursive: true});
    if (call.preinstall.script !== undefined) {
      const command = join(installDir, spec.cmd);
      await mkdir(dirname(command), {recursive: true});
      await writeFile(command, call.preinstall.script);
      await chmod(command, call.preinstall.mode ?? 0o755);
    }
    if (call.preinstall.marker !== null && call.preinstall.marker !== undefined) {
      await writeFile(join(installDir, MARKER), JSON.stringify(call.preinstall.marker));
    }
  }

  const encoded = typeof call.encoded === 'string' ? call.encoded : spec ? Buffer.from(JSON.stringify(spec)).toString('base64url') : undefined;
  const argv = [process.execPath, LAUNCHER, ...(encoded === undefined ? [] : [encoded]), ...(call.forwarded ?? [])];
  const env: Record<string, string> = {
    ...baseEnv,
    PATH: `${bin}:${baseEnv.PATH ?? ''}`,
    JAIT_TOOL_LOG: toolLog,
    JAIT_ACP_BINARY_ROOT: root,
    JAIT_STATE_DIR: state,
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    ...(call.env ?? {}),
  };

  const child = Bun.spawn(argv, {cwd: work, env, stdout: 'pipe', stderr: 'pipe'});
  const exitCode = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  peer?.server.stop(true);

  const archiveUrl: string | undefined = spec?.archive;
  const normalize = (text: string): string => {
    let normalized = text;
    if (archiveUrl && archiveUrl.startsWith('https://127.0.0.1:')) normalized = normalized.replaceAll(archiveUrl, '<archive>');
    normalized = normalized.replaceAll(root, '<root>').replaceAll(state, '<state>').replaceAll(work, '<work>');
    return normalized.replace(/\.install-[0-9A-Za-z]+/g, '.install-<scratch>');
  };

  const installDir = spec ? join(root, spec.id, spec.version, spec.target) : undefined;
  const files = installDir ? await walk(installDir) : [];
  const marker = installDir ? await readFile(join(installDir, MARKER), 'utf8').catch(() => null) : null;
  const toolText = await readFile(toolLog, 'utf8').catch(() => '');

  return {
    exitCode,
    stderr: normalize(stderr).trim(),
    stdout: normalize(stdout),
    files: files.map(file => ({...file, path: normalize(file.path)})),
    marker: marker === null ? null : normalize(marker),
    toolLog: readToolLog(toolText).map(invocation => invocation.map(normalize)),
    archiveName: archiveUrl?.split('/').pop() ?? null,
  };
}
