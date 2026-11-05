# 07 — แผนโอนย้ายข้อมูลจากระบบเดิม (v1) สู่ระบบใหม่ (v2)

**สคริปต์:** `scripts/migrate-from-v1.mjs` (ให้ Freebuff เขียนใน Phase 10)
**หลักการ:** ย้ายทีละก้อนใน transaction, ทุกก้อนต้องมีรายงานจำนวน + รายการที่ข้าม/แปลง, มีโหมด `--dry-run` และ `--commit`, ย้ายข้อมูลจาก**สำเนา**ไฟล์เดิมเท่านั้น

## 0. เตรียมตัวก่อนย้าย

1. หยุดระบบเดิม แล้วสำเนา `data/inthara_db.json`, `data/security_auth.json`, `data/customer_auth.json`, `Inthara_Customers_Master.xlsx`, `Inthara_Sales_Orders.xlsx` ไปโฟลเดอร์ `migration-input/` (อยู่ใน .gitignore)
2. ตรวจ v1 ว่า `cloudSync.status === 'synced'` (ข้อมูล Drive ตรงเครื่อง) ก่อน snapshot
3. Backup ไฟล์ v1 ทั้งโฟลเดอร์ data/ เก็บไว้ถาวรอีกชุด (นอก repo)

## 1. ตาราง mapping (v1 → v2)

| ไฟล์ v1 (field เดิม) | ตาราง v2 | กฎแปลง |
|---|---|---|
| `inthara_db.json → customers` (price189L ฯลฯ, OutstandingBottles, branchType, houseNo/moo/…) | `customers` + `customer_prices` | ราคาบาท → satang ×100; `OutstandingBottles` → `outstanding_bottles`; สร้าง `code` ใหม่ `CUS-####` เรียงตามชื่อ พร้อมเก็บ id เดิมไว้ใน `migration-input/id_map.json` เพื่ออ้างอิงตอนย้าย orders |
| `→ priceTiers` | `price_tiers` | ตรง ๆ + ราคา ×100 |
| `→ orders` (qty/unitPrice/totalAmount, orderStatus ไทย) | `orders` + `order_items` | 4 คอลัมน์ qty → 4 แถว items; status: `ยังไม่ได้จัดส่ง`→`confirmed` (หรือ `draft` ถ้าไม่มีการยืนยัน), `จัดส่งสำเร็จแล้ว`→`delivered`, `ยกเลิก`→`cancelled`; total/paid ×100; completedAt เดิมเก็บ `completed_at` |
| `→ orders` ของ delivered ที่ยังค้างเงิน (paymentMode/ยอดที่ยังไม่ได้เก็บ) | `customer_ledger` (entry_type `order_debt`) | สร้าง ledger ย้อนหลังเฉพาะยอด unpaid คงเหลือ เพื่อให้หน้า billing ของ v2 เห็นหนี้เก่าต่อเนื่อง |
| `→ paymentReceipts` (ถ้ามี) | `payment_receipts` | ×100 + สร้าง code ใหม่ |
| `→ inventory` (stock, minStock, unitPrice/unitCost) | `inventory_items` | ×100; สร้าง stock_movements ตั้งต้น 1 ประโยค/ SKU reason `backup_restore` เพื่อให้ประวัติเริ่มนับ |
| `→ productionLots` (plan/actual 4 SKU, tdsRaw/tdsRo/phVal) | `production_lots` | plan/actual → JSON; lotNo เดิมเก็บไว้ |
| `→ packagingLots` (quantity/remainingQty, unitCost, assetLinked) | `packaging_lots` | ×100; remaining ตามจริง; status จาก remaining (0 → depleted) |
| `→ machines` + `maintenanceLogs` | `machines` + `maintenance_logs` | cost ×100; sparePartSku/Qty ตรง ๆ |
| `→ assets` (cost, depreciationPerYear, accumulated, salvage) | `assets` | ×100 ทุกตัวเงิน; `id` เดิม (AST-…) ใช้เป็น `code` ได้เลย |
| `→ vehicles` (ผูก assetId) | `vehicles` | fuelRate จริง; dieselPrice ×100 |
| `→ employees` (salary, driverLicense…) | `employees` | salary ×100; สถานะ inactive ตาม v1 |
| `→ savedTrips` + `expenses` | `trips` + `expenses` | ทุกตัวเงิน ×100 |
| `security_auth.json → users` (username, role, pin, hash, level, active, failedAttempts, lockUntil) | `users` | **รหัสผ่านทั้งหมด reset** (เหตุผล: v1 เก็บ passwordPlain + PBKDF2 รูปแบบเดิม — ไม่พกข้ามระบบ): ตั้ง password ชั่วคราวต่อ user จาก env หรือสุ่ม + บังคับเปลี่ยนตอน login ครั้งแรก; PIN แปลงเป็น hash ใหม่; role ตาม v1 (level สูงสุด = admin) |
| `security_auth.json → auditLogs` (142 รายการ) | `audit_logs` | ย้ายเพื่อประวัติ ไม่ต้องครบ mapping ทุก field |
| `customer_auth.json` + `customers ที่เปิด portal` | `customer_portal_auth` | PIN สุ่มใหม่ ทั้งหมด (แจ้งลูกค้าทีหลัง) ปิด enabled จนตั้ง PIN ใหม่ |

