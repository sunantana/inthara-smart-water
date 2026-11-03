# รายงานผลการตรวจรับงาน Phase 0: โครงร่างโปรเจกต์ + ฐานข้อมูล (Inthara Smart Water ERP v2)

**วันที่ตรวจสอบ:** 3 พฤศจิกายน 2026  
**ผู้ตรวจสอบ:** Senior Code Reviewer (Antigravity AI)  
**เป้าหมาย:** ตรวจรับงานโครงสร้างพื้นฐาน Phase 0 ก่อนอนุมัติให้พัฒนาต่อใน Phase 1 (Auth + RBAC + Audit)  
**เอกสารอ้างอิง:**
- `00_README_ภาพรวม.md`
- `01_SRS_ความต้องการระบบ.md`
- `02_สถาปัตยกรรมระบบ.md`
- `03_DB_Schema_SQLite.md`
- `04_API_Spec.md`
- `05_แผนงาน_Freebuff_Phases.md`
- `06_คำสั่ง_Antigravity_Review.md`
- `07_แผน_Migrate_ข้อมูล.md`

---

## ผลตรวจ Phase 0

- **ผ่าน/ไม่ผ่าน gate:** **ไม่ผ่าน (Failed Gate)**
- **สรุปสถานะ:** โปรเจกต์ในไดเรกทอรีนี้ยังคงเป็นโครงสร้างระบบเดิม (v1) ที่เป็น Monolith Express + Vanilla JS + ไฟล์ JSON ทั้งก้อน ยังไม่มีการจัดตั้งโครงสร้าง Monorepo สำหรับ v2 (`server/`, `web/`), ยังไม่มีการเชื่อมต่อ SQLite ผ่าน `better-sqlite3`, ยังไม่มีไฟล์ Migration DDL `001_init.sql`, และยังไม่มีชุดทดสอบใด ๆ ทำงานได้

---

### Critical (ต้องแก้ก่อนไปต่อ)

1. **สร้างโครงร่างโปรเจกต์ Monorepo v2 ตามข้อกำหนด 02/05**
   - **ไฟล์ที่ต้องสร้าง:** `package.json`, `server/package.json`, `web/package.json`
   - **ข้อกำหนด:** ตั้งค่า npm workspaces `["server", "web"]`
     - ฝั่ง `server`: Express, better-sqlite3, zod, pino, jsonwebtoken, bcryptjs
     - ฝั่ง `web`: Vite + React 18 + TypeScript + Tailwind CSS + TanStack Query + Leaflet
   - **วิธีแก้:** รันการ initialize monorepo ตามโครงสร้างใน `02_สถาปัตยกรรมระบบ.md` หัวข้อ 3

2. **แยก `app.js` ออกจาก `index.js` พร้อม Middleware 5 ตัว**
   - **ไฟล์ที่ต้องสร้าง:** `server/src/app.js`, `server/src/index.js`, `server/src/middleware/*`
   - **ข้อกำหนด:**
     - `server/src/app.js`: สร้าง Express app, ผูก middleware ทั้งหมด และ export `app` สำหรับ supertest
     - `server/src/index.js`: ทำหน้าที่ bootstrap, `app.listen(PORT)` และจัดการ graceful shutdown
     - สร้าง Middleware 5 ตัวตามมาตรฐาน:
       1. `auth.js` — ตรวจสอบ JWT access token
       2. `rbac.js` — ฟังก์ชัน `requireRole('admin', 'manager', ...)`
       3. `validate.js` — Zod schema validation
       4. `audit.js` — บันทึก Audit trail อัตโนมัติหลัง write request สำเร็จ
       5. `errorHandler.js` — ดักจับ `AppError` แปลงเป็น JSON ตามรูปแบบมาตรฐานใน `04_API_Spec.md`

3. **สร้าง Database Connection & Migration DDL จากเอกสาร 03**
   - **ไฟล์ที่ต้องสร้าง:** `server/src/db/connection.js`, `server/src/db/migrations/001_init.sql`
   - **ข้อกำหนด:**
     - `connection.js` ต้องเปิดใช้:
       ```javascript
       const db = new Database(dbPath);
       db.pragma('journal_mode = WAL');
       db.pragma('busy_timeout = 5000');
       db.pragma('foreign_keys = ON');
       ```
     - `001_init.sql` ต้องมี DDL ครบถ้วนตาม `03_DB_Schema_SQLite.md` ทั้ง 23 ตาราง และ 17 Indexes (เก็บเงินเป็นสตางค์ integer, เวลา ISO UTC, soft delete `is_active`) พร้อมระบบรัน migration อัตโนมัติตอน start server

