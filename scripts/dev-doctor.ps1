$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$electronCmd = Join-Path $repoRoot 'node_modules\.bin\electron.cmd'
$nativeCheckScript = Join-Path $PSScriptRoot 'dev-electron-native-check.cjs'

Write-Host '[doctor] repo:' $repoRoot

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is not installed or not on PATH.'
}

$pnpmVersion = (& pnpm --version).Trim()
Write-Host '[doctor] pnpm:' $pnpmVersion

if (-not (Test-Path $electronCmd)) {
  throw 'Electron binary not found. Run pnpm install in this repo first.'
}

$electronVersion = (& $electronCmd --version).Trim()
Write-Host '[doctor] electron:' $electronVersion

Write-Host '[doctor] checking native Electron modules...'
& $electronCmd $nativeCheckScript
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[doctor] Native module check failed.' -ForegroundColor Red
  Write-Host '[doctor] This usually means better-sqlite3 or node-pty was built for plain Node instead of Electron.' -ForegroundColor Yellow
  Write-Host '[doctor] Try:' -ForegroundColor Yellow
  Write-Host '  1. Use the DAEMON Pro worktree only for Pro/Arena dev'
  Write-Host '  2. Avoid pnpm rebuild for native modules unless targeting Electron'
  Write-Host '  3. Run pnpm install to restore repo-managed native binaries'
  exit 1
}

Write-Host '[doctor] native modules: ok' -ForegroundColor Green

$proApiBase = $env:DAEMON_PRO_API_BASE
if ([string]::IsNullOrWhiteSpace($proApiBase)) {
  $proApiBase = 'https://daemon-pro-api-production.up.railway.app'
}
Write-Host '[doctor] pro api base:' $proApiBase

$proDevBypass = $env:DAEMON_PRO_DEV_BYPASS
if ([string]::IsNullOrWhiteSpace($proDevBypass)) {
  $proDevBypass = '0'
}
Write-Host '[doctor] pro dev bypass:' $proDevBypass
