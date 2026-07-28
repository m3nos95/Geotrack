@echo off
REM Fix db.json so Chrome/Edge can load it (NaN cleanup + compact rewrite).

cd /d "%~dp0"
set DB_PATH=%~dp0db.json

if not exist "%DB_PATH%" (
  echo No db.json in this folder:
  echo   %DB_PATH%
  pause
  exit /b 1
)

python "%~dp0repair-db.py" "%DB_PATH%"
echo.
pause
