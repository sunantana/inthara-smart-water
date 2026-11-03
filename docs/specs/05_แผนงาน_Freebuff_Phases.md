# 05 — แผนงานสำหรับ Freebuff: แบ่ง 10 Phase พร้อม Prompt สั่งงาน

**วิธีใช้:** ทำทีละ Phase — คัดลอก "Prompt" ของ Phase นั้นไปวางใน Freebuff ใน repo ใหม่ (สร้าง repo `inthara-erp-v2` ก่อนเริ่ม Phase 0) เมื่อ Freebuff บอกเสร็จ → ส่ง Phase นั้นให้ Antigravity ตรวจตามไฟล์ 06 → ผ่าน gate แล้วค่อย Phase ถัดไป

**กฎเหล็กใส่ท้าย prompt ทุกครั้ง (คัดลอกต่อท้าย):**

```
กฎเหล็ก:
- อ่าน 00_README_ภาพรวม.md, 02_สถาปัตยกรรมระบบ.md ให้ครบก่อนเริ่ม แล้วทำตาม coding conventions ทุกข้อ
- ยึด 01_SRS / 03_DB_Schema / 04_API_Spec เป็นความจริง ถ้าเอกสารขัดกันหรือไม่ชัด หยุดแล้วถามก่อน ห้ามเดา
- ห้าม commit ไฟล์ใน data/ backups/ .env และห้ามใส่รหัสผ่าน/secret ใดๆ ในโค้ด
- เขียน test ให้ฟังก์ชันที่ระบุก่อนเสร็จ Phase และรัน npm test ให้ผ่าน 100% ก่อนส่งมอบ
- ส่งมอบด้วยการสรุป: สร้างไฟล์อะไรบ้าง, endpoint/test อะไรผ่านแล้ว, มีอะไรที่ยังติดขัด
```

---

## Phase 0 — โครงร่างโปรเจกต์ + ฐานข้อมูล

**เป้าหมาย:** repo รันได้ (hello API + หน้าเปล่า) + DDL ครบทุกตาราง

```
สร้างโครงร่าง monorepo ตาม 02_สถาปัตยกรรมระบบ.md หัวข้อ 3:
- npm workspaces: server (Express+Zod+better-sqlite3+pino) และ web (Vite+React18+TS+Tailwind+TanStack Query+Leaflet)
- server: app.js แยกจาก index.js (export ให้ supertest), middleware ทั้ง 5 ตัว (auth/rbac/validate/audit/errorHandler) ให้พร้อมใช้
- สร้าง server/src/db/connection.js (better-sqlite3, WAL, busy_timeout 5000, PRAGMA foreign_keys) และ migrations/001_init.sql จาก 03_DB_Schema_SQLite.md ทั้งไฟล์ + ระบบรัน migration ตอน start
- เขียน utils/money.js (baht<->satang, format), ทดสอบ unit test ให้ครบทั้ง branch
- web: Vite dev proxy /api → localhost:3000, โครง route lazy ต่อ module + layout หลัก (sidebar เมนูภาษาไทย)
- .env.example, .gitignore (data/, backups/, .env), docker/Dockerfile multi-stage, render.yaml
ตรวจรับ: npm run dev ได้ทั้ง server/web, GET /api/health ตอบ ok, รัน migration แล้วตารางครบตาม DDL, npm test ผ่าน
```

## Phase 1 — Auth + RBAC + Audit (SRS 3.1)

```
สร้างโมดูล auth ตาม 04_API_Spec หัวข้อ 1 และ SRS AUTH-1 ถึง AUTH-6 ทั้งหมด:
- POST login (bcrypt, ล็อก 5 ครั้ง/15 นาที, rate limit 10/min/IP), refresh cookie, logout, /me, change-password ด้วย PIN
- ผู้ใช้ CRUD สิทธิ์ admin + audit-logs พร้อม pagination/กรอง
- seed สคริปต์: admin คนแรก (ชื่อผู้ใช้ admin, รหัสจาก env ADMIN_INITIAL_PASSWORD) + role ทดสอบ 4 ตัว
- middleware ตรวจ token ทุก route /api/* ยกเว้น whitelist, รูปแบบ error ตาม 04 ทุกประโยค
- Frontend: หน้า login (แจ้งเหตุผลถูกล็อก), layout ตาม role (ซ่อนเมนู), หน้าจัดการผู้ใช้ + ตาราง audit
ตรวจรับ: test ครบทั้ง 5 ข้อใน 04 หัวข้อ "ตัวอย่าง Integration Test" ข้อ 1 + unit test ของ middleware rbac
```

