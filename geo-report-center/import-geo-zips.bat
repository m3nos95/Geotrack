@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  GeoSystem .GEO folder or GEO.zip -^> db.json
echo  The archive stays where it is. db.json is written beside it.
echo  A statewide pack is not copied into git or into LabTrak.
echo ============================================================
python import-geo-zips.py %*
if errorlevel 1 (
  echo FAILED — need Python 3 and Node.js. Point this at the .GEO folder or GEO.zip.
  pause
  exit /b 1
)
echo.
echo Open that folder as the GeoTrak project folder. The borings load from db.json.
pause
