@echo off
setlocal EnableExtensions
REM Pull SOS attachments from Outlook and write completed letters.
REM Default: one pass (use Task Scheduler every 30 minutes).
REM   watch-sos-inbox.bat --loop     keep running every 30 minutes
REM   watch-sos-inbox.bat --once     one pass (same as default)

cd /d "%~dp0.."

set "LOOP="
if /I "%~1"=="--loop" set "LOOP=1"
if /I "%~1"=="--once" set "LOOP="

set "FOLDER=%SOS_PROGRAM_DIR%"
if "%FOLDER%"=="" set "FOLDER=C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program"
set "CONFIG=%~dp0SOS-watch.json"
if not exist "%CONFIG%" set "CONFIG=%~dp0SOS-watch.example.json"

if exist "%~dp0SOS-watch.json" (
  for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-Content -Raw '%~dp0SOS-watch.json' | ConvertFrom-Json).programDir"`) do if not "%%I"=="" set "FOLDER=%%I"
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install LTS from https://nodejs.org
  if not defined LOOP pause
  exit /b 1
)

set "PY=python"
where python >nul 2>&1
if errorlevel 1 set "PY=py -3"
%PY% -c "import xlrd,pypdf" >nul 2>&1
if errorlevel 1 (
  echo Installing xlrd and pypdf for this user...
  %PY% -m pip install "xlrd==1.2.0" pypdf --quiet
)

:runpass
echo.
echo [%DATE% %TIME%] Pulling Outlook attachments...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outlook-pull.ps1" -Config "%CONFIG%"
if errorlevel 1 (
  echo Outlook pull failed. Is Outlook desktop installed and signed in?
)

echo Processing SOS forms...
node sos\watch-inbox.js --config "%CONFIG%" --dir "%FOLDER%"
if defined LOOP (
  echo Sleeping 30 minutes. Ctrl+C to stop.
  timeout /t 1800 /nobreak >nul
  goto runpass
)

echo.
echo Done. Completed letters are under the SOS Program\completed folder ^(ready vs needs-review^).
if not defined LOOP if /I not "%SOS_WATCH_NOPAUSE%"=="1" pause
exit /b 0
