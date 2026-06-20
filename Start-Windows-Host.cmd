@echo off
setlocal
pushd "%~dp0" >nul
set "pwshExe=pwsh.exe"
where pwsh.exe >nul 2>nul
if errorlevel 1 set "pwshExe=powershell.exe"
"%pwshExe%" -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 -PromptPassword -RequirePassword %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows host entry failed with exit code %exitCode%.
  echo Try: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-windows-host.ps1 -Status -CheckBoard -BoardSummary
  echo.
  pause
)
exit /b %exitCode%