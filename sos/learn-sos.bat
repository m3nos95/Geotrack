@echo off
setlocal EnableExtensions
REM Learn SOS letter rules from matched contractor forms + issued letters.
REM Default folder is Aaron's Desktop SOS Program. Drag another folder onto this bat to use it.

cd /d "%~dp0.."

set "FOLDER=%~1"
if "%FOLDER%"=="" set "FOLDER=%SOS_PROGRAM_DIR%"
if "%FOLDER%"=="" set "FOLDER=C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program"

if not exist "%FOLDER%\" (
  echo Folder not found:
  echo   %FOLDER%
  echo.
  echo Drag the SOS Program folder onto this file, or edit the path in sos\learn-sos.bat
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install LTS from https://nodejs.org then run this again.
  pause
  exit /b 1
)

set "PY=python"
where python >nul 2>&1
if errorlevel 1 (
  set "PY=py -3"
  where py >nul 2>&1
  if errorlevel 1 (
    echo Python is required to read .xls and PDF files.
    echo Install Python 3 from https://www.python.org and check "Add python.exe to PATH".
    pause
    exit /b 1
  )
)

%PY% -c "import xlrd,pypdf" >nul 2>&1
if errorlevel 1 (
  echo Installing xlrd and pypdf for this user...
  %PY% -m pip install "xlrd==1.2.0" pypdf --quiet
  if errorlevel 1 (
    echo pip install failed. Run:  %PY% -m pip install xlrd==1.2.0 pypdf
    pause
    exit /b 1
  )
)

echo.
echo SOS Program folder:
echo   %FOLDER%
echo.

node sos\corpus-learn.js --dir-only --dir "%FOLDER%"
set ERR=%ERRORLEVEL%
echo.
pause
exit /b %ERR%
