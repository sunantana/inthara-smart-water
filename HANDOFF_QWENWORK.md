# งานส่งต่อ — สำหรับ QwenWork

**จาก:** Buffy (Freebuff)
**ถึง:** QwenWork / Antigravity AI
**วันที่:** 3 พฤศจิกายน 2026
**สาขา:** `security/p0-fixes`
**สถานะ:** แก้โค้ด + ทดสอบฝั่งเซิร์ฟเวอร์เสร็จแล้ว — **ยังไม่ deploy, ยังไม่ merge เข้า `main`**

> อ่าน [`SECURITY_FIX_REPORT.md`](SECURITY_FIX_REPORT.md) ประกอบเสมอ — ที่นี่เป็น "สิ่งที่ต้องรู้ก่อนแตะโค้ด + งานที่ต้องทำต่อ"

---

## 1. สรุปสั้นใน 5 บรรทัด

ระบบ Inthara Smart Water ERP เดิมเปิด API ทั้งระบบให้ใครก็เข้าถึงได้โดยไม่ต้องล็อกอิน และเปิดเผยรหัสผ่านจริงของทุกบัญชีในหน้า public
รอบนี้ปิดช่องโหว่วิกฤต 6 ข้อ + ปรับ UI อีก 5 จุด และทดสอบด้วย curl จริงแล้วว่า endpoint ที่เคยเปิดโล่งตอบ `401` และสิทธิ์ผู้บริหารตอบ `403` ถูกต้อง
**สิ่งที่ยังไม่ได้ทำและสำคัญที่สุด คือ เปลี่ยนรหัสผ่านจริงทั้ง 5 บัญชี** เพราะถือว่ารั่วไปแล้วทั้งหน้าเว็บและ Git history

---

## 2. ไฟล์ที่เปลี่ยน (6 ไฟล์ + 1 เอกสาร)

| ไฟล์ | หัวใจของการแก้ |
|------|----------------|
| `server.js` | `app.set('trust proxy',1)` (บรรทัด 24), CORS allowlist (71–76), `PUBLIC_API_PATTERNS` + `requireStaffSession` + `app.use` (85–105), `requireRole`/`denyRole` (108–114), rate limit login (588) / PIN reset (647), guard ผู้บริหาร 7 endpoint (682, 710, 763, 781, 831, 861, 882), `update-users-excel` ไม่รีเซ็ตรหัสผ่านเป็นค่า default |
| `public/app.js` | fetch interceptor แนบ Bearer + 401 → หน้า login (48–72), ห้ามดึงข้อมูลก่อนล็อกอิน (140), `downloadWithAuth` (2917), โหลดข้อมูลทันทีหลังล็อกอิน (2987), ลบ `applyQuickRoleMode`/`fillLoginPreset`/`?role=` |
| `public/index.html` | ปลดล็อกการซูม (5), `darkMode:'class'` (11), `#tmsMap` responsive (139), touch 44px (217), `xs:`→`sm:` (533), ลบ prefill รหัสผ่าน (347/357/375), ปุ่ม export 4 จุดใช้ `downloadWithAuth` |
| `public/portal.html` | ซ่อน Username/Password/PIN ทั้ง 5 กล่อง, ลิงก์ `?role=` → `/` |
| `Inthara_All_Levels_Secure_Portal.html` | ลบลิงก์ `?role=` 6 จุด (ไฟล์ local ไม่อยู่ใน `public/`) |
| `เข้าใช้งานระบบ_อินธารา_ครบทุกระดับ.bat` | ลบลิงก์ `?role=` 5 จุด |
| `SECURITY_FIX_REPORT.md` | รายงานฉบับเต็ม (ปัญหา → บรรทัด → คำสั่งตรวจ → งานค้าง) |

**ไม่ได้แตะ:** `data/*.json`, `*.xlsx`, `.gitignore`, `Dockerfile`, `render.yaml`, `public/customer.html`

