#!/bin/bash
# Jait Terminal Shell Integration — Bash
# Emits OSC 633 sequences so the host can detect prompt boundaries,
# command start / finish, exit codes, and the current working directory.

# Guard against double-sourcing
[[ "$JAIT_SHELL_INTEGRATION" == "1" ]] && return 2>/dev/null
export JAIT_SHELL_INTEGRATION=1

__jait_osc() {
  printf '\e]633;%s\a' "$1"
}

# ── Prompt (PS1) ──────────────────────────────────────────────────
# Wrap existing PS1 with A/B markers and D (exit code of last command).

__jait_prompt_cmd() {
  local ec=$?
  __jait_osc "D;$ec"
  __jait_osc "P;Cwd=$PWD"
  __jait_osc "A"
}

__jait_prompt_end() {
  __jait_osc "B"
}

# Install into PROMPT_COMMAND
if [[ -z "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__jait_prompt_cmd"
else
  PROMPT_COMMAND="__jait_prompt_cmd;$PROMPT_COMMAND"
fi

# Append B marker after PS1
PS1="${PS1}\[$(__jait_prompt_end)\]"

# ── Pre-exec hook (DEBUG trap) ────────────────────────────────────
# Emit C (command started) + E (command text) before each command.
__jait_preexec_fired=0

__jait_preexec() {
  # Avoid firing for PROMPT_COMMAND itself
  if [[ "$__jait_preexec_fired" == "0" ]]; then
    __jait_preexec_fired=1
    local cmd
    cmd=$(HISTTIMEFORMAT= history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
    # URI-encode the command
    local encoded
    encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$cmd" 2>/dev/null || echo "$cmd")
    __jait_osc "E;$encoded"
    __jait_osc "C"
  fi
}

# Reset the preexec flag at each prompt
__jait_preexec_reset() {
  __jait_preexec_fired=0
}

PROMPT_COMMAND="__jait_preexec_reset;$PROMPT_COMMAND"
trap '__jait_preexec' DEBUG
