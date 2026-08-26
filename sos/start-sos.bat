@echo off
setlocal EnableExtensions
REM Open the SOS letter page with a local helper so "Pull chart from office share" can read
REM \\DOTFS01\Groups\Geo Construction Test Report\Reference Samples\Approved Source List.xlsx
cd /d "%~dp0.."

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

%PY% -c "import openpyxl" >nul 2>&1
if errorlevel 1 (
  echo Installing openpyxl for Approved Source List.xlsx...
  %PY% -m pip install openpyxl --quiet
)

echo Starting the SOS page helper on http://127.0.0.1:18765/
echo Leave this window open. In the page, open APL / Chart and click Pull chart from office share.
echo.
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:18765/deldot-sos.html"
node sos\fetch-lists.js --serve
set ERR=%ERRORLEVEL%
echo.
if /I not "%SOS_WATCH_NOPAUSE%"=="1" pause
exit /b %ERR%
