@echo off
chcp 65001 >nul
title Inthara Smart Water ERP Server
cd /d "d:\13. Antigravity\Sunan\Inthara_program_develop"
echo ========================================================
echo   กำลังเริ่มต้นระบบ Inthara Smart Water ERP...
echo   เปิดเว็บเบราว์เซอร์ที่: http://localhost:3080
echo ========================================================
start http://localhost:3080
node server.js
pause
