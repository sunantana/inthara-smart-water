@echo off
chcp 65001 >nul
echo ========================================================
echo   กำลังเปิดระบบ Inthara Smart Water ERP (โรงงานน้ำดื่มอินธารา)
echo   URL: http://localhost:3080
echo ========================================================
cd /d "%~dp0"
start "" "http://localhost:3080"
node server.js
pause