## Phase 2 — CRM + Pricing (SRS 3.2–3.3)

```
โมดูล customers + price-tiers ตาม API หัวข้อ 2–3 และ SRS CRM-1 ถึง CRM-7, PRC-1 ถึง PRC-3:
- CRUD + pagination/กรอง/ค้นหา, ราคาต่อ SKU ต่อลูกค้า (customer_prices + ประวัติการเปลี่ยน), resolve-gmaps-url, export xlsx (exceljs), outstanding_bottles + balance_sat แสดงในหน้ารายละเอียด
- Frontend: ตารางลูกค้า (TanStack Table + server pagination), ฟอร์มที่อยู่ไทยครบ field, ปักหมุด Leaflet ในฟอร์ม, หน้าจัดการ price tier
- Zod schema ทุก endpoint + unit test ของ repo/service
ตรวจรับ: สร้างลูกค้าจากฟอร์มจริงได้, แก้ราคาแล้วประวัติบันทึก, export เปิดใน Excel ได้
```

## Phase 3 — Orders (SRS 3.4)

```
โมดูล orders ตาม API หัวข้อ 4 + SRS ORD-1 ถึง ORD-6:
- สร้าง/แก้ (แค่ draft/confirmed), confirm, cancel, กัน duplicate 4 วินาที, ราคาดึงจากลูกค้าเสมอ, คำนวณ total ฝั่ง server, กรองทุกแบบ, route-sheet ตามวัน/โซน, export xlsx
- Frontend: ตารางออเดอร์ + filter วันที่/สถานะ/ชำระเงิน (เหมือน history date filter เดิม), ฟอร์มสร้าง (เลือกลูกค้า → ราคาโชว์อ่านอย่างเดียว), ป้ายสถานะ
ตรวจรับ: test ครบ ORD-2, ORD-3, 04 ข้อ 4 + ทดสอบสร้างออเดอร์รวมยอดถูกต้อง
```

## Phase 4 — Delivery Check-in + Stock movement (SRS 3.5 + INV ส่วน movement)

```
โมดูล delivery (checkins) + inventory movements ตาม API หัวข้อ 5, 9 (เฉพาะ GET items/movements + adjust) + SRS DLV-1 ถึง DLV-4, INV-1, INV-4:
- POST /api/checkins: transaction เดียวทำครบ DLV-2 ทั้ง 5 ผลลัพธ์ + สร้าง payment_receipts + customer_ledger
- stock_movements บันทึกทุกการเปลี่ยน, แจ้งเตือนสต็อกต่ำกว่า min (flag ใน GET items)
- Frontend: ฟอร์ม check-in น้ำหนักเบาใช้มือถือได้ (driver), ประวัติ movement, หน้า inventory
ตรวจรับ: test ครบ 04 ข้อ 2 และ 5 (concurrency 10 ราย) — ต้องผ่านทั้งคู่
```

## Phase 5 — Billing (SRS 3.6)

```
โมดูล billing ตาม API หัวข้อ 6 + SRS FIN-1 ถึง FIN-5:
- ledger deposit (in/use/refund), รายการค้างชำระ + aging 30/60/90, settle แบบ FIFO, สลิปเก็บเงิน + history slip
- Frontend: หน้า unpaid list, หน้าปิดยอด (เลือกลูกค้า→โชว์รายการค้าง→กรอกจ่าย+ใช้ deposit→ยืนยัน), หน้าพิมพ์สลิป (print CSS)
ตรวจรับ: test ครบ 04 ข้อ 3 + unit test FIFO settle ครบกรณี (จ่ายครบ/ไม่ครบ/ใช้ deposit)
```

## Phase 6 — TMS (SRS 3.7)

```
โมดูล tms ตาม API หัวข้อ 7 + SRS TMS-1 ถึง TMS-6:
- /optimize ที่ server (Haversine + nearest-neighbor + return legs), บันทึก/แก้ลำดับ/ปิดเที่ยว, คำนวณเที่ยว (น้ำมัน, เวลา, รายได้, เตือนความจุรถ), ต้องอ่านข้อมูลจาก /orders route-sheet ไม่ใช่ flag บนลูกค้า
- Frontend: หน้าแผนที่ (Leaflet + marker + เส้น + ลาก marker แสดงเลข seq), เลือกโซน, ฟอร์มบันทึกเที่ยว, ตาราง saved trips
- แยกฟังก์ชันคำนวณเป็น utils/geo.js ที่ pure — unit test ครบ
ตรวจรับ: optimize ผล deterministic (snapshot test), เที่ยวเตือนเกินความจุถูกต้อง
```

