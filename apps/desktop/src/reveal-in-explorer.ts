/**
 * "Reveal in File Explorer" helper — extracted from electron-main.ts so it can
 * be unit-tested without booting the full Electron process.
 *
 * On Electron the `shell` module provides:
 *  - shell.showItemInFolder(path) — opens the parent folder with `path` selected
 *  - shell.openPath(path)         — opens a folder in the OS file manager
 *
 * For directories we open the folder itself; for files we reveal (select) the
 * file inside its parent folder.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Minimal shape of Electron's `shell` module that this helper relies on.
 * Lets tests inject a fake without importing Electron.
 */
export interface RevealShell {
  showItemInFolder: (fullPath: string) => void;
  openPath: (path: string) => Promise<string>;
}

/**
 * Reveal a file or directory in the host OS file explorer.
 *
 * @param rawPath  Absolute or relative path to the target file/folder.
 * @param shell    Electron `shell` module (or a fake).
 * @param statFn   Injectable stat (defaults to node:fs/promises.stat) for tests.
 * @returns `{ ok: true }` on success.
 * @throws  When the path does not exist or the OS call fails.
 */
export async function revealInExplorer(
  rawPath: string,
  shell: RevealShell,
  statFn: (p: string) => Promise<{ isDirectory(): boolean }> = (p) => stat(p),
): Promise<{ ok: true }> {
  const targetPath = resolve(rawPath);
  let info: { isDirectory(): boolean };
  try {
    info = await statFn(targetPath);
  } catch {
    throw new Error(`Path does not exist: ${targetPath}`);
  }

  if (info.isDirectory()) {
    await shell.openPath(targetPath);
  } else {
    shell.showItemInFolder(targetPath);
  }
  return { ok: true };
}