import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Deliberate allowlist: no live Jait node, credentials, shell init, proxy,
// provider CLI settings, NODE_OPTIONS preload, or inherited integration flags.
export function isolatedEnvironment(out, inherited = process.env) {
  const home = join(out, 'home');
  const state = join(home, '.jait');
  for (const dir of [home, state, join(out, 'xdg'), join(out, 'tmp')]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  for (const dir of ['config', 'cache', 'data', 'state', 'runtime']) mkdirSync(join(out, 'xdg', dir), { recursive: true, mode: 0o700 });
  mkdirSync(join(state, 'data'), { recursive: true });
  return {
    PATH: inherited.PATH,
    ...(inherited.SystemRoot ? { SystemRoot: inherited.SystemRoot } : {}),
    HOME: home, USERPROFILE: home,
    XDG_CONFIG_HOME: join(out, 'xdg/config'), XDG_CACHE_HOME: join(out, 'xdg/cache'),
    XDG_DATA_HOME: join(out, 'xdg/data'), XDG_STATE_HOME: join(out, 'xdg/state'), XDG_RUNTIME_DIR: join(out, 'xdg/runtime'),
    JAIT_STATE_DIR: state, JAIT_DB_PATH: join(state, 'data/jait.db'),
    CODEX_HOME: join(home, '.codex'), CLAUDE_CONFIG_DIR: join(home, '.claude'),
    TMPDIR: join(out, 'tmp'), TMP: join(out, 'tmp'), TEMP: join(out, 'tmp'),
    // Existing production switch prevents CWD and repository .env loading.
    NODE_OPTIONS: `--max-old-space-size=5120 --import=${new URL('./component-coverage-network.mjs', import.meta.url).href}`,
    __JAIT_CLI: '1', NODE_ENV: 'test', TZ: 'UTC', LANG: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false', SSH_ASKPASS: '/bin/false',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ALLOW_PROTOCOL: 'file',
    GCM_INTERACTIVE: 'never', PAGER: 'cat', GIT_PAGER: 'cat',
    JAIT_PRIMARY_GATEWAY: '', JAIT_PRIMARY_TOKEN: '', JAIT_NODE_ONLY: '0',
    OPENAI_API_KEY: '', OMNIROUTE_API_KEY: '',
    OPENAI_BASE_URL: 'http://component-baseline.invalid/v1', OLLAMA_URL: 'http://127.0.0.1:9',
    // Preserve the documented OmniRoute URL contract; the TCP guard blocks it.
    WHISPER_URL: 'http://127.0.0.1:9',
  };
}
