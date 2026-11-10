@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js nije instaliran. Instalirajte Node.js LTS.
 pause
 exit /b 1
)
if not exist "node_modules" (
 echo Instalacija zavisnosti (internet je potreban samo prvi put)...
 call npm install
 if errorlevel 1 (pause & exit /b 1)
)
echo AutoDesk: http://localhost:3000
start "" "http://localhost:3000"
node server.js
pause
