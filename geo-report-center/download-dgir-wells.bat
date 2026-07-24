@echo off
setlocal EnableExtensions
title DelDOT GeoTrak - download DGS DGIR wells
color 0A

cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: could not cd to the GeoTrak folder.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  DelDOT GeoTrak - Download DGS DGIR well inventory
echo ============================================================
echo  Folder: %CD%
echo.
echo  Pulls DGS borehole lithologic + geophysical log headers
echo  from ArcGIS Online (NGGDPP / Borehole Log Mapper) into:
echo    refs\dgir_wells.json
echo.
echo  Classic DGIR GeoServer (maps.dgs.udel.edu) is tried only
echo  via those public AGOL mirrors when the host is down.
echo.

if not exist "download-dgir-wells.py" (
  echo ERROR: download-dgir-wells.py not found in:
  echo   %CD%
  pause
  exit /b 1
)

if not exist "refs" mkdir "refs"

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
%PY% download-dgir-wells.py --out refs\dgir_wells.json
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Download finished with error code %RC%.
) else (
  echo Done. Open project folder in GeoTrak so refs\dgir_wells.json loads.
  echo Map shows teal DGS markers; Site Intel - DGS lists nearby logs + PDF links.
)
echo.
pause
endlocal
exit /b %RC%
