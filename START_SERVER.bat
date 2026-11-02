@echo off
chcp 65001 >nul
title Inthara Smart Water ERP + Cloud Server
cd /d "d:\13. Antigravity\Sunan\Inthara_program_develop"
echo ========================================================
echo   กำลังเริ่มต้นระบบ Inthara Smart Water ERP...
echo   เปิดเว็บใช้งานภายในเครื่อง: http://localhost:3080
echo ========================================================

start "" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3080
start http://localhost:3080
node server.js
