@echo off
chcp 65001 >nul
title Inthara Smart Water ERP
cd /d "d:\13. Antigravity\Sunan\Inthara_program_develop"
echo กำลังเปิดระบบ Inthara Smart Water ERP...
start http://localhost:3080
node server.js
