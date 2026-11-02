@echo off
chcp 65001 >nul
title ศูนย์ควบคุมการเข้าใช้งานทุกระดับ (Maximum Security) - โรงงานน้ำดื่มอินธารา
cls
echo ============================================================================
echo   🛡️ INTHARA SMART WATER ERP — MAXIMUM SECURITY MULTI-LEVEL LAUNCHER
echo   โรงงานน้ำดื่มอินธารา (121 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์)
echo   ระบบความปลอดภัย: PBKDF2-SHA512 + 2FA PIN + Role-Based Access Control
echo ============================================================================
echo.
echo   กรุณาเลือกระดับผู้ใช้งานที่ต้องการเข้าสู่ระบบ:
echo.
echo   [1] 👑 ระดับที่ 1: ผู้บริหารสูงสุด / เจ้าของกิจการ (Executive / Owner)
echo   [2] 🏢 ระดับที่ 2: แอดมินโรงงาน / วางแผนจัดสายส่ง & บัญชี (Factory Admin)
echo   [3] 🔬 ระดับที่ 3: หัวหน้าฝ่ายผลิต & ควบคุมคุณภาพน้ำ (Production & QC)
echo   [4] 🔧 ระดับที่ 4: ช่างเทคนิค & ซ่อมบำรุงเครื่องจักร 16 เครื่อง (CMMS Tech)
echo   [5] 🚚 ระดับที่ 5: พนักงานขับรถส่งน้ำ & นำทาง GPS (GPS Driver)
echo   [6] 🌐 เปิดหน้าศูนย์รวมพอร์ทัลทุกระดับ (All-Levels Security Portal)
echo.
set /p choice="เลือกหมายเลข (1-6) [ค่าเริ่มต้น=6]: "

cd /d "%~dp0"
netstat -ano | findstr :3080 >nul
if errorlevel 1 (
  echo กำลังเปิดเซิร์ฟเวอร์ระบบรักษาความปลอดภัย Inthara ERP...
  start /min "" node server.js
  timeout /t 2 >nul
)

if "%choice%"=="1" start "" "http://localhost:3080/?role=executive" & exit
if "%choice%"=="2" start "" "http://localhost:3080/?role=admin" & exit
if "%choice%"=="3" start "" "http://localhost:3080/?role=production_qc" & exit
if "%choice%"=="4" start "" "http://localhost:3080/?role=technician" & exit
if "%choice%"=="5" start "" "http://localhost:3080/?role=driver" & exit

start "" "http://localhost:3080/portal.html"
exit
