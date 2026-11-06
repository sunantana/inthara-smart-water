# งานส่งต่อระบบ Inthara Smart Water ERP v2 — สำหรับ QwenWork

**จาก:** Antigravity AI (Google DeepMind Team)  
**ถึง:** QwenWork / Sunan Tana  
**วันที่:** 6 พฤศจิกายน 2026  
**สาขาปัจจุบัน:** `chore/cleanup-v1` (สร้างต่อจาก `main` @ `71fcfc2`)  
**สถานะ:** พัฒนาครบ 10 Phases สมบูรณ์ (128/128 tests ผ่าน 100%) + เก็บกวาดโค้ดระบบเก่า v1 ทั้งหมดเรียบร้อยแล้ว พร้อมนำขึ้น Production บน Render.com

---

## 1. สรุปภาพรวมสำหรับผู้มารับช่วงต่อ (Executive Summary)

ระบบ **Inthara Smart Water ERP v2** ได้รับการยกเครื่องใหม่ทั้งหมดจากเดิมที่เป็นระบบสคริปต์เดี่ยว (Single File Monolith `server.js` + `public/app.js` ฐานข้อมูล JSON) ก้าวสู่ **Modern Monorepo Architecture** ที่มีความเสถียร ปลอดภัย และขยายต่อได้ง่าย:

1. **Backend (`server/`):** Node.js 20+, Express 4, ฐานข้อมูล **SQLite 3 (WAL Mode + Foreign Keys ON)** จัดเก็บเป็นไฟล์เดี่ยวที่ `server/data/inthara.db`, ระบบโครงสร้าง 4-Layer Architecture (`router.js`, `service.js`, `repo.js`, `schema.js`) แยกอิสระ 16 โมดูลธุรกิจ ครอบคลุมการคำนวณเงินระดับสตางค์ (Satang: 1 บาท = 100 satang) เพื่อป้องกันปัญหา Floating point
2. **Frontend (`web/`):** React 19, TypeScript, Vite, Tailwind CSS, TanStack React Query และ React Router DOM พร้อมระบบ Lazy Loading แยกตามโมดูล
3. **Security & RBAC:** สิทธิ์การใช้งาน 5 บทบาท (`admin`, `manager`, `staff`, `driver`, `portal`) พร้อม JWT Access Token (15m) + HttpOnly Refresh Token (7d) หมุนเวียน Token อัตโนมัติ (Token Rotation & Revocation), Rate Limiting, Audit Logging และระบบล็อกบัญชีเมื่อใส่รหัส/PIN ผิด 5 ครั้ง
4. **ความพร้อม Production:** มี Multi-stage `Dockerfile`, `render.yaml` (Persistent Disk), สคริปต์ Seed Production อัตโนมัติ, ระบบ Backup รายวันอัตโนมัติ 02:00 น. ด้วย `VACUUM INTO`, และชุดทดสอบ E2E Flow ครอบคลุมวงจรธุรกิจตั้งแต่ต้นจนจบ

---

## 2. สิ่งที่ทำเสร็จล่าสุด (Phase 10 + เก็บกวาด v1)

### Phase 10: เก็บงาน + E2E + ตั้งค่าขึ้น Production (`feature/phase-10` → `main` @ `71fcfc2`)
- **Dashboard & Sales Filter:** ปรับปรุง `server/src/modules/reports/repo.js` ให้นับยอดขาย (รายวัน, รายเดือน, กราฟ 12 เดือน) เฉพาะออเดอร์ที่มีสถานะ `delivered` เท่านั้น (ตัด draft จาก portal และ confirmed orders ออกจากการคำนวณยอดขายสุทธิ) และเพิ่มตัวชี้วัด `portalDraftOrdersCount` แยกต่างหาก
- **Gzip Compression:** ติดตั้งและเปิดใช้งาน `compression` middleware บน Backend ทุก Endpoint (ส่งคืน Header `Content-Encoding: gzip` เมื่อ Client รองรับ)
- **Production Web Serving & SPA Fallback:** ในโหมด `NODE_ENV=production` เซิร์ฟเวอร์ Express จะเสิร์ฟ static assets จาก `web/dist` และทำ SPA Fallback สำหรับ non-API routes (`GET *` ส่งคืน `index.html`) โดยที่ `/api/*` ที่ไม่มีอยู่จะยังคงตอบ `404 JSON` ถูกต้องตาม API Spec
- **E2E Smoke Test (`server/tests/api/e2e-flow.test.js`):** สร้างชุดทดสอบวงจรธุรกิจจริง 11 ขั้นตอนรันต่อเนื่อง (Login 5 บทบาท → สั่งของ → จัดส่ง → ตัดสต็อก → บันทึกหนี้/ถังคืน → ตัดชำระ FIFO → เติมเงินมัดจำ → ตรวจแดชบอร์ด → ผลิต QA ผ่าน → Backup & Restore DB) ผ่านฉลุย 100%
- **Production Seed Script (`server/scripts/seed-production.mjs`):** รันคำสั่ง `npm run seed:production` สร้าง 5 บัญชีหลักพร้อมรหัสผ่านสุ่ม 16 ตัวอักษรและ PIN 6 หลัก และสร้างข้อมูลพื้นฐาน (Price Tiers, พนักงาน, รถขนส่ง, เครื่องจักร, สต็อก)

