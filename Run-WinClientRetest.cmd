@echo off
setlocal
pushd "%~dp0" >nul
set "pwshExe=pwsh.exe"
where pwsh.exe >nul 2>nul
if errorlevel 1 set "pwshExe=powershell.exe"
"%pwshExe%" -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-windows-client-browser.ps1 -Discover -PromptPassword -RequirePassword -RequireH264 -BoardSummary -TimeoutMs 45000 %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows client real retest failed with exit code %exitCode%.
  echo Try: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\check-windows-resume-status.ps1 -CheckBoard -BoardSummary
  echo.
  pause
)
exit /b %exitCode%