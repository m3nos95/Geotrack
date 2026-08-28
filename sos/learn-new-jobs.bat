@echo off
setlocal EnableExtensions
REM Learn from SOS Program\jobs\ training packs only (submittal + program-output + issued.pdf).
REM Does not rescan the thousands of issued-letter PDFs. Merges into existing SOS-*.json.
REM Default folder is Aaron's Desktop SOS Program.

cd /d "%~dp0.."

set "FOLDER=%~1"
if "%FOLDER%"=="" set "FOLDER=%SOS_PROGRAM_DIR%"
if "%FOLDER%"=="" set "FOLDER=C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program"

if not exist "%FOLDER%\" (
  echo Folder not found:
  echo   %FOLDER%
  echo.
  echo Drag the SOS Program folder onto this file, or edit the path in sos\learn-new-jobs.bat
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
echo Training packs only:
echo   %FOLDER%\jobs
echo.
echo This does not read the full issued-letter dump. New packs are merged into SOS-language.json /
echo SOS-libraries.json / SOS-cc.json that are already in that folder.
echo.

node sos\corpus-learn.js --dir-only --jobs-only --dir "%FOLDER%"
set ERR=%ERRORLEVEL%
echo.
echo Drop SOS-language.json on APL / Chart, SOS-libraries.json on Source Library, SOS-cc.json on CC.
echo.
pause
exit /b %ERR%
