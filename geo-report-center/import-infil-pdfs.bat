@echo off
REM Import DelDOT M&R Borehole Infiltration Test PDFs → refs\infil_anchors.json
REM
REM Setup (once):
REM   pip install pypdf pyproj
REM
REM 1) Drop PDF(s) into infil-pdfs\  (or edit INFIL_FOLDER)
REM 2) Double-click this file
REM 3) Open project folder in GeoTrak so refs\infil_anchors.json loads

cd /d "%~dp0"
set INFIL_FOLDER=%~dp0infil-pdfs
set PROJECT=%~dp0

if not exist "%INFIL_FOLDER%" (
  echo Create folder and drop DelDOT borehole infil PDF(s) there:
  echo   %INFIL_FOLDER%
  mkdir "%INFIL_FOLDER%"
  pause
  exit /b 1
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  python "%~dp0import-infil-pdfs.py" "%INFIL_FOLDER%" --project "%PROJECT%" --merge
) else (
  py "%~dp0import-infil-pdfs.py" "%INFIL_FOLDER%" --project "%PROJECT%" --merge
)
echo.
echo Then in GeoTrak: Open project folder → map click near tests → Infil / Anchors.
pause
