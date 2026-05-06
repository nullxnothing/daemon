param(
  [string]$Output = "docs/frontier-demo.mp4",
  [int]$Seconds = 120
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is required for recording and was not found on PATH."
}

$resolvedOutput = Join-Path (Get-Location) $Output
$outputDir = Split-Path -Parent $resolvedOutput
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "Recording DAEMON Frontier demo to $resolvedOutput"
Write-Host "Duration: $Seconds seconds"
Write-Host "Flow: open project -> enable Solana/Helius MCP -> spawn agent -> create/fund task -> submit receipt -> approve/settle -> explorer link"
Write-Host "Start the UI flow now. Capture begins in 5 seconds."
Start-Sleep -Seconds 5

ffmpeg `
  -y `
  -f gdigrab `
  -framerate 30 `
  -draw_mouse 1 `
  -t $Seconds `
  -i desktop `
  -c:v libx264 `
  -preset veryfast `
  -pix_fmt yuv420p `
  $resolvedOutput

Write-Host "Recording written to $resolvedOutput"
