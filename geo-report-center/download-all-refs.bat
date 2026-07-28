@echo off
REM Download full Delaware FirstMap / DNREC reference pack into refs\
REM Double-click or run from Ultimate Geo Program folder.
cd /d "%~dp0"
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python download-all-refs.py --project .
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0download-all-refs.ps1"
)
echo.
pause
