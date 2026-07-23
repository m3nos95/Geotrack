@echo off
setlocal EnableExtensions
title DelDOT GeoTrak — import infil PDFs
color 0A
cd /d "%~dp0"

echo.
echo ============================================================
echo  DelDOT GeoTrak — Import borehole infiltration PDFs
echo ============================================================
echo  Folder: %CD%
echo.

if not exist "%~dp0import-infil-pdfs.py" (
  echo ERROR: import-infil-pdfs.py not found next to this .bat
  echo Put both files in your GeoTrak folder, then try again.
  echo.
  pause
  exit /b 1
)

set "INFIL_FOLDER=%~dp0infil-pdfs"
set "PROJECT=%~dp0"

if not exist "%INFIL_FOLDER%" (
  echo Creating infil-pdfs folder...
  mkdir "%INFIL_FOLDER%"
  echo.
  echo Created:
  echo   %INFIL_FOLDER%
  echo.
  echo 1^) Put your DelDOT Borehole Infiltration Test PDF^(s^) in that folder
  echo 2^) Double-click this .bat again
  echo.
  pause
  exit /b 0
)

dir /b "%INFIL_FOLDER%\*.pdf" "%INFIL_FOLDER%\*.PDF" >nul 2>&1
if errorlevel 1 (
  echo infil-pdfs folder exists but has no PDF files:
  echo   %INFIL_FOLDER%
  echo.
  echo Drop DelDOT borehole infil PDF^(s^) there, then run this again.
  echo.
  pause
  exit /b 0
)

echo PDFs found in infil-pdfs\ — starting import...
echo.

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY where py >nul 2>&1 && set "PY=py"
if not defined PY (
  echo ERROR: Python not found on PATH.
  echo Install Python from https://www.python.org/downloads/
  echo Check "Add python.exe to PATH", then open a NEW Command Prompt and run:
  echo   pip install pypdf pyproj
  echo.
  pause
  exit /b 1
)

echo Using: %PY%
echo Installing/checking pypdf + pyproj (safe to re-run)...
%PY% -m pip install pypdf pyproj
if errorlevel 1 (
  echo.
  echo WARNING: pip install had an issue. Trying import anyway...
  echo.
)

echo.
%PY% "%~dp0import-infil-pdfs.py" "%INFIL_FOLDER%" --project "%PROJECT%" --merge
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo Import finished with error code %RC%.
) else (
  echo Done. Open project folder in GeoTrak so refs\infil_anchors.json loads.
  echo Then map-click near tests → Anchors.
)
echo.
pause
endlocal
exit /b %RC%
