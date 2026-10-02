@echo off
title ReturnGuard - keep this window open
cd /d "%~dp0"

echo.
echo  ===============================================
echo   Starting ReturnGuard...
echo   Your browser will open in a few seconds.
echo.
echo   KEEP THIS WINDOW OPEN while you use ReturnGuard.
echo   To stop ReturnGuard, just close this window.
echo  ===============================================
echo.

rem Stop any copy of ReturnGuard that is still running from before.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":4000 .*LISTENING" /c:":5173 .*LISTENING"') do taskkill /PID %%p /F >nul 2>&1

rem Open the browser once the app has had time to start.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:5173"

call npm run dev
