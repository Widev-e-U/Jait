/**
 * Shell prompt recognition.
 *
 * Captured PTY output contains the prompt the shell drew after the command
 * finished. Callers strip those lines so the agent sees command output rather
 * than terminal furniture. Kept dependency-free so both the terminal tools and
 * the background-command monitor can use it without an import cycle.
 */

export function isPowerShellShell(shell: string): boolean {
  return /(^|[\\/])(pwsh|powershell)(\.exe)?$/i.test(shell);
}

export function isShellPromptLine(line: string, shell: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isPowerShellShell(shell)) return /^PS .+?>/.test(trimmed);
  if (/^[^@\n]+@[^:]+:.*[$#]$/.test(trimmed)) return true;
  if (/^(?:~|\/|\.{1,2}(?:\/|$)|[A-Za-z]:[\\/]).*[$#%]$/.test(trimmed)) return true;
  return /^[A-Za-z][A-Za-z0-9_.-]*\s*[%$#]$/.test(trimmed);
}
