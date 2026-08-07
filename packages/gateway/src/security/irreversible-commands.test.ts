import { describe, expect, it } from "vitest";
import { classifyIrreversibleCommand } from "./tool-permissions.js";

describe("irreversible command classification", () => {
  // Verbatim commands an agent ran on its own initiative during one chat,
  // after terminal access had already been approved for that session.
  it.each([
    'cd /home/jakob/TizenAnilabStream && git stash && cd watch && npm test 2>&1 > /tmp/out.log; cd .. && git stash pop',
    'git checkout -- watch/data/watch.sqlite && git stash pop',
    'cd /home/jakob/TizenAnilabStream && git rm --cached watch/data/watch.sqlite >/dev/null && echo "untracked"',
    'pkill -f "node server.js" 2>/dev/null; sleep 1',
    'pkill -f "PORT=8935" 2>/dev/null; pkill -f "server.js" 2>/dev/null',
  ])("flags %s", (command) => {
    expect(classifyIrreversibleCommand(command).irreversible).toBe(true);
    expect(classifyIrreversibleCommand(command).reason).toBeTruthy();
  });

  it.each([
    "git reset --hard origin/main",
    "rm -rf node_modules",
    "git clean -fd",
    "git push --force origin main",
  ])("flags %s", (command) => {
    expect(classifyIrreversibleCommand(command).irreversible).toBe(true);
  });

  it.each([
    // Ordinary work must not start nagging, or the prompt becomes noise.
    "npm test 2>&1 | tail -20",
    "git status --short",
    "git stash list",
    "git diff --stat && git log --oneline -5",
    "cd /home/jakob/TizenAnilabStream && git push origin main",
    'ssh jakob@base "docker stack deploy -c watch.yml watch"',
    "git add watch/native.html && git commit -m 'fix'",
    "node --test tests/frontend.test.js",
  ])("allows %s", (command) => {
    expect(classifyIrreversibleCommand(command).irreversible).toBe(false);
  });
});
