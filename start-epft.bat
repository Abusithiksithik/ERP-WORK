@echo off
title EPFT Auto Starter

echo Starting Backend...
start "EPFT Backend" cmd /k "cd /d C:\Users\SUNBEST- HR\OneDrive\Desktop\epft\backend && npm run dev"

timeout /t 8 >nul

echo Starting Frontend...
start "EPFT Frontend" cmd /k "cd /d C:\Users\SUNBEST- HR\OneDrive\Desktop\epft\frontend && npm run dev -- --host"

exit