---

## 3. ผลทดสอบที่ยืนยันแล้ว (ห้ามเชื่อก่อนรันซ้ำ)

```bash
npm ci
PORT=3000 node server.js
```

| เคส | ผลที่ได้ |
|-----|----------|
| no-auth `GET /api/data`, `/api/security/audit`, `/api/security/download-excel`, `/api/cloud/files`, `POST /api/reset`, `/api/cloud/pull` | `401` ทั้งหมด ✅ |
| login `owner_inthara` → `GET /api/data` / `/api/security/audit` | `200` / `200` ✅ |
| login `admin_office` → `/api/data` / `audit` / `download-excel` / `reset` | `200` / `403` / `403` / `403` ✅ |
| CORS `Origin: https://evil.example` | ไม่มี header `Access-Control-Allow-Origin` ✅ |
| login ผิด 25 ครั้ง | `429` ตั้งแต่ครั้งที่ 20 ✅ |
| `/api/customer-portal/pin/login` ไม่มี token พนักงาน | `400` (ไม่ใช่ 401) = พอร์ทัลลูกค้ายังใช้ได้ ✅ |
| `/portal.html` | `200` และไม่มี `Inthara@` เหลือ ✅ |
| `node --check server.js`, `node --check public/app.js` | ผ่านทั้งคู่ ✅ |

**ยังไม่ได้ทดสอบ:** การคลิกจริงในเบราว์เซอร์ (สภาพแวดล้อมที่ผมใช้ไม่มี browser automation) → ต้องมีคนกดทดสอบ: ล็อกอิน, รีเฟรชหน้า, ล้าง localStorage, ดาวน์โหลด Excel 4 ปุ่ม, มุมมองมือถือ, ปุ่มสลับธีม

---

## 4. งานที่ต้องทำต่อ (เรียงลำดับ ห้ามข้าม)

### P0 — ต้องทำก่อน deploy ขึ้น production
1. **เปลี่ยนรหัสผ่าน + PIN ทั้ง 5 บัญชี** ที่เคยแสดงใน `portal.html`:
   `owner_inthara`, `admin_office`, `qc_production`, `tech_cmms`, `driver_gps` — รหัสเดิม (`Inthara@...2026!`) และ PIN (`1988/2200/3300/4400/5500`) ถือว่ารั่วแล้ว
2. **ย้าย JWT secret ไป env**: `data/security_auth.json` เก็บ `secretKey` ที่ใช้เซ็น token (`server.js:583, 634`) → ใช้ `process.env.AUTH_SECRET` และปฏิเสธการ start ถ้าไม่มีค่าใน production
3. **ตั้ง env บน Render**: `AUTH_SECRET`, `CORS_ORIGINS` (ถ้ามีโดเมนหน้าบ้านจริง), `PORT` (มีอยู่แล้ว)
4. **ทดสอบในเบราว์เซอร์จริง** ตามหัวข้อ 3 ก่อนประกาศว่าเสร็จ

### P1 — ความปลอดภัยรอบสอง
5. ล้างรหัสผ่านออกจาก Git history (`Inthara_Users_Passwords.xlsx`, `data/security_auth.json`, `data/inthara_db.json`) ด้วย `git filter-repo` หรือ BFG — **ต้องสำรองก่อนและแจ้งเจ้าของ เพราะทุกเครื่องต้อง clone ใหม่**
6. เลิกเก็บ `passwordPlain` (เก็บเฉพาะ hash) หรือถ้าจำเป็นต้องคงตารางแก้รหัสผ่าน ให้เข้ารหัสไฟล์ด้วย key จาก env + log audit ทุกครั้งที่เปิดดู (`/api/security/audit` ยังไม่ถูกบันทึกว่า "อ่าน")
7. เพิ่ม security headers: CSP (ต้อง allowlist CDN ที่หน้าเว็บใช้: tailwind, leaflet, unpkg, Google Fonts ไม่งั้นหน้าเว็บพัง), `X-Frame-Options: DENY`, `Referrer-Policy`
8. เปลี่ยน `staffAllowed` (localhost bypass) ใน `/api/customers/:id/reset-pin`, `/unlock`, `/access-status` ให้เป็น executive/admin เท่านั้น

