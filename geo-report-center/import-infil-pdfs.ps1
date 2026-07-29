# Import DelDOT M&R Borehole Infiltration Test PDFs → refs/infil_anchors.json
# Right-click → Run with PowerShell, or:
#   powershell -ExecutionPolicy Bypass -File .\import-infil-pdfs.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host ''
Write-Host '============================================================'
Write-Host ' DelDOT GeoTrak - Import borehole infiltration PDFs'
Write-Host '============================================================'
Write-Host " Folder: $PWD"
Write-Host ''

if (-not (Test-Path -LiteralPath '.\import-infil-pdfs.py')) {
  Write-Host 'ERROR: import-infil-pdfs.py not found next to this script.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

if (-not (Test-Path -LiteralPath '.\infil-pdfs')) {
  New-Item -ItemType Directory -Path '.\infil-pdfs' | Out-Null
  Write-Host "Created: $PWD\infil-pdfs"
  Write-Host 'Put DelDOT borehole infil PDF(s) in that folder, then run again.'
  Read-Host 'Press Enter to close'
  exit 0
}

$pdfs = Get-ChildItem -LiteralPath '.\infil-pdfs' -Filter '*.pdf' -File -ErrorAction SilentlyContinue
if (-not $pdfs -or $pdfs.Count -eq 0) {
  Write-Host "No PDFs in: $PWD\infil-pdfs" -ForegroundColor Yellow
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
  Write-Host 'Then: python -m pip install pypdf pyproj'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host "Using: $py"
Write-Host 'Checking pypdf + pyproj...'
& $py -m pip install pypdf pyproj
Write-Host ''
Write-Host "Project: $PWD"
Write-Host ''
# Relative paths avoid Windows quoting bugs with spaces
& $py '.\import-infil-pdfs.py' '.\infil-pdfs' --project '.' --merge
$code = $LASTEXITCODE
Write-Host ''
if ($code -ne 0) {
  Write-Host "Import finished with error code $code" -ForegroundColor Red
} else {
  Write-Host 'Done. Open project folder in GeoTrak -> Anchors.' -ForegroundColor Green
}
Read-Host 'Press Enter to close'
exit $code
