@echo off
setlocal
cd /d "%~dp0"
echo PAZNJA: Prvo zaustavite AutoDesk server!
if not exist "data\backups\*.sqlite" (
 echo Nema rezervnih kopija.
 pause
 exit /b 1
)
dir /b /o-d "data\backups\*.sqlite"
set /p NAME=Unesite tacan naziv rezervne kopije sa liste: 
if not exist "data\backups\%NAME%" (echo Datoteka ne postoji. & pause & exit /b 1)
if not exist "data\autodesk.sqlite" (echo Baza nije pronadjena. & pause & exit /b 1)
copy /y "data\autodesk.sqlite" "data\pre-restore.sqlite" >nul
copy /y "data\backups\%NAME%" "data\autodesk.sqlite" >nul
if exist "data\autodesk.sqlite-wal" del "data\autodesk.sqlite-wal"
if exist "data\autodesk.sqlite-shm" del "data\autodesk.sqlite-shm"
echo Baza vracena. Pokrenite start-server.bat.
pause
