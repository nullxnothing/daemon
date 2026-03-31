$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

Start-Process pwsh -WorkingDirectory $repoRoot -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$repoRoot'; `$Host.UI.RawUI.WindowTitle = 'DAEMON Dev'; npm run dev"
)

Start-Process pwsh -WorkingDirectory $repoRoot -ArgumentList @(
  '-NoExit',
  '-Command',
  "Set-Location '$repoRoot'; `$Host.UI.RawUI.WindowTitle = 'DAEMON Typecheck'; npm run typecheck:watch"
)
