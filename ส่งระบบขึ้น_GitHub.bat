@echo off
chcp 65001 >nul
title ส่งระบบน้ำดื่มอินธาราขึ้น GitHub (sunantana/inthara-smart-water)
cd /d "d:\13. Antigravity\Sunan\Inthara_program_develop"
echo ========================================================
echo   กำลังส่งโค้ดระบบ Inthara Smart Water ขึ้น GitHub...
echo   เป้าหมาย: https://github.com/sunantana/inthara-smart-water.git
echo ========================================================
echo.
echo * หมายเหตุ: หากมีหน้าต่างเด้งขึ้นมาถามการเข้าสู่ระบบ GitHub 
echo   ให้กดปุ่ม "Sign in with your browser" เพื่อยืนยันสิทธิ์
echo.
git push -u origin main
echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo   [สำเร็จ] ส่งโค้ดขึ้น GitHub เรียบร้อยแล้ว!
    echo   ขั้นตอนต่อไป: ไปที่ Render.com เพื่อกด Deploy ได้ทันที
    echo ========================================================
) else (
    echo ========================================================
    echo   [พบข้อผิดพลาด] กรุณาตรวจสอบการเข้าสู่ระบบ GitHub
    echo ========================================================
)
echo.
pause