## 2. ขั้นตอนรัน

```
1) node scripts/migrate-from-v1.mjs --dry-run
   → อ่านรายงาน: จำนวนที่จะย้ายทุกตาราง + รายการ warning (เช่น order อ้าง customerId ที่ไม่มีใน customers)
2) แก้ข้อมูลต้นทาง (ใน migration-input) จนไม่มี warning ที่ยอมรับไม่ได้
3) node scripts/migrate-from-v1.mjs --commit
   → ย้ายทั้งหมดใน transaction เดียว, ถ้า fail กลางทาง rollback ทั้งชุด
4) ตรวจสอบหลังย้าย (สคริปต์ต้อง print):
   - จำนวนแถวทุกตาราง v2 เทียบตาราง mapping
   - SUM ยอดหนี้รวมจาก ledger = ยอดค้างชำระรวมที่คำนวณจาก v1 (สูตรใน FIN-2)
   - SUM stock ทุก SKU = ตัวเลข v1
   - ผู้ใช้ทุกคน status บังคับเปลี่ยนรหัส = จริง
5) ล็อกอิน admin ใหม่ → เปลี่ยนรหัส → ตรวจหน้า dashboard ตัวเลขสอดคล้อง
```

## 3. หลังย้ายเสร็จ — งานเก็บกวาด v1

1. **ลบความลับออกจาก GitHub repo เดิมทันที:** ไฟล์ `Inthara_Users_Passwords.xlsx`, `data/*` เคยถูก push — ใช้ `git filter-repo` หรือ BFG ลบออกจาก history ทั้งหมด แล้ว force push และถือว่ารหัสผ่าน v1 ทั้งหมดรั่วไหลแล้ว (สนับสนุนการ reset ในข้อ 1 ของตาราง mapping อีกชั้น)
2. ทำ repo v1 เป็น archive (read-only) ห้ามใช้งานต่อ
3. เก็บสำเนา v1 + id_map.json ไว้ใน backup ถาวร 6 เดือน
4. ตั้งค่า backup อัตโนมัติ v2 (BKP-1) และทดสอบ restore จริง 1 ครั้งก่อนใช้งานจริง

## 4. ความเสี่ยงที่ต้องยอมรับ/ตัดสินใจ

| ความเสี่ยง | การจัดการ |
|---|---|
| ราคาย้อนหลังของออเดอร์เก่าไม่เก็บประวัติการเปลี่ยนแปลง | ยอมรับ — v2 เริ่มเก็บประวัติตั้งแต่วันย้าย |
| Ledger ย้อนหลังสร้างเฉพาะ "ยอดค้างคงเหลือ" ไม่ใช่ movement ทุกประวัติ | ยอมรับ — ประวัติละเอียดดูได้จาก audit_logs ที่ย้ายมา |
| ลูกค้าต้องตั้ง PIN พอร์ทัลใหม่ | แจ้งลูกค้าทางไลน์/โทร พร้อมขั้นตอนตั้งใหม่ |
| ช่วงตัดระบบ (cutover) ห้ามมีการขายระหว่างย้าย | เลือกวันหยุดโรงงานหรือหลังปิดสิ้นเดือน |
