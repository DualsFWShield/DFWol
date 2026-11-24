@echo off
title DFWol Studio - Serveur Local & Proxy WOL/JW
cd /d "%~dp0"
echo Demarrage de DFWol Studio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dfwol.ps1"
pause
