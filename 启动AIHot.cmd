@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-aihot.ps1"
if errorlevel 1 (
  echo.
  echo AIHot failed to start. Please check the message above.
  pause
)

endlocal
