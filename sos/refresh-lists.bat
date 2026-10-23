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
%PY% -c "import openpyxl" >nul 2>&1
if errorlevel 1 (
  echo Installing openpyxl for Approved Source List.xlsx...
  %PY% -m pip install openpyxl --quiet
)

echo Fetching DelDOT Approved Product Lists...
echo Pulling Approved Source List from the Geo Construction Test Report share when that path is reachable.
if exist "%FOLDER%\" (
  echo SOS Program folder:
  echo   %FOLDER%
  node sos\fetch-lists.js --dir "%FOLDER%"
) else (
  node sos\fetch-lists.js
)
set ERR=%ERRORLEVEL%
echo.
if /I not "%SOS_WATCH_NOPAUSE%"=="1" pause
exit /b %ERR%
