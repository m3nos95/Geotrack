# Import DelDOT M&R Borehole Infiltration Test PDFs → refs/infil_anchors.json
# Right-click → Run with PowerShell, or from PowerShell:
#   .\import-infil-pdfs.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host ''
Write-Host '============================================================'
Write-Host ' DelDOT GeoTrak — Import borehole infiltration PDFs'
Write-Host '============================================================'
Write-Host " Folder: $PWD"
Write-Host ''

$pyScript = Join-Path $PSScriptRoot 'import-infil-pdfs.py'
if (-not (Test-Path $pyScript)) {
  Write-Host 'ERROR: import-infil-pdfs.py not found next to this script.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

$infilFolder = Join-Path $PSScriptRoot 'infil-pdfs'
# Use resolved path without a trailing backslash (safer for CLI args)
$project = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\')

if (-not (Test-Path $infilFolder)) {
  New-Item -ItemType Directory -Path $infilFolder | Out-Null
  Write-Host "Created: $infilFolder"
  Write-Host 'Put DelDOT borehole infil PDF(s) in that folder, then run again.'
  Read-Host 'Press Enter to close'
  exit 0
}

$pdfs = @(Get-ChildItem -Path $infilFolder -Filter *.pdf -File -ErrorAction SilentlyContinue)
$pdfs += @(Get-ChildItem -Path $infilFolder -Filter *.PDF -File -ErrorAction SilentlyContinue)
if ($pdfs.Count -eq 0) {
  Write-Host "No PDFs in: $infilFolder" -ForegroundColor Yellow
  Write-Host 'Drop PDF(s) there, then run again.'
  Read-Host 'Press Enter to close'
  exit 0
}

$py = $null
foreach ($c in @('python', 'py')) {
  if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break }
}
if (-not $py) {
  Write-Host 'ERROR: Python not found on PATH.' -ForegroundColor Red
  Write-Host 'Install Python and check "Add python.exe to PATH".'
  Write-Host 'Then: pip install pypdf pyproj'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "Using: $py"
Write-Host 'Checking pypdf + pyproj...'
& $py -m pip install pypdf pyproj
Write-Host ''
& $py $pyScript $infilFolder --project $project --merge
$code = $LASTEXITCODE
Write-Host ''
if ($code -ne 0) {
  Write-Host "Import finished with error code $code" -ForegroundColor Red
} else {
  Write-Host 'Done. Open project folder in GeoTrak → Anchors.' -ForegroundColor Green
}
Read-Host 'Press Enter to close'
exit $code
