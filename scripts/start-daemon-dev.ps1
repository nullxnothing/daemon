$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$doctorScript = Join-Path $PSScriptRoot 'dev-doctor.ps1'
$defaultProApiBase = 'https://daemon-pro-api-production.up.railway.app'

function Test-RepoProcess([string]$match) {
  $escapedRepo = [regex]::Escape($repoRoot)
  $escapedMatch = [regex]::Escape($match)
  $procs = Get-CimInstance Win32_Process -Filter "name = 'pwsh.exe' OR name = 'powershell.exe' OR name = 'node.exe'" |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $escapedRepo -and
      $_.CommandLine -match $escapedMatch
    }

  return @($procs).Count -gt 0
}

& $doctorScript
if ($LASTEXITCODE -ne 0) {
  throw 'DAEMON dev doctor failed. Fix the reported issue before starting the app.'
}

if (-not (Test-RepoProcess 'pnpm dev')) {
  Start-Process pwsh -WorkingDirectory $repoRoot -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$repoRoot'; `$Host.UI.RawUI.WindowTitle = 'DAEMON Dev'; if (-not `$env:DAEMON_PRO_API_BASE) { `$env:DAEMON_PRO_API_BASE = '$defaultProApiBase' }; if (-not `$env:DAEMON_PRO_DEV_BYPASS) { `$env:DAEMON_PRO_DEV_BYPASS = '1' }; pnpm dev"
  )
} else {
  Write-Host '[launcher] Dev process already running for this repo. Skipping duplicate start.' -ForegroundColor Yellow
}

$startTypecheck = $env:DAEMON_DEV_TYPECHECK -eq '1'
if ($startTypecheck) {
  if (-not (Test-RepoProcess 'typecheck:watch')) {
    Start-Process pwsh -WorkingDirectory $repoRoot -ArgumentList @(
      '-NoExit',
      '-Command',
      "Set-Location '$repoRoot'; `$Host.UI.RawUI.WindowTitle = 'DAEMON Typecheck'; pnpm typecheck:watch"
    )
  } else {
    Write-Host '[launcher] Typecheck watcher already running for this repo. Skipping duplicate start.' -ForegroundColor Yellow
  }
} else {
  Write-Host '[launcher] Skipping typecheck watcher. Set DAEMON_DEV_TYPECHECK=1 to enable it.' -ForegroundColor DarkGray
}
