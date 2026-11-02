@echo off
chcp 65001 >nul
title Push Inthara ERP to GitHub
cd /d "d:\13. Antigravity\Sunan\Inthara_program_develop"
echo ========================================================
echo   เตรียมส่งโค้ดระบบ Inthara Smart Water ERP ขึ้น GitHub
echo ========================================================
echo.
set /p REPO_URL="กรุณาวาง URL ของ GitHub Repository (เช่น https://github.com/username/inthara-erp.git): "
if "%REPO_URL%"=="" (
    echo ไม่ได้ระบุ URL ยกเลิกการทำงาน
    pause
    exit /b
)
git remote remove origin 2>nul
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main
echo.
echo ========================================================
echo   ส่งโค้ดขึ้น GitHub เรียบร้อยแล้ว!
echo   สามารถนำไปเชื่อมต่อกับ Render.com หรือ Railway ได้ทันที
echo ========================================================
pause
