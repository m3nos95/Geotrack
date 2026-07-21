@echo off
REM Remove borings whose coordinates fall outside Delaware.

cd /d "%~dp0"
python "%~dp0purge-outside-de.py" "%~dp0db.json"
echo.
echo Re-open the project folder in Geo Report Center to refresh the map.
pause
