@echo off
title EPFT Auto Start
cd /d "C:\Users\SUNBEST- HR\OneDrive\Desktop\EPFF\epft-clean"

:: Start backend minimized
start "EPFT Backend" /min cmd /c "cd /d backend && npm run dev"

:: Start frontend minimized
start "EPFT Frontend" /min cmd /c "cd /d frontend && npm run dev -- --host"

exit
