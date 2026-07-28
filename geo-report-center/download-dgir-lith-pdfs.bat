@echo off
setlocal EnableExtensions
title DelDOT GeoTrak - download DGS lith PDFs
color 0A

cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: could not cd to the GeoTrak folder.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  DelDOT GeoTrak - Download DGS lithologic boring PDFs
echo ============================================================
echo  Folder: %CD%
echo.
echo  Reads refs\dgir_wells.json and downloads each lith_pdf
echo  into dgir-lith-pdfs\  (resume-safe — skips existing files).
echo.
echo  Expect ~3,000+ PDFs and several GB. Keep laptop plugged in.
echo  Optional: add --parse to also build refs\dgir_lith_parsed.json
echo.

if not exist "refs\dgir_wells.json" (
  echo ERROR: Missing refs\dgir_wells.json
  echo Run download-dgir-wells.bat first.
  pause
  exit /b 1
)

if not exist "download-dgir-lith-pdfs.py" (
  echo ERROR: download-dgir-lith-pdfs.py not found in:
  echo   %CD%
  pause
  exit /b 1
)

if not exist "dgir-lith-pdfs" mkdir "dgir-lith-pdfs"

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
echo Starting download (Ctrl+C to stop — safe to re-run later)...
echo.

%PY% download-dgir-lith-pdfs.py %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Finished with error code %RC%.
) else (
  echo Done. PDFs in dgir-lith-pdfs\
  echo Manifest: refs\dgir_lith_download_manifest.json
  echo.
  echo To parse DelDOT boring text into JSON, run:
  echo   download-dgir-lith-pdfs.bat --parse-only
  echo or:
  echo   download-dgir-lith-pdfs.bat --parse
)
echo.
pause
endlocal
exit /b %RC%