4. **สร้าง `utils/money.js` พร้อม Unit Test ให้ครอบคลุมทุก Branch**
   - **ไฟล์ที่ต้องสร้าง:** `server/src/utils/money.js`, `server/tests/unit/money.test.js`
   - **ข้อกำหนด:** มีฟังก์ชัน `bahtToSatang(baht)`, `satangToBaht(satang)`, `formatBaht(satang)` และมี Unit Test ครอบคลุม 100% Branches (ดักจับ floating point inaccuracies, ค่าลบ, ค่าศูนย์, ทศนิยมเกิน)

5. **ลบไฟล์ Credentials ออกจาก Git และปรับปรุง `.gitignore`**
   - **ไฟล์เป้าหมาย:** `.gitignore`
   - **ข้อกำหนด:** 
     - เพิ่ม `data/*.db`, `data/*.db-*`, `backups/`, `.env`, `*.xlsx`, `migration-input/` ลงใน `.gitignore`
     - นำไฟล์ `Inthara_Users_Passwords.xlsx` และ `data/security_auth.json` ออกจาก Git tracking และ Git history

---

### Major (ควรแก้ใน Phase นี้)

1. **สร้าง Endpoint `GET /api/health`**
   - **ไฟล์ที่ต้องสร้าง:** `server/src/routes/health.js` (หรือใน `app.js`)
   - **ข้อกำหนด:** คืนค่า JSON `{ "status": "ok", "timestamp": "...", "database": "connected" }` โดยทดสอบ query SQLite จริง
2. **สร้าง `.env.example`**
   - **ไฟล์ที่ต้องสร้าง:** `.env.example`
   - **ข้อกำหนด:** ระบุค่า configuration ที่จำเป็น เช่น `PORT=3000`, `NODE_ENV=development`, `JWT_SECRET=your_jwt_secret_min_32_chars`, `DATA_DIR=./data` โดยไม่มีค่า credentials จริง
3. **จัดทำโครงสร้าง Frontend (Web Workspace)**
   - **ไฟล์ที่ต้องสร้าง:** `web/vite.config.ts`, `web/src/App.tsx`, `web/src/App.routes.tsx`
   - **ข้อกำหนด:** ตั้งค่า Vite Dev Proxy ให้ route `/api` ชี้ไปยัง `http://localhost:3000` และเตรียม layout หลักพร้อม sidebar เมนูภาษาไทย

---

### Minor (ยกไปรวมที่ Phase เก็บงาม)

1. จัดเตรียม Docker multi-stage build (`docker/Dockerfile`) สำหรับรวม server และ web เข้าด้วยกัน
2. เตรียมคอนฟิก `render.yaml` ให้ตรงตามโครงสร้าง monorepo ใหม่

---

### ข้อที่ยังไม่ครบตามตรวจรับ (Missing Deliverables Checklist)

- [ ] `npm run dev` รันได้พร้อมกันทั้ง server และ web
- [ ] `GET /api/health` ตอบ status ok และยืนยันการเชื่อมต่อ SQLite
- [ ] Migration รันผ่านอัตโนมัติเมื่อสตาร์ทเซิร์ฟเวอร์ และมีตารางครบ 23 ตารางตาม DDL 03
- [ ] `npm test` รันผ่าน 100% พร้อม unit test ของ `utils/money.js`
- [ ] สถาปัตยกรรม `server/src/app.js` แยกออกจาก `server/src/index.js`
- [ ] Middleware 5 ตัวพร้อมใช้งานใน `server/src/middleware/`
- [ ] ข้อมูลความลับ (`.xlsx`, `.json`) ถูกนำออกจาก Git staging/working tree และ `.gitignore` ครอบคลุมถูกต้อง

---

## รายละเอียดผลการตรวจ 6 ด้าน

### 1. ตรงข้อกำหนด (Specification Conformance)
| รายการตรวจรับ Phase 0 (ในเอกสาร 05) | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| `npm run dev` ทั้ง server/web | ❌ ไม่ผ่าน | ไม่มี script `dev` และไม่มี workspaces `server`/`web` ใน `package.json` |
| `GET /api/health` ตอบ ok | ❌ ไม่ผ่าน | ไม่พบการประกาศ route `/api/health` ในระบบ |
| Migration ครบทุกตารางตาม DDL 03 | ❌ ไม่ผ่าน | ไม่มีไฟล์ migration `001_init.sql` และไม่มีตาราง SQLite ถูกสร้าง |
| `npm test` ผ่าน 100% | ❌ ไม่ผ่าน | `npm test` ล้มเหลวเนื่องจากไม่มี script `test` และไม่มี test runner |