### P2 — ประสิทธิภาพ/UX (ไม่เกี่ยวกับความปลอดภัย)
9. gzip/brotli (`app.js` 359 KB + `index.html` 266 KB ส่งดิบ)
10. cache header สำหรับ static, sidebar ถาวรบนเดสก์ท็อป, ตารางเป็น card บนมือถือ, PWA (ห้าม cache `/api/*`)
11. ย้าย `data/inthara_db.json` → SQLite (ปัจจุบันเขียนทับทั้งไฟล์ เสี่ยงข้อมูลหาย)
12. rate limit แบบถาวร (Redis/DB) — ปัจจุบันอยู่ใน memory หายเมื่อ restart

---

## 5. กฎที่ต้องรักษาไว้ (สำคัญมาก)

- **ห้าม force push `main`** และห้ามเขียน history ใหม่โดยไม่แจ้งเจ้าของ
- **ห้าม commit** ไฟล์ `data/*.json`, `*.xlsx`, `.env`, `node_modules/`, `scratch/`
- **ห้ามลบ/รีเซ็ตข้อมูลจริง** — `POST /api/reset` ล้างทั้งระบบ
- ตอนรันเซิร์ฟเวอร์ ระบบจะเขียน `data/security_auth.json` ใหม่ (re-hash) → `git checkout -- data/security_auth.json` ก่อน commit ทุกครั้ง
- ทดสอบ rate limit ด้วย username ปลอม (`nosuch_user`) เท่านั้น อย่าใช้บัญชีจริง (จะถูกล็อก 15 นาที)
- endpoint ใหม่ที่เพิ่มภายหลังจะถูก middleware บล็อกโดยอัตโนมัติ (deny by default) — ถ้าต้องการให้ public ต้องเติมใน `PUBLIC_API_PATTERNS` เท่านั้น

---

## 6. เอกสารที่ต้องขอจากเจ้าของก่อนทำงาน Phase 0 (rebuild)

มีคำขอ "Phase 0 — โครงร่างโปรเจกต์ + ฐานข้อมูล" ค้างอยู่ แต่ยังไม่มีเอกสารเหล่านี้ใน workspace:
- `00_README_ภาพรวม.md`
- `01_SRS` (ข้อกำหนดระบบ)
- `02_สถาปัตยกรรมระบบ.md`
- `03_DB_Schema_SQLite.md` (ใช้สร้าง `001_init.sql`)
- `04_API_Spec` (ถ้ามี)

**ห้ามเดา DDL หรือ API** — ต้องได้ไฟล์จริงก่อน ตามกฎ "ถ้าเอกสารขัดกันหรือไม่ชัด ให้หยุดแล้วถาม"

---

## 7. Checklist ตรวจรับก่อน merge

- [ ] `npm ci` ผ่าน และ `node --check server.js` / `node --check public/app.js` ผ่าน
- [ ] 6 endpoint ที่เคยเปิดโล่งตอบ `401` เมื่อไม่มี token
- [ ] `admin_office` ได้ `403` บน endpoint ผู้บริหาร แต่ยังใช้ `/api/data` ได้
- [ ] login ผิด 20 ครั้งขึ้นไปได้ `429`
- [ ] `/portal.html` ไม่มีชื่อผู้ใช้/รหัสผ่าน/PIN
- [ ] `data/security_auth.json` ไม่ปรากฏใน `git diff` ของ commit
- [ ] ทดสอบในเบราว์เซอร์จริงครบ 6 ข้อในหัวข้อ 3
- [ ] เปลี่ยนรหัสผ่านทั้ง 5 บัญชีแล้ว