## Phase 7 — Production + Packaging + FIFO (SRS 3.8–3.9)

```
โมดูล production + inventory packaging ตาม API หัวข้อ 8–9 + SRS PRD-1 ถึง PRD-5, INV-2, INV-3:
- lot ผลิต + auto lot no (utils/lotno.js + test), QA ผ่าน → รับ FG เข้าสต็อก transaction, ไม่ผ่าน → ห้ามตัดเข้า
- รับ lot บรรจุภัณฑ์ + ตัดใช้แบบ FIFO ตาม lot (packaging-consume ใช้ภายใน QA) + ผูก asset ได้
- Frontend: ฟอร์มบันทึกผลิต (แผน vs จริง + ค่า QA), หน้า QA ตรวจรับ, ตาราง lot บรรจุภัณฑ์ + remaining, แดชบอร์ดผลผลิต
ตรวจรับ: unit test FIFO (3 lot ปนกัน + lot หมดกลางทาง) + test QA transaction
```

## Phase 8 — CMMS + Assets + Employees + Expenses (SRS 3.10–3.13)

```
สี่โมดูล CRUD ตาม API หัวข้อ 10–13 + SRS MNT, AST, EMP, EXP ทั้งหมด:
- บันทึกซ่อม/PM ตัดอะไหล่ transaction, แจ้งเตือน PM ตามชั่วโมงรัน + ใบขับขี่ใกล้หมด, ค่าเสื่อม straight-line ณ วันที่, costing ต่อเที่ยว
- Frontend: หน้าจัดการทุกโมดูล (ตาราง + ฟอร์มมาตรฐาน), ส่วนแจ้งเตือนบน dashboard
ตรวจรับ: unit test ค่าเสื่อม + คำนวณ PM + ตัดอะไหล่กระทบสต็อก
```

## Phase 9 — Customer Portal + Dashboard + Backup (SRS 3.14–3.16)

```
โมดูล portal + reports + backup ตาม API หัวข้อ 14–16 + SRS PORTAL, RPT, BKP ทั้งหมด:
- portal: ล็อก PIN แยก hash, ล็อก 5 ครั้ง, สั่งน้ำเป็น draft, เห็นข้อมูลตัวเองเท่านั้น (token scope portal), admin register/reset/unlock
- reports: /dashboard รวมการเตือนทุกชนิด + ยอดขาย, sales report + export
- backup: node-cron สำรองรายวันเก็บ 30 ฉบับ (ไฟล์ .db copy + VACUUM INTO), ปุ่มสำรอง/คืนค่า (admin ยืนยันรหัสผ่าน)
- Frontend: หน้า portal แยก route /portal (responsive มือถือ), หน้า dashboard หลัก, หน้า backup
ตรวจรับ: test portal isolation (ลูกค้า A ดึง /me ของ B ต้อง 404/403), test สำรอง/คืนค่า round-trip
```

## Phase 10 — โอนย้ายข้อมูล + เก็บงามรอบสุดท้าย

```
เขียน scripts/migrate-from-v1.mjs ตาม 07_แผน_Migrate_ข้อมูล.md ทุกขั้น + dry-run โหมด:
- อ่าน inthara_db.json + security_auth.json ระบบเดิม, แปลงเข้า schema ใหม่, รายงานสรุปจำนวนแถวทุกตาราง + รายการที่ข้าม/แก้
- E2E smoke ทั้งระบบ: ล็อกอิน → สร้างลูกค้า → ออเดอร์ → check-in → ปิดยอด → พิมพ์สลิป (Playwright หรือ test script)
- ทำ production build + Docker รันได้, ปรับ README โปรเจกต์ (วิธีติดตั้ง/รัน/migrate)
ตรวจรับ: dry-run กับข้อมูลจริง (สำเนา) ตัวเลขสอดคล้องกับ 07 ตาราง mapping, E2E ผ่าน
```

---

## ถ้า Freebuff ทำพลาด / ตีความผิด

1. หยุดพัฒนาต่อทันที อย่าให้ "แก้เองแบบเดา"
2. ส่งปัญหาเป็น prompt: `ที่ <ไฟล์:บรรทัด> ขัดกับ <เอกสาร:หัวข้อ> — แก้ให้ตรงเอกสาร อย่าเปลี่ยนส่วนอื่น`
3. งานเถียงกันระหว่างเอกสารกับโค้ด → แก้เอกสารก่อน (ไฟล์ 01–04) แล้ว commit เอกสาร แล้วจึงสั่งแก้โค้ด
