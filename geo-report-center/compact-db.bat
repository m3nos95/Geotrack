@echo off
REM Shrink db.json (remove pretty-print whitespace) so the map can load thousands of borings.

set DB_PATH=%~dp0db.json

if not exist "%DB_PATH%" (
  echo No db.json found at:
  echo   %DB_PATH%
  echo Run import-geo-zips.bat first.
  pause
  exit /b 1
)

python "%~dp0compact-db.py" "%DB_PATH%"
echo.
echo Next: open Geo_Report_Center.html and click Open project folder again.
pause