### การเก็บกวาด v1 (`chore/cleanup-v1` @ `943c500`)
- **ลบโค้ดระบบเก่า 124 ไฟล์ (-33,401 บรรทัด):** ลบ `server.js`, `security.js`, โฟลเดอร์ `public/`, `scratch/` (90+ ไฟล์), `scripts/` เดิม, และ `data/` เดิมที่ root (รวมถึง `Inthara_Users_Passwords.xlsx` ที่เคยฝังรหัสผ่านเดิม)
- **ลบไฟล์ Batch สคริปต์เก่า:** ลบ `start_inthara_erp.bat`, `START_SERVER.bat`, `PUSH_TO_GITHUB.bat` และไฟล์ `.bat` ชื่อภาษาไทยทั้งหมด
- **ปรับการตั้งค่าหลักที่ Root สู่ v2:**
  - `Dockerfile` ที่ Root ปรับเป็น Multi-stage build v2
  - `render.yaml` ที่ Root ปรับเป็น Render Blueprint v2 (แนบ Persistent Disk `/app/data`)
  - `package.json` ที่ Root ปรับ version เป็น `2.0.0`, เอา dependency เก่าของ v1 ออก (`cors`, `express@4.21`, `xlsx`), และกำหนด scripts สำหรับ workspaces ให้รันง่าย (`npm test`, `npm run build`, `npm start`, `npm run seed:production`)
  - `.gitignore` และ `.dockerignore` เพิ่มละเว้น `data/`, `scratch/`, `backups/` และ local SQLite files

---

## 3. ผลการทดสอบและหลักฐานยืนยัน (Test Verification)

### ผลการรัน Vitest Suite ทั้งหมด (16 ไฟล์ / 128 ข้อ)
```text
 ✓ tests/utils/geo.test.js (4 tests)
 ✓ tests/middleware/rbac.test.js (6 tests)
 ✓ tests/utils/money.test.js (13 tests)
 ✓ tests/db/migrations.test.js (8 tests)
 ✓ tests/modules/customers/service.test.js (6 tests)
 ✓ tests/api/health.test.js (3 tests)
 ✓ tests/api/production.test.js (8 tests)
 ✓ tests/api/phase8-ops.test.js (8 tests)
 ✓ tests/api/tms.test.js (6 tests)
 ✓ tests/api/billing.test.js (8 tests)
 ✓ tests/api/checkins-inventory.test.js (7 tests)
 ✓ tests/api/e2e-flow.test.js (11 tests)
 ✓ tests/api/phase9-ops.test.js (8 tests)
 ✓ tests/api/customers.test.js (7 tests)
 ✓ tests/api/orders.test.js (10 tests)
 ✓ tests/api/auth.test.js (15 tests)

 Test Files  16 passed (16)
      Tests  128 passed (128)
   Duration  21.74s - 30.18s
```

### ผลการ Build Frontend Production
```bash
npm run build
# tsc --noEmit && vite build -> 0 error, built in 3.38s -> web/dist
```

---

## 4. สิ่งที่ QwenWork ต้องทำต่อ (Action Items)

### ขั้นตอนที่ 1: รวมโค้ดกวาดล้าง v1 เข้า `main`
สาขา `chore/cleanup-v1` ได้รับการทดสอบ 128/128 ข้อและ push ขึ้น GitHub แล้ว:
```bash
# บนเครื่องพัฒนา
git checkout main
git merge chore/cleanup-v1
git push origin main
```

