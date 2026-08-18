@echo off
setlocal EnableExtensions
REM Refresh DelDOT Approved Product Lists (public PDFs) and pick up the office Aggregate Chart.
cd /d "%~dp0.."

set "FOLDER=%~1"
if "%FOLDER%"=="" set "FOLDER=%SOS_PROGRAM_DIR%"
if "%FOLDER%"=="" set "FOLDER=C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install LTS from https://nodejs.org
  pause
  exit /b 1
)

set "PY=python"
where python >nul 2>&1
if errorlevel 1 (
  set "PY=py -3"
)

%PY% -c "import pypdf" >nul 2>&1
if errorlevel 1 (
  echo Installing pypdf...
  %PY% -m pip install pypdf --quiet
)

echo Fetching DelDOT Approved Product Lists...
if exist "%FOLDER%\" (
  echo Also scanning for the Aggregate Chart in:
  echo   %FOLDER%
  node sos\fetch-lists.js --dir "%FOLDER%"
) else (
  node sos\fetch-lists.js
)
set ERR=%ERRORLEVEL%
echo.
pause
exit /b %ERR%
