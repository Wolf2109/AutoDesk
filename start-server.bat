
@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node

if not exist "node_modules\" goto install_deps
goto start_server

:install_deps
echo Instalacija zavisnosti (internet je potreban samo prvi put)...
call npm install
if errorlevel 1 goto error_exit

:start_server
echo AutoDesk: http://localhost:3000
start "" "http://localhost:3000"
node server.js
pause
exit /b 0

:no_node
echo Node.js nije instaliran. Instalirajte Node.js LTS.
pause
exit /b 1

:error_exit
echo Greska prilikom instalacije zavisnosti.
pause
exit /b 1
