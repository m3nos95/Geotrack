@echo off
REM Bulk-import GEOSYSTEM *.GEO.zip files into db.json
REM
REM Setup (once):
REM   pip install pyproj
REM
REM Edit the two paths below, then double-click this file.

set ZIP_FOLDER=%~dp0geo-zips
set DB_PATH=%~dp0db.json

if not exist "%ZIP_FOLDER%" (
  echo Create folder and drop your *.GEO.zip files there:
  echo   %ZIP_FOLDER%
  mkdir "%ZIP_FOLDER%"
  pause
  exit /b 1
)

python "%~dp0import-geo-zips.py" "%ZIP_FOLDER%" "%DB_PATH%" --merge
pause
