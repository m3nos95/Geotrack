@echo off
setlocal EnableExtensions
title DelDOT GeoTrak - import infil PDFs
color 0A

REM Always run from this .bat's folder (handles spaces in OneDrive paths)
cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: could not cd to the GeoTrak folder.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  DelDOT GeoTrak - Import borehole infiltration PDFs
echo ============================================================
echo  Folder: %CD%
echo.

if not exist "import-infil-pdfs.py" (
  echo ERROR: import-infil-pdfs.py not found in:
  echo   %CD%
  echo Put import-infil-pdfs.py next to this .bat, then try again.
  echo.
  pause
  exit /b 1
)

if not exist "infil-pdfs" (
  echo Creating infil-pdfs folder...
  mkdir "infil-pdfs"
  echo.
  echo Created: %CD%\infil-pdfs
  echo.
  echo 1^) Put your DelDOT Borehole Infiltration Test PDF^(s^) in that folder
  echo 2^) Double-click this .bat again
  echo.
  pause
  exit /b 0
)

dir /b "infil-pdfs\*.pdf" >nul 2>&1
if errorlevel 1 (
  echo infil-pdfs folder exists but has no PDF files:
  echo   %CD%\infil-pdfs
  echo.
  echo Drop DelDOT borehole infil PDF^(s^) there, then run this again.
  echo.
  pause
  exit /b 0
)

echo PDFs found in infil-pdfs\ - starting import...
echo.

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py"
if not defined PY (
  echo ERROR: Python not found on PATH.
  echo Install Python and check "Add python.exe to PATH".
  echo Then run:  python -m pip install pypdf pyproj
  echo.
  pause
  exit /b 1
)

echo Using: %PY%
echo Installing/checking pypdf + pyproj (safe to re-run)...
%PY% -m pip install pypdf pyproj
echo.

REM Relative paths only — avoids Windows \" quoting bugs with spaces + trailing \
echo Project: %CD%
echo PDFs:    %CD%\infil-pdfs
echo.
%PY% import-infil-pdfs.py infil-pdfs --project . --merge
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Import finished with error code %RC%.
) else (
  echo Done. Open project folder in GeoTrak so refs\infil_anchors.json loads.
  echo Then map-click near tests - Anchors.
)
echo.
pause
endlocal
exit /b %RC%
