@echo off
title TECSOPS - Khoi dong may kho
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-warehouse-pc.ps1"
if errorlevel 1 (
  echo.
  echo [LOI] Khoi dong that bai. Kiem tra .env.tcs / .env.hub / .env.local
  pause
)