### ขั้นตอนที่ 2: ตั้งค่าและ Deploy บน Render.com
ไปที่ **Render Dashboard** ของ Service `inthara-smart-water-erp`:
1. **เปลี่ยน Build & Start Command (หากไม่ได้ใช้ Blueprint):**
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node server/src/index.js`
   *(หรือใช้ Environment: Docker โดยชี้ไปที่ `Dockerfile` ที่ Root)*
2. **Environment Variables (สำคัญ):**
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (หรือตามพอร์ตที่ Render กำหนด)
   - `JWT_SECRET` = สุ่ม secret 48 bytes โดยรัน:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `ADMIN_INITIAL_PASSWORD` = ตั้งรหัสผ่านที่ปลอดภัยสำหรับบัญชี `owner_inthara`
   - `DATA_DIR` = `/app/data`
   - `BACKUPS_DIR` = `/app/backups`
3. **Persistent Disk (จำเป็นอย่างยิ่งสำหรับการใช้งานจริง):**
   - ไปที่แท็บ **Disks** บน Render Dashboard
   - เพิ่ม Disk: Name `inthara-data`, Mount Path `/app/data`, Size `1 GB` (ขั้นต่ำ)
   - *คำเตือน: หากใช้ Free Tier โดยไม่มี Persistent Disk ข้อมูล SQLite จะถูกล้างทุกครั้งที่มีการ Restart/Deploy ใหม่*
4. กด **Manual Deploy** → เลือก **Deploy latest commit**

### ขั้นตอนที่ 3: Seed ข้อมูลตั้งต้นบน Production (รันครั้งเดียว)
เมื่อ Service บน Render ขึ้นสถานะ **Live**:
1. เปิดแท็บ **Shell** ในหน้า Render Dashboard
2. รันคำสั่ง Seed:
   ```bash
   ADMIN_INITIAL_PASSWORD="<รหัสที่ตั้งไว้ในข้อ 2>" npm run seed:production
   ```
3. สคริปต์จะแสดงตาราง Username, Display Name, Role, Password และ PIN ของ 5 บัญชี:
   - `owner_inthara` (admin) — ใช้รหัสที่คุณตั้งไว้
   - `admin_office` (admin) — รหัสสุ่ม 16 ตัวอักษร + PIN 6 หลัก
   - `qc_production` (staff) — รหัสสุ่ม 16 ตัวอักษร + PIN 6 หลัก
   - `tech_cmms` (staff) — รหัสสุ่ม 16 ตัวอักษร + PIN 6 หลัก
   - `driver_gps` (driver) — รหัสสุ่ม 16 ตัวอักษร + PIN 6 หลัก
   > ⚠️ **คำเตือน:** รหัสผ่านและ PIN ที่สุ่มจะแสดงบนจอเพียงครั้งเดียวเท่านั้น **ต้อง Copy บันทึกเก็บไว้ทันที**

### ขั้นตอนที่ 4: การทดสอบในเบราว์เซอร์จริง (Browser QA Checklist)
เนื่องจากสภาพแวดล้อม CLI ไม่สามารถเปิดคลิกเบราว์เซอร์จริงได้ ให้ทดสอบ flow ดังนี้:
- [ ] **Auth:** ล็อกอินด้วย `owner_inthara` และ `admin_office` แล้วตรวจสอบสิทธิ์
- [ ] **CRM & Pricing:** เพิ่มลูกค้าจริง 1 ราย พร้อมกำหนดพิกัด GPS และ Price Tier
- [ ] **Order Flow:** สร้าง Order ใหม่จากระบบหลังบ้าน และทดสอบสั่งผ่าน Customer Portal
- [ ] **TMS & Delivery:** จัดรถส่งน้ำ, คำนวณ Route Sheet, และทำ Check-in (ตัดสต็อก, ลงหนี้ค้าง, บันทึกถังคืน)
- [ ] **Billing:** ตรวจสอบประวัติหนี้, พิมพ์สลิปใบเสร็จ, และทำการตัดชำระแบบ FIFO
- [ ] **Backup:** ไปที่เมนู Backup แล้วทดสอบกดปุ่ม "สำรองข้อมูลทันที" (ตรวจสอบว่ามีไฟล์ `.db` แสดงในรายการ)

### ขั้นตอนที่ 5: งานค้างเรื่องความปลอดภัยระดับ Git (เมื่อพร้อม)
- **ล้างรหัสผ่านเก่าออกจาก Git History:** ใน commit เก่าของประวัติศาสตร์ Git (ก่อน Phase 1) มีไฟล์ `Inthara_Users_Passwords.xlsx` และรหัสผ่านเดิมฝังอยู่ แม้ว่าในโค้ดปัจจุบันจะลบไฟล์ออกและเปลี่ยนไปใช้ bcrypt hash แล้ว หากต้องการความปลอดภัยขั้นสูงสุด ให้ใช้เครื่องมือ `git-filter-repo` หรือ `BFG Repo-Cleaner` กวาดล้างไฟล์ดังกล่าวออกจากประวัติ Git ทั้งหมด
- *หมายเหตุ: ขั้นตอนนี้ต้องใช้ `git push --force-with-lease` และทุกคนที่มี repository ต้อง re-clone ใหม่*

---

## 5. คำสั่ง Cheat Sheet สำหรับการทำงานประจำวัน

| งานที่ต้องการทำ | คำสั่งที่ใช้ |
| :--- | :--- |
| **รันเซิร์ฟเวอร์ Dev ทั้งหมด (Full-stack)** | `npm run dev` (เปิดคู่กันที่ :3001 และ :5173) |
| **รันเฉพาะ Backend Dev** | `npm run dev:server` |
| **รันเฉพาะ Frontend Dev** | `npm run dev:web` |
| **รันชุดทดสอบทั้งหมด (128 Tests)** | `npm test` |
| **รันเฉพาะ E2E Smoke Flow** | `npm --workspace @inthara/server test -- tests/api/e2e-flow.test.js` |
| **Build Web Bundle สำหรับ Production** | `npm run build` |
| **Seed บัญชีระบบ Production** | `ADMIN_INITIAL_PASSWORD=xxx npm run seed:production` |
| **Docker Build สำหรับทดสอบรัน Local** | `docker build -t inthara-erp-v2 .` |
