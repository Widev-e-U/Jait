#!/bin/zsh
# Jait Terminal Shell Integration — Zsh
# Emits OSC 633 sequences so the host can detect prompt boundaries,
# command start / finish, exit codes, and the current working directory.

# Guard against double-sourcing
[[ "$JAIT_SHELL_INTEGRATION" == "1" ]] && return 2>/dev/null
export JAIT_SHELL_INTEGRATION=1

__jait_osc() {
  printf '\e]633;%s\a' "$1"
}

# ── precmd (runs before each prompt) ─────────────────────────────
__jait_precmd() {
  local ec=$?
  __jait_osc "D;$ec"
  __jait_osc "P;Cwd=$PWD"
  __jait_osc "A"
}

# ── preexec (runs before each command) ────────────────────────────
__jait_preexec() {
  local cmd="$1"
  # URI-encode the command (zsh has built-in parameter expansion flags)
  local encoded=${cmd//(#m)[^A-Za-z0-9_.~-]/%$(printf '%02X' "'$MATCH")}
  __jait_osc "E;$encoded"
  __jait_osc "C"
}

# Install hooks
autoload -Uz add-zsh-hook
add-zsh-hook precmd __jait_precmd
add-zsh-hook preexec __jait_preexec

# Append B marker after prompt
precmd_functions+=(__jait_precmd_end)
__jait_precmd_end() {
  # We inject B at end of PS1 via precmd since zsh evaluates PS1 each time
  PS1="${PS1}%{$(__jait_osc B)%}"
}
