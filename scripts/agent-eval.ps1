#Requires -Version 7.0
[CmdletBinding()]
param(
  [switch]$Run,
  [switch]$List,
  [string]$Model,
  [string]$JudgeModel,
  [string]$Gateway = 'http://127.0.0.1:8000',
  [string[]]$Tasks,
  [ValidateRange(1, 8)][int]$Concurrency = 3,
  [ValidateRange(1, 20)][int]$Repeat = 1,
  [ValidateRange(1, 3600)][int]$TimeoutSeconds = 300,
  [ValidateRange(1, 1000)][int]$MaxToolCalls = 60,
  [string]$ReasoningEffort,
  [string]$Suite,
  [string]$OutputDirectory,
  [string]$ReportPath,
  [switch]$SharedWorkspace
)
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'agent-eval.ts'
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { throw 'Bun is required. Run from a Jait source checkout with dependencies installed.' }
$cliArgs = @('run', $runner, '--gateway', $Gateway, '--concurrency', "$Concurrency", '--repeat', "$Repeat",
  '--timeout', "$TimeoutSeconds", '--max-tool-calls', "$MaxToolCalls")
if ($ReportPath) {
  if ($Run) { throw '-ReportPath cannot be combined with -Run.' }
  $cliArgs += @('--report', $ReportPath)
}
elseif ($List -or -not $Run) { $cliArgs += '--list' }
else {
  if (-not $Model) { throw 'Specify -Model for a paid run. Without -Run, this script only lists tasks.' }
  if (-not $env:JAIT_EVAL_TOKEN) { throw 'Set JAIT_EVAL_TOKEN to your Jait login token before using -Run.' }
  $cliArgs += @('--run', '--model', $Model)
}
if ($JudgeModel) { $cliArgs += @('--judge-model', $JudgeModel) }
if ($Tasks) { $cliArgs += @('--tasks', ($Tasks -join ',')) }
if ($ReasoningEffort) { $cliArgs += @('--reasoning-effort', $ReasoningEffort) }
if ($Suite) { $cliArgs += @('--suite', $Suite) }
if ($OutputDirectory) { $cliArgs += @('--output', $OutputDirectory) }
if ($SharedWorkspace) { $cliArgs += '--shared-workspace' }
$states = @{}
$started = Get-Date
Write-Host ''
Write-Host '  JAIT PROVIDER EVALUATIONS' -ForegroundColor Cyan
Write-Host "  Workers: $Concurrency   Repetitions: $Repeat   Model: $Model   Judge: $(if ($JudgeModel) { $JudgeModel } else { $Model })"
Write-Host '  Task results and tool-process findings are scored separately.'
Write-Host ''
& bun @cliArgs | ForEach-Object {
  try { $update = $_ | ConvertFrom-Json -AsHashtable }
  catch { Write-Host $_ -ForegroundColor DarkGray; return }
  $id = $update.id
  switch ($update.state) {
    'format_retry' { Write-Host "  $id Judge format retry: $($update.message)" -ForegroundColor Yellow }
    'plan' {
      foreach ($job in $update.jobs) { $states[$job.id] = 'queued' }
      Write-Host "  $($states.Count) runs queued." -ForegroundColor DarkGray
    }
    'listed' { Write-Host ("  {0,-28} {1}" -f $id, $update.title) }
    'started' {
      $states[$id] = "$($update.role) running"
      Write-Host ("  [{0}] {1,-28} {2} started" -f (Get-Date -Format HH:mm:ss), $id, $update.role) -ForegroundColor Cyan
    }
    'event' {
      $event = $update.event
      if ($event.type -eq 'tool_start') {
        Write-Host ("    {0,-28} {1}: {2}" -f $id, $update.role, $event.tool) -ForegroundColor DarkCyan
      } elseif ($event.type -eq 'tool_result') {
        $color = if ($event.ok) { 'DarkGreen' } else { 'Yellow' }
        Write-Host ("    {0,-28} {1} {2}" -f $id, $(if ($event.ok) { 'OK' } else { 'TOOL FAILED' }), $event.tool) -ForegroundColor $color
      } elseif ($event.type -eq 'approval_required') {
        Write-Host "    $id requires approval in Jait; this run will stop." -ForegroundColor Yellow
      }
    }
    'finished' {
      $states[$id] = $update.status
      $color = switch ($update.status) { 'pass' { 'Green' } 'issues' { 'Yellow' } default { 'Red' } }
      Write-Host ("  {0,-7} {1,-28} {2}" -f $update.status.ToUpper(), $id, $update.summary) -ForegroundColor $color
      foreach ($finding in $update.findings) {
        Write-Host "    $($finding.category): $($finding.message) [calls: $($finding.callIds -join ', ')]" -ForegroundColor Yellow
      }
    }
    'summary' {
      Write-Host ''
      Write-Host ("  PASS {0}   ISSUES {1}   FAIL {2}   ERROR {3}   Elapsed {4:n0}s" -f $update.counts.pass,
        $update.counts.issues, $update.counts.fail, $update.counts.error, ((Get-Date) - $started).TotalSeconds)
      Write-Host "  Reports: $($update.output)" -ForegroundColor Cyan
    }
    'fatal' { Write-Host $update.message -ForegroundColor Red }
    'cancel_error' { Write-Host $update.message -ForegroundColor Red }
    'cancelling' { Write-Host 'Cancelling active Jait sessions...' -ForegroundColor Yellow }
    'help' { Write-Host $update.message }
  }
  if ($states.Count -gt 0) {
    $finished = @($states.Values | Where-Object { $_ -in @('pass', 'issues', 'fail', 'error') }).Count
    $active = @($states.GetEnumerator() | Where-Object { $_.Value -like '*running' } | ForEach-Object { "$($_.Key): $($_.Value)" })
    Write-Progress -Activity 'Jait provider evaluation' -Status "$finished / $($states.Count) complete. $($active -join '; ')" -PercentComplete ([int](100 * $finished / $states.Count))
  }
}
$runnerExitCode = $LASTEXITCODE
Write-Progress -Activity 'Jait provider evaluation' -Completed
exit $runnerExitCode
