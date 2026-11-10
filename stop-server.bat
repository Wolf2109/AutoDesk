@echo off
setlocal
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
 echo Zaustavljanje procesa na portu 3000: %%a
 taskkill /PID %%a /F
)
echo Gotovo.
pause
