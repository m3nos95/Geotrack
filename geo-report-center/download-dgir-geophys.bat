@echo off
setlocal EnableExtensions
title DelDOT GeoTrak - download DGS geophys CSVs + zones
color 0A

cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: could not cd to the GeoTrak folder.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  DelDOT GeoTrak - DGS geophys CSV download + coarse/fine zones
echo ============================================================
echo  Folder: %CD%
echo.
echo  Reads refs\dgir_wells.json and downloads each geophys_csv
echo  into dgir-geophys-csv\  (resume-safe), then builds
echo  refs\dgir_geophys_zones.json  (coarse / mixed / fine screening).
echo.
echo  Expect ~2,200 CSVs. Optional flags:
echo    --limit 25       smoke test
echo    --zones-only     reuse existing CSVs
echo    --download-only  skip zone build
echo.

if not exist "refs\dgir_wells.json" (
  echo ERROR: Missing refs\dgir_wells.json
  echo Run download-dgir-wells.bat first.
  pause
  exit /b 1
)

if not exist "download-dgir-geophys.py" (
  echo ERROR: download-dgir-geophys.py not found in:
  echo   %CD%
  pause
  exit /b 1
)

if not exist "dgir-geophys-csv" mkdir "dgir-geophys-csv"

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py"
if not defined PY (
  echo ERROR: Python not found on PATH.
  pause
  exit /b 1
)

echo Using: %PY%
echo.
echo Starting (Ctrl+C to stop — safe to re-run later)...
echo.

%PY% download-dgir-geophys.py %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Finished with error code %RC%.
) else (
  echo Done.
  echo   CSVs:   dgir-geophys-csv\
  echo   Zones:  refs\dgir_geophys_zones.json
  echo   Manifest: refs\dgir_geophys_download_manifest.json
)
echo.
pause
endlocal
exit /b %RC%