### 2. สถาปัตยกรรม (Architecture & Layering)
| รายการตรวจสอบ (ในเอกสาร 02 หัวข้อ 3) | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| `app.js` แยกจาก `index.js` | ❌ ไม่ผ่าน | ยังคงเป็นไฟล์ monolith `server.js` ไฟล์เดียวที่ทั้ง listen port และผูก route |
| Middleware 5 ตัวครบตามโครงสร้าง | ❌ ไม่ผ่าน | ไม่มีโฟลเดอร์ `server/src/middleware/` ขาด auth, rbac, validate, audit, errorHandler |
| การแยกชั้น Router → Service → Repository | ❌ ไม่ผ่าน | ยังไม่มีการแบ่งชั้น มีการเข้าถึงและแก้ไขข้อมูลไฟล์ JSON ตรงใน route |

### 3. ความถูกต้องข้อมูล (Data Integrity & SQLite Connection)
| รายการตรวจสอบ (ในเอกสาร 03) | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| `connection.js` เปิด WAL + timeout + FK | ❌ ไม่ผ่าน | ไม่มีไฟล์ `server/src/db/connection.js` และยังไม่ได้ติดตั้ง `better-sqlite3` |
| DDL ครบ 23 ตาราง และ 17 Indexes | ❌ ไม่ผ่าน | ยังไม่มีการสร้าง DDL ลงในระบบ (ปัจจุบันมี 0 ตาราง SQLite) |
| เก็บเงินเป็น integer สตางค์ | ❌ ไม่ผ่าน | ระบบเดิมยังเก็บเป็นตัวเลขทศนิยมบาทใน JSON |

### 4. ความปลอดภัย (Security Audit)
| รายการตรวจสอบ | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| `.gitignore` ครอบคลุม `data/`, `backups/`, `.env` | ❌ ไม่ผ่าน | มีเพียง 6 บรรทัด (`node_modules/`, `*.log`, `.DS_Store`) |
| ไม่พบ Credentials/Secrets ใน Git | ❌ ไม่ผ่าน | พบ `Inthara_Users_Passwords.xlsx` และ `data/security_auth.json` ใน Git history |
| `.env.example` ไม่มีค่าจริง | ❌ ไม่ผ่าน | ยังไม่มีไฟล์ `.env.example` |

### 5. การทดสอบ (Testing)
| รายการตรวจสอบ | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| Unit test `utils/money.js` ครบทุก branch | ❌ ไม่ผ่าน | ไม่มีไฟล์ `server/src/utils/money.js` และไม่มีไฟล์ test |
| `npm test` ผ่าน 100% | ❌ ไม่ผ่าน | รันคำสั่ง `npm test` แล้วเกิดข้อผิดพลาด: `npm error Missing script: "test"` |

### 6. คุณภาพโค้ด (Code Quality)
| รายการตรวจสอบ | ผลการตรวจ | รายละเอียด |
| :--- | :---: | :--- |
| การตั้งชื่อสื่อความหมายตาม Convention | ⚠️ ควรปรับปรุง | โค้ดเดิมมีการผสมผสานภาษาไทยและอังกฤษในตัวแปร |
| ฟังก์ชันยาวเกิน 50 บรรทัด | ❌ ไม่ผ่าน | `server.js` (2,430 บรรทัด) และ `public/app.js` (7,311 บรรทัด) มีฟังก์ชันยาว 100-300+ บรรทัด |
| โค้ดคัดลอกซ้ำ (DRY Violation) | ❌ ไม่ผ่าน | มีการอ่านเขียนไฟล์ JSON ผ่าน `readFileSync`/`writeFileSync` ซ้ำกันกว่า 30 จุด |

---

## คำแนะนำสำหรับ Freebuff เพื่อผ่าน Gate Phase 0

1. สร้างโฟลเดอร์ monorepo ใหม่ตามโครงสร้างในเอกสาร `02_สถาปัตยกรรมระบบ.md`
2. สร้างไฟล์ `server/src/db/migrations/001_init.sql` โดยคัดลอก DDL จาก `03_DB_Schema_SQLite.md` ทั้งหมด
3. เขียน `server/src/db/connection.js` โดยใช้ `better-sqlite3` พร้อมรัน migration เมื่อเชื่อมต่อสำเร็จ
4. เขียน `server/src/utils/money.js` และสร้างไฟล์ทดสอบ `server/tests/unit/money.test.js`
5. กำหนด `npm test` ใน `package.json` ให้เรียก Vitest และรันผ่าน 100%
6. สร้าง `GET /api/health` ใน Express server
7. เมื่อ Freebuff ดำเนินการเสร็จสิ้น ให้ส่งกลับมายัง Antigravity เพื่อตรวจรับงาน Phase 0 อีกครั้ง
