#!/usr/bin/env node
/**
 * Optional Synapse runtime for Jait Messenger. Never runs during normal Jait startup.
 * Generated configuration/data belongs to the active checkout, not process CWD.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, realpathSync, constants } from 'node:fs'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const requestedCommand = args.shift() ?? 'help'
const command = requestedCommand === '--help' || requestedCommand === '-h' ? 'help' : requestedCommand
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error('Missing value for ' + name)
  args.splice(index, 2)
  return value
}
function projectPath(input) {
  const path = resolve(root, input)
  const rel = relative(root, path)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Matrix files must stay inside this project.')
  // Check the nearest existing parent as well, to reject symlink escapes.
  let parent = path
  while (!existsSync(parent)) parent = dirname(parent)
  const actual = relative(realpathSync(root), realpathSync(parent))
  if (actual.startsWith('..') || isAbsolute(actual)) throw new Error('Matrix files cannot escape through a symlink.')
  return path
}
const rootInput = option('--project-root', null)
if (!rootInput && command !== 'help') throw new Error('Pass --project-root /path/to/project. Matrix data is never anchored to the installed package or terminal CWD.')
const root = rootInput ? realpathSync(rootInput) : resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const dataDir = projectPath(option('--data-dir', '.jait/artifacts/matrix'))
const settingsPath = resolve(dataDir, 'runtime.json')
const uid = process.getuid?.()
const gid = process.getgid?.()
if (process.platform !== 'win32' && (uid === undefined || uid === 0)) throw new Error('Run as your normal host user, not root.')
const owner = uid === undefined ? [] : ['--user', String(uid) + ':' + String(gid)]
const name = 'jait-matrix-' + createHash('sha256').update(dataDir).digest('hex').slice(0, 10)

function docker(values, capture = false, allowFailure = false) {
  const result = spawnSync('docker', values, { cwd: root, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
  if (result.error || result.status !== 0) {
    if (allowFailure) return null
    throw new Error(capture ? 'Docker command failed. Check Docker availability and the Matrix runtime.' : 'Docker command failed.')
  }
  return capture ? result.stdout.trim() : ''
}
function settings() {
  if (!existsSync(settingsPath)) throw new Error('Initialize first: node scripts/matrix-stack.mjs init --server-name your.server')
  return JSON.parse(readFileSync(settingsPath, 'utf8'))
}
function runtimeArgs(config) {
  return ['--rm', ...owner, '--env', 'HOME=/data', '--mount', 'type=bind,src=' + dataDir + ',dst=/data', config.image]
}
function configure(config, source) {
  const values = runtimeArgs(config)
  const image = values.pop()
  docker(['run', ...values, '--entrypoint', 'python', image, '-c', source])
}

try {
  if (command === 'init') {
    const serverName = option('--server-name', 'jait.local')
    const port = Number(option('--port', '8008'))
    const image = option('--image', 'ghcr.io/element-hq/synapse:latest')
    if (args.length) throw new Error('Unknown options: ' + args.join(' '))
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(serverName)) throw new Error('Use a stable DNS hostname as the server name.')
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535.')
    if (existsSync(settingsPath) || existsSync(resolve(dataDir, 'homeserver.yaml'))) throw new Error('This runtime is already initialized. Existing configuration has been preserved.')
    mkdirSync(dataDir, { recursive: true, mode: 0o700 })
    docker(['pull', image])
    const digests = JSON.parse(docker(['image', 'inspect', image, '--format', '{{json .RepoDigests}}'], true))
    if (!digests?.[0]) throw new Error('Could not resolve a pinned image digest.')
    const config = { serverName, port, image: digests[0], container: name, network: name }
    docker(['run', '--rm', ...owner, '--env', 'HOME=/data', '--env', 'SYNAPSE_SERVER_NAME=' + serverName, '--env', 'SYNAPSE_REPORT_STATS=no', '--mount', 'type=bind,src=' + dataDir + ',dst=/data', config.image, 'generate'])
    configure(config, [
      'from pathlib import Path',
      'import yaml',
      'p = Path("/data/homeserver.yaml")',
      'c = yaml.safe_load(p.read_text())',
      'c.update({"enable_registration": False, "report_stats": False, "public_baseurl": "http://localhost:' + port + '/", "federation_domain_whitelist": [], "max_upload_size": "20M"})',
      'c["listeners"] = [{"port": 8008, "tls": False, "type": "http", "x_forwarded": True, "bind_addresses": ["0.0.0.0"], "resources": [{"names": ["client"], "compress": False}]}]',
      'c["app_service_config_files"] = []',
      'p.write_text(yaml.safe_dump(c, sort_keys=False))',
    ].join('\n'))
    writeFileSync(settingsPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    console.log('Initialized Matrix at ' + dataDir + '. Image pinned to ' + config.image)
    console.log('Start with: node scripts/matrix-stack.mjs start' + (dataDir.endsWith('/matrix') ? '' : ' --data-dir ' + relative(root, dataDir)))
  } else if (command === 'start') {
    if (args.length) throw new Error('Unknown options: ' + args.join(' '))
    const config = settings()
    const existing = docker(['inspect', config.container, '--format', '{{.State.Status}}'], true, true)
    if (existing) docker(['start', config.container])
    else {
      if (docker(['network', 'inspect', config.network], true, true) === null) docker(['network', 'create', config.network], true)
      const values = runtimeArgs(config)
      const image = values.pop()
      // No root containers write to the project; bind only loopback and expose no federation port.
      docker(['run', '-d', '--name', config.container, '--restart', 'unless-stopped', '--network', config.network, '--network-alias', 'synapse', '-p', '127.0.0.1:' + config.port + ':8008', ...values.filter(value => value !== '--rm'), image])
    }
    console.log('Matrix client URL: http://localhost:' + config.port)
    console.log('Bridge Docker network: ' + config.network + '; internal homeserver: http://synapse:8008')
  } else if (command === 'stop' || command === 'restart' || command === 'logs') {
    if (args.length) throw new Error('Unknown options: ' + args.join(' '))
    const config = settings()
    docker(command === 'logs' ? ['logs', '--tail', '100', config.container] : [command, config.container])
  } else if (command === 'status') {
    const config = settings()
    console.log(docker(['inspect', config.container, '--format', '{{.State.Status}}'], true))
    try {
      const response = await fetch('http://127.0.0.1:' + config.port + '/_matrix/client/versions', { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('Not ready')
      console.log('Matrix client API is ready.')
    } catch { throw new Error('Matrix client API is not ready yet. Inspect logs.') }
  } else if (command === 'register') {
    const config = settings()
    if (args.length) throw new Error('Credentials are entered interactively, not as command arguments.')
    docker(['exec', '-it', ...owner, config.container, 'register_new_matrix_user', '-c', '/data/homeserver.yaml', 'http://localhost:8008'])
  } else if (command === 'register-bridge') {
    const config = settings()
    const [id, source] = args
    if (!id || !/^[a-z0-9-]+$/.test(id) || !source || args.length !== 2) throw new Error('Usage: register-bridge <bridge-id> <project-local registration.yaml>')
    const input = projectPath(source)
    const targetDir = projectPath(resolve(dataDir, 'appservices'))
    mkdirSync(targetDir, { mode: 0o700 })
    // The registration contains appservice credentials. Never print it.
    const target = resolve(targetDir, id + '.yaml')
    if (existsSync(target)) throw new Error('That bridge is already registered. Existing registration preserved.')
    copyFileSync(input, target, constants.COPYFILE_EXCL)
    configure(config, [
      'from pathlib import Path',
      'import yaml',
      'p = Path("/data/homeserver.yaml")',
      'c = yaml.safe_load(p.read_text())',
      'registration = "/data/appservices/' + id + '.yaml"',
      'r = yaml.safe_load(Path(registration).read_text())',
      'assert all(k in r for k in ["id", "url", "as_token", "hs_token", "sender_localpart", "namespaces"]), "Invalid appservice registration"',
      'c.setdefault("app_service_config_files", []).append(registration)',
      'p.write_text(yaml.safe_dump(c, sort_keys=False))',
    ].join('\n'))
    console.log('Registered bridge. Restart Matrix after the bridge is configured and running.')
  } else {
    console.log('Optional Jait Matrix server (requires Docker):')
    console.log('  init [--server-name jait.local] [--port 8008] [--image image:tag]')
    console.log('  start | stop | restart | status | logs | register')
    console.log('  register-bridge <bridge-id> <project-local registration.yaml>')
    console.log('  Pass --project-root /path/to/project; all commands accept --data-dir <project-local directory>.')
    console.log('  Data is preserved on stop. See docs/messenger.md for bridges and HTTPS.')
    if (command !== 'help') process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Matrix setup failed.')
  process.exitCode = 1
}
