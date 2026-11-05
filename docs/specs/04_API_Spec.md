# 04 — API Specification (REST)

**Base URL:** `/api` | **Auth:** `Authorization: Bearer <access_token>` (ยกเว้น /auth/login, /portal/*)
**ข้อตกลงทั่วไป:**
- Content-Type: `application/json; charset=utf-8`
- เงินทุกตัวเป็น **integer satang** (เช่น 150.00 บาท = 15000)
- วันที่ ISO UTC (`2026-11-02T08:30:00.000Z`), วันส่งเป็น `YYYY-MM-DD`
- ทุก collection endpoint รองรับ **pagination**: `?page=1&limit=50` (+ `sort`, `order=asc|desc`)
- รูปแบบ error เดียวกันทั้งระบบ:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "จำนวนสินค้าต้องมากกว่า 0", "details": [{"field": "qty189L", "issue": "ต้อง > 0"}] } }
```

| HTTP | code | ความหมาย |
|---|---|---|
| 400 | VALIDATION_ERROR | input ผิด (Zod) |
| 401 | UNAUTHORIZED / TOKEN_EXPIRED | token ไม่ถูก/หมดอายุ (frontend refresh อัตโนมัติ) |
| 403 | FORBIDDEN | สิทธิ์ไม่พอ |
| 404 | NOT_FOUND | ไม่พบ resource |
| 409 | CONFLICT | กติกาธุรกิจ เช่น แก้ออเดอร์ที่ส่งแล้ว, ล็อกบัญชี |
| 429 | RATE_LIMITED | เร็วเกิน |
| 500 | INTERNAL | บั๊ก — บันทึก log อย่างเดียว ไม่เปิดรายละเอียด |

รูปแบบ list สำเร็จ: `{ "data": [...], "pagination": { "page": 1, "limit": 50, "total": 320, "totalPages": 7 } }`

---

## 1. Auth `/api/auth`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| POST | `/login` | – | body `{username, password}` → `{accessToken, user:{id,username,displayName,role}}` + Set-Cookie refresh. ผิด 5 ครั้ง → 409 พร้อม `lockMinutes`. Rate limit 10/min/IP |
| POST | `/refresh` | – (cookie) | หมุน refresh → accessToken ใหม่ |
| POST | `/logout` | ใดๆ | ยกเลิก refresh ปัจจุบัน |
| POST | `/change-password` | ใดๆ | `{oldPassword, pin, newPassword}` — PIN ใช้ยืนยันตาม AUTH-3 |
| GET | `/me` | ใดๆ | โปรไฟล์ + role ปัจจุบัน |
| GET | `/users` | admin | รายชื่อผู้ใช้ (ไม่คืน hash) |
| POST | `/users` | admin | สร้าง `{username, displayName, role, password, pin, employeeId?}` |
| PUT | `/users/:id` | admin | แก้ role/ชื่อ/active/reset PIN |
| POST | `/users/:id/unlock` | admin | ปลดล็อก |
| GET | `/audit-logs` | admin, manager | `?page&limit&username&action&from&to` |

## 2. Customers `/api/customers`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/` | ทุก staff+ | `?search&zone&type&active&page&limit&sort` |
| GET | `/:id` | ทุก staff+ | รวมราคาต่อ SKU + ยอดถังค้าง + balance + ประวัติ 5 รายการล่าสุด |
| POST | `/` | manager, admin | สร้าง (Zod ตาม customers ทุก field; `code` ระบบออกให้) |
| PUT | `/:id` | manager, admin | แก้ไข (แก้ราคาผ่าน `PUT /:id/prices`) |
| DELETE | `/:id` | admin | soft delete (`is_active=0`) — 409 ถ้ามีออเดอร์ active |
| PUT | `/:id/prices` | manager, admin | `{prices: {sku: satang}}` — บันทึกประวัติเปลี่ยนราคา |
| GET | `/:id/orders` | ทุก staff+ | ประวัติออเดอร์ของลูกค้า (pagination) |
| GET | `/:id/ledger` | manager, admin, staff | สมุดบัญชีลูกค้า (pagination, กรอง date) |
| POST | `/:id/deposit` | manager, admin, staff | `{type: 'in'\|'use'\|'refund', amountSat, note}` (FIN-1) |
| GET | `/export` | manager, admin | `?` ตาม filter เดียวกับ GET / → ไฟล์ xlsx (Content-Disposition) |
| POST | `/resolve-gmaps-url` | ทุก staff+ | `{url}` → `{lat,lng}` (เปิด follow redirect เฉพาะ maps.google/maps.app.goo.gl) |

## 3. Price tiers `/api/price-tiers`

GET `/` (ทุก staff+) | POST, PUT `/:id` (admin, manager) | DELETE `/:id` (admin, 409 ถ้ามีลูกค้าใช้อยู่)

## 4. Orders `/api/orders`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/` | ทุก staff+ | `?customerId&zone&status&paymentStatus(paid\|unpaid\|partial)&dateFrom&dateTo&search&page&limit` |
| GET | `/:id` | ทุก staff+ | รวม items + ประวัติ check-in/receipt ของออเดอร์ |
| POST | `/` | staff+ | `{customerId, deliveryDate, items:[{sku, qty}], notes?}` — **ราคาดึงจากลูกค้าเสมอ** (server คำนวณ total; ถ้า items รวม=0 → 400). กัน duplicate 4 วิ (ORD-3): ถ้าซ้ำคืน `{data: order, duplicateIgnored: true}` |
| PUT | `/:id` | staff+ | แก้ได้เมื่อ status `draft`/`confirmed` เท่านั้น — สถานะ delivered 409 CONFLICT |
| POST | `/:id/confirm` | staff+ | draft → confirmed |
| POST | `/:id/cancel` | staff+ | → cancelled (บันทึกเหตุผล) |
| GET | `/export` | manager, admin | xlsx ตาม filter |
| GET | `/route-sheet` | ทุก staff+ | `?date&zone` → ลูกค้า + จำนวนที่ต้องส่งของวันนั้น (input ของ TMS) |

## 5. Delivery check-in `/api/checkins`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| POST | `/` | driver, staff+, manager, admin | `{orderId, customerId?, delivered:{sku:qty}, returned189L, paymentMode, moneyReceivedSat, notes}` — **transaction เดียว** (DLV-2): ปิดออเดอร์ + ตัด FG + รับถังคืน + ledger + receipt. ตอบ `{checkin, order, receipt, customerBalance}` |
| GET | `/` | ทุก staff+ | ประวัติ check-in (กรอง date/driver/customer) |
| GET | `/slip/:checkinId` | ทุก staff+ | ข้อมูลสลิปเก็บเงิน (HTML print ที่ frontend) |

## 6. Billing `/api/billing`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/unpaid` | staff+ | `?zone&aging(unpaid30\|60\|90)&page` รายการค้างชำระรายออเดอร์ + อายุหนี้ |
| POST | `/settle` | staff+ | `{customerId, amountSat, method, useDepositSat, note}` → ปิดหนี้แบบ FIFO เก่า→ใหม่, คืน `{receipt, settledOrders:[{id, paidSat, closed}]}` (FIN-3) |
| GET | `/slip/:receiptId` | ทุก staff+ | ข้อมูลใบเสร็จ |
| GET | `/history-slip/:customerId` | staff+ | สลิปสรุปประวัติค้างชำระของลูกค้า (FIN-4) |

## 7. TMS `/api/tms`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/plan?date&zone` | ทุก staff+ | ป้ายทั้งหมดของวัน (จาก route-sheet) + พิกัดโรงงาน |
| POST | `/optimize` | ทุก staff+ | `{stops:[{customerId, lat, lng, qty...}], start:{lat,lng}}` → `{orderedStops, totalDistanceKm, legs}` (Haversine, nearest-neighbor — ฝั่ง server ให้ผลเดียวกันทุก client) |
| POST | `/trips` | staff+ | บันทึกเที่ยว (TMS-4) `{vehicleId, driverId, tripDate, stops:[{customerId, seq, planned}]}` → server คำนวณระยะ/เวลา/น้ำมัน/รายได้ + เตือนเกินความจุ (409 ถ้าเกินมาก, warning ถ้าใกล้เต็ม) |
| GET | `/trips` | ทุก staff+ | `?dateFrom&dateTo&vehicleId&page` |
| GET | `/trips/:id` | ทุก staff+ | รายละเอียด + stops เรียง seq |
| PUT | `/trips/:id/stops` | staff+ | จัดลำดับใหม่ (TMS-6) → คำนวณใหม่ |
| POST | `/trips/:id/complete` | driver+ | ปิดเที่ยว + ผูก checkins ที่เกิดในเที่ยว |

## 8. Production `/api/production`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/lots?dateFrom&dateTo&shift` | ทุก staff+ | |
| POST | `/lots` | manager, admin, staff | `{productionDate, shift, plan{sku:qty}, actual{sku:qty}, tdsRaw, tdsRo, ph}` → ระบบออก lotNo อัตโนมัติ (PRD-4) |
| POST | `/lots/:id/qa` | manager, admin | `{passed: bool}` — ผ่าน = รับ FG เข้าสต็อก (transaction: lot + movements) |
| GET | `/dashboard?dateFrom&dateTo` | ทุก staff+ | สรุปแผน vs จริงต่อกะ |

## 9. Inventory & Packaging `/api/inventory`

| Method | Path | Role | รายละเอียด |
|---|---|---|---|
| GET | `/items?category&lowStockOnly` | ทุก staff+ | รายการสต็อก + `belowMin` flag |
| PUT | `/items/:sku` | manager, admin | แก้ min_stock/unit_cost |
| GET | `/movements?sku&reason&dateFrom&dateTo&page` | ทุก staff+ | ประวัติ movement (INV audit) |
| POST | `/adjust` | manager, admin | `{sku, newStock, reason}` → บันทึก movement adjustment |
| POST | `/packaging-lots` | manager, admin | รับเข้า lot บรรจุภัณฑ์ (INV-2) |
| GET | `/packaging-lots?sku&status` | ทุก staff+ | |
| POST | `/packaging-consume` | ระบบ (ภายใน) | ตัด FIFO ตาม lot — เรียกจาก production QA ผ่าน |

## 10. CMMS `/api/machines`, `/api/maintenance`

GET `/machines` (ทุก staff+), PUT `/machines/:code/status` (manager, admin, driver เปลี่ยนได้เฉพาะ in_use↔available ของตัวเอง), POST `/maintenance` (manager, admin — ตัดอะไหล่แบบ transaction), GET `/maintenance?machineCode&dateFrom&dateTo`, GET `/machines/due-pm` (แจ้งเตือน MNT-3)

## 11. Assets & Vehicles `/api/assets`, `/api/vehicles`

CRUD มาตรฐาน (สิทธิ์ manager, admin; ดูได้ทุก staff+) + GET `/assets/:id/depreciation?asOf` (AST-2 คำนวณ ณ วันที่), การผูก vehicles↔assets ทำตอน POST /vehicles

## 12. Employees `/api/employees`

CRUD (manager, admin; ดูได้ทุก staff+) + GET `/employees/license-expiring?days=30`

## 13. Expenses `/api/expenses`

GET `?category&dateFrom&dateTo&refType&page`, POST (staff+), GET `/costing/trips/:tripId` (EXP-2: น้ำมัน + ค่าใช้จ่ายผูกเที่ยว − รายได้)

## 14. Reports `/api/reports`

GET `/dashboard` (RPT-1 ทุก alert รวมชุดเดียว) | GET `/sales?dateFrom&dateTo&zone&groupBy(day\|month)` | GET `/sales/export` (xlsx)

## 15. Customer Portal `/api/portal` (scope แยก)

| Method | Path | รายละเอียด |
|---|---|---|
| POST | `/login` | `{customerCode, pin}` → portal token (claim `scope:'portal'`) — ล็อก 5 ครั้ง (PORTAL-2) |
| GET | `/me` | ราคาประจำ + ยอดค้างชำระ + ถังค้าง + ประวัติ 3 เดือน |
| POST | `/orders` | `{items:[{sku, qty}]}` → ออเดอร์ `draft` source=portal (PORTAL-4) |
| GET | `/my/orders?page` | ประวัติของตัวเอง |
| Admin จัดการ: `POST /api/customers/:id/portal/register`, `POST /api/customers/:id/portal/reset-pin`, `POST .../unlock`, `GET .../access-status` |

## 16. Backup `/api/backup` (admin)

GET `/status` (สำรองล่าสุด) | POST `/run` | GET `/list` | POST `/restore` `{filename}` (ยืนยันด้วย password admin)

---

## ตัวอย่าง Integration Test ที่ต้องมี (ครบตาม Antigravity จะตรวจ)

1. `POST /api/auth/login` ผิด 5 ครั้ง → ครั้งที่ 6 ได้ 409 + `lockMinutes`
2. `POST /api/orders` แล้ว `POST /api/checkins` → เช็ค **ทั้ง 5 ผลลัพธ์** ใน DB (order delivered, FG ลด, ถังเปล่าเพิ่ม, outstanding ลูกค้า, ledger) และ rollback เมื่อ SKU ไม่มีใน inventory
3. `POST /api/billing/settle` ยอดไม่พอปิดทุกรายการ → ปิดแบบ FIFO + ยอดเหลือถูก
4. `PUT /api/orders/:id` ออเดอร์ delivered → 409
5. พร้อมกัน 10 POST check-in คนละออเดอร์ (Promise.all) → ทั้ง 10 สำเร็จ ข้อมูลครบ (NFR-2)
