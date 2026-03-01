# Jait Terminal Shell Integration — PowerShell
# Emits OSC 633 sequences so the host can detect prompt boundaries,
# command start / finish, exit codes, and the current working directory.
#
# Protocol (compatible with VS Code terminal shell integration):
#   ESC]633;A BEL   — Prompt start
#   ESC]633;B BEL   — Prompt end (command line ready)
#   ESC]633;C BEL   — Command execution started
#   ESC]633;D;{exit} BEL — Command finished with exit code
#   ESC]633;E;{cmd} BEL  — The command line text (best-effort)
#   ESC]633;P;Cwd={cwd} BEL — Current working directory

# Guard against double-sourcing
if ($env:JAIT_SHELL_INTEGRATION -eq '1') { return }
$env:JAIT_SHELL_INTEGRATION = '1'

# ESC and BEL characters — compatible with PowerShell 5.1+
$Global:__JaitESC = [char]0x1b
$Global:__JaitBEL = [char]0x07

function Global:__JaitOSC([string]$Payload) {
    return "$Global:__JaitESC]633;$Payload$Global:__JaitBEL"
}

# Store the original prompt (if any)
$Global:__JaitOrigPrompt = $function:prompt

function Global:prompt {
    $exitCode = $global:LASTEXITCODE

    # D — previous command finished with exit code
    $out = (__JaitOSC "D;$exitCode")

    # P — current working directory
    $out += (__JaitOSC "P;Cwd=$($PWD.Path)")

    # A — prompt start
    $out += (__JaitOSC "A")

    # Original prompt text (or default)
    if ($Global:__JaitOrigPrompt) {
        $out += & $Global:__JaitOrigPrompt
    } else {
        $out += "PS $($PWD.Path)> "
    }

    # B — prompt end / command-line ready
    $out += (__JaitOSC "B")

    # Preserve exit code so user scripts see it unchanged
    $global:LASTEXITCODE = $exitCode
    return $out
}

# Hook Enter key via PSReadLine to emit C (command started) + E (command text)
if (Get-Module -Name PSReadLine -ErrorAction SilentlyContinue) {
    Set-PSReadLineKeyHandler -Key Enter -ScriptBlock {
        $line = $null
        $cursor = $null
        [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)

        # E — command text (URI-encode to keep it on one OSC line)
        $encoded = [Uri]::EscapeDataString($line)
        [Console]::Write("$Global:__JaitESC]633;E;$encoded$Global:__JaitBEL")

        # C — execution started
        [Console]::Write("$Global:__JaitESC]633;C$Global:__JaitBEL")

        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
    }
}
