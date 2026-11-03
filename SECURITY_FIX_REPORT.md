# รายงานการแก้ไขความปลอดภัย — Inthara Smart Water ERP

**วันที่แก้ไข:** 3 พฤศจิกายน 2026
**ขอบเขตงาน:** ปิดช่องโหว่ระดับวิกฤต (P0) + ปรับ UI ที่ปลอดภัยต่อการแก้โดยไม่ต้องเห็นหน้าจอ
**สถานะ:** แก้โค้ดและทดสอบฝั่งเซิร์ฟเวอร์แล้ว — **ยังไม่ commit / ยังไม่ push** (รอผู้ใช้สั่ง)
**เอกสารนี้เขียนเพื่อให้ AI ตัวอื่น (Antigravity) ตรวจซ้ำและทำงานส่วนที่เหลือต่อ**

---

## 1. สรุปสำหรับผู้บริหาร

ก่อนการแก้ไข ระบบนี้มีช่องโหว่ที่ทำให้ **ใครก็ตามที่เปิดเบราว์เซอร์ เห็นข้อมูลทั้งบริษัทได้ทันที** โดยไม่ต้องล็อกอิน:

| # | ช่องโหว่ | ระดับ | สถานะ |
|---|----------|-------|--------|
| 1 | API เกือบทั้งหมด (43 จาก ~44 endpoint) ไม่ตรวจสิทธิ์ → ดึงข้อมูลลูกค้า/ออเดอร์/ต้นทุน/เงินเดือนได้ฟรี | 🔴 วิกฤต | ✅ แก้แล้ว |
| 2 | `/api/security/audit` คืน **รหัสผ่านจริง + PIN ของทุกบัญชี** ให้ใครก็ได้ | 🔴 วิกฤต | ✅ แก้แล้ว |
| 3 | ลิงก์ `/?role=executive` ล็อกอินเข้าสู่ระบบเป็นผู้บริหารอัตโนมัติ (รหัสผ่านฮาร์ดโค้ดใน `app.js`) | 🔴 วิกฤต | ✅ แก้แล้ว |
| 4 | `portal.html` (หน้า public) พิมพ์ชื่อผู้ใช้/รหัสผ่าน/PIN ของทั้ง 5 บัญชีไว้ตรง ๆ | 🔴 วิกฤต | ✅ แก้แล้ว |
| 5 | `GET /api/security/download-excel` ดาวน์โหลดไฟล์รหัสผ่านทั้งบริษัทได้โดยไม่ต้องล็อกอิน | 🔴 วิกฤต | ✅ แก้แล้ว |
| 6 | `POST /api/reset` ล้างฐานข้อมูลทั้งระบบได้โดยไม่ต้องล็อกอิน | 🔴 วิกฤต | ✅ แก้แล้ว |
| 7 | CORS = `*` (เว็บอื่นอ่านข้อมูล ERP ข้ามโดเมนได้) | 🟠 สูง | ✅ แก้แล้ว |
| 8 | ไม่มี rate limit ที่ `/api/auth/login` และ PIN 4 หลักใช้เดารหัสผ่านได้ไม่จำกัด | 🟠 สูง | ✅ แก้แล้ว |
| 9 | ฟอร์มล็อกอิน prefill ชื่อผู้ใช้ + รหัสผ่านจริงไว้ใน HTML | 🟠 สูง | ✅ แก้แล้ว |
| 10 | ดาวน์โหลด Excel (ในหน้าเว็บ) เป็นลิงก์ตรง → พังหลังใส่ระบบสิทธิ์ | 🟡 กลาง | ✅ แก้แล้ว |

**ยังเหลือ (ต้องให้เจ้าของระบบตัดสินใจ/ทำต่อ):** เปลี่ยนรหัสผ่านจริงทั้ง 5 บัญชี, ล้างรหัสผ่านออกจาก Git history, ย้าย secret ไป env, เพิ่ม CSP — ดูหัวข้อ 6

---

## 2. ไฟล์ที่แก้ไข

| ไฟล์ | การเปลี่ยนแปลง | จำนวนจุด |
|------|----------------|----------|
| `server.js` | middleware บังคับล็อกอินทุก API, CORS allowlist, trust proxy, rate limit, สิทธิ์ผู้บริหาร 7 endpoint, ไม่รีเซ็ตรหัสผ่านเป็นค่า default | 12 |
| `public/app.js` | fetch interceptor แนบ Bearer token ทุกคำขอ + จัดการ 401, บังคับล็อกอินก่อนดึงข้อมูล, ลบ auto-login `?role=`, ลบ `fillLoginPreset`, เพิ่ม `downloadWithAuth`, โหลดข้อมูลทันทีหลังล็อกอิน | 7 |
| `public/index.html` | viewport ให้ซูมได้, `darkMode:'class'`, แผนที่ responsive, touch target 44px, `xs:`→`sm:`, ลบ prefill รหัสผ่าน, เปลี่ยนลิงก์ export เป็นปุ่มที่แนบ token | 12 |
| `public/portal.html` | ซ่อน Username/Password/PIN ทั้ง 5 กล่อง, เปลี่ยนลิงก์ `?role=` เป็นหน้าเข้าสู่ระบบ | 11 |
| `Inthara_All_Levels_Secure_Portal.html` | ลบลิงก์ `?role=` (6 จุด) — ไฟล์นี้ไม่ถูกเสิร์ฟผ่านเว็บ (อยู่นอก `public/`) | 6 |
| `เข้าใช้งานระบบ_อินธารา_ครบทุกระดับ.bat` | ลบลิงก์ `?role=` (5 จุด) | 5 |

**ไม่ได้แก้ (ตั้งใจ):** `data/*.json`, `*.xlsx`, `.gitignore`, `Dockerfile`, `render.yaml`, `public/customer.html` — เหตุผลอยู่ในหัวข้อ 6

---

## 3. รายละเอียดการแก้ไข (ตรวจซ้ำได้ทีละจุด)

### 3.1 `server.js` — บังคับล็อกอินทุก `/api/*` (จุดสำคัญที่สุด)

**ก่อนแก้:** ในทั้งไฟล์มีการเรียก `getAuthUser(req)` เพื่อตรวจสิทธิ์เพียงไม่กี่แห่ง (เช่น `change-password`, staff tools) — ที่เหลือเปิดโล่งทั้งหมด

**หลักฐานก่อนแก้ (ทดสอบจริง):**
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/data                       # → 200 (ข้อมูล 143 KB)
curl -s http://127.0.0.1:3000/api/security/audit | head -c 300                              # → เผย passwordPlain + pin ทั้ง 5 บัญชี
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/security/download-excel     # → 200 (ได้ไฟล์ .xlsx)
curl -s -X POST -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/reset              # → 200 (ล้าง DB)
```

**หลังแก้ — `server.js:85–114`:**
```js
const PUBLIC_API_PATTERNS = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/reset-password-by-pin$/,
  /^\/api\/customer-portal\//
];

function requireStaffSession(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();          // ไฟล์ static ผ่านได้
  if (PUBLIC_API_PATTERNS.some((re) => re.test(req.path))) return next();
  const user = getAuthUser(req);
  if (!user || !user.role) {
    return res.status(401).json({ ok: false, needLogin: true, error: '...' });
  }
  req.staffUser = user;
  next();
}
app.use(requireStaffSession);   // บรรทัด 105

function requireRole(req, roles) { ... }   // 108
function denyRole(res) { ... }             // 112
```

**หลักการออกแบบที่ต้องรักษาไว้:**
- ค่า default คือ "ห้าม" (deny by default) — endpoint ใหม่ที่เพิ่มภายหลังจะถูกบล็อกอัตโนมัติ ไม่ต้องมานั่งเติม guard ทีละตัว
- allowlist มี 3 กลุ่มเท่านั้น: ล็อกอินพนักงาน, รีเซ็ตรหัสผ่านด้วย PIN, พอร์ทัลลูกค้า (`/api/customer-portal/*` ใช้ `x-portal-token` ของตัวเอง)
- middleware วาง**หลัง** `express.static` เพื่อให้หน้าเว็บ/login gate โหลดได้ก่อนล็อกอิน

### 3.2 `server.js:71–76` — CORS แบบ allowlist

```js
const corsAllowlist = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: corsAllowlist.length ? corsAllowlist : false }));
```
- `false` = ไม่แนบ header `Access-Control-Allow-Origin` เลย → same-origin ยังทำงานปกติ แต่เว็บภายนอกอ่านคำตอบไม่ได้
- ถ้าอนาคตมีโดเมนหน้าบ้านจริง ให้ตั้ง env `CORS_ORIGINS=https://a.com,https://b.com` (ไม่ต้องแก้โค้ด)

### 3.3 `server.js:24` — `app.set('trust proxy', 1)`

จำเป็นเพราะแอปอยู่หลัง reverse proxy (Render / Cloudflare / preview tunnel) ถ้าไม่ตั้ง `req.ip` จะเป็น IP ของ proxy ทำให้ **rate limit กลายเป็นของทั้งระบบ** แทนที่จะเป็นรายผู้ใช้

### 3.4 `server.js` — rate limit 2 จุด

| จุด | บรรทัด | ค่า | เหตุผล |
|-----|--------|-----|--------|
| `POST /api/auth/login` | 588 | 20 ครั้ง / 15 นาที / IP | เดิมไม่จำกัดเลย (มีแค่ล็อกบัญชีเมื่อผิด 5 ครั้ง ซึ่งทำให้คนร้ายล็อกเจ้าของได้) |
| `POST /api/auth/reset-password-by-pin` | 647 | **5 ครั้ง / 15 นาที / IP** | PIN เป็นเลข 4 หลัก = 10,000 ค่า เดาไม่กี่นาทีก็ครบ |

ใช้ฟังก์ชัน `rateLimited(req, key, max, windowMs)` เดิมของโปรเจกต์ (ไม่เพิ่ม dependency)

### 3.5 `server.js` — สิทธิ์ผู้บริหาร 7 endpoint

| Endpoint | บรรทัด | สิทธิ์ที่ยอม | เหตุผล |
|----------|--------|--------------|--------|
| `GET /api/security/audit` | 682 | executive | คืน `passwordPlain` + `pin` ของทุกบัญชี |
| `POST /api/security/update-users-excel` | 710 | executive | เขียนรหัสผ่านทุกบัญชีใหม่ |
| `POST /api/security/pull-excel-drive` | 763 | executive | ดึงไฟล์รหัสผ่านจาก Drive มาทับ |
| `GET /api/security/download-excel` | 781 | executive | ดาวน์โหลดไฟล์รหัสผ่านทั้งบริษัท |
| `POST /api/cloud/sync` | 831 | executive, admin | ซิงก์ DB ขึ้นคลาวด์ |
| `POST /api/cloud/pull` | 861 | executive, admin | ดึง DB จากคลาวด์มาทับทั้งระบบ |
| `POST /api/reset` | 882 | executive | ล้างฐานข้อมูลทั้งระบบ |

รูปแบบเดียวกันทุกจุด (ตรวจง่าย):
```js
const actor = requireRole(req, ['executive']);
if (!actor) return denyRole(res);
```

> **หมายเหตุการออกแบบ:** endpoint กลุ่ม staff tools (`/api/customers/:id/reset-pin`, `/unlock`, `/access-status`) **คงพฤติกรรมเดิม** (`staffAllowed` = executive/admin หรือ localhost) เพราะไม่ได้อยู่ในรายการที่อนุมัติให้แก้ — ดูหัวข้อ 6.6 ว่าควรทำอะไรต่อ

### 3.6 `server.js:710–742` — ไม่รีเซ็ตรหัสผ่านเป็นค่า default อีกต่อไป

**ก่อนแก้:**
```js
const pass = String(u.passwordPlain || 'Inthara@2026!').trim();
```
ถ้า frontend ส่งข้อมูลมาโดยไม่มีรหัสผ่าน **ทุกบัญชีจะถูกรีเซ็ตเป็นรหัสผ่านเดียวกัน** ที่ใคร ๆ ก็รู้

**หลังแก้:** ถ้าไม่มีรหัสผ่าน → คงค่าเดิม (`salt`/`hash`/`passwordPlain`) ไว้ เปลี่ยนเฉพาะ field ที่ส่งมา
```js
if (!pass) {
  const existing = secData.users.find(e => e.username === String(u.username).trim()) || secData.users[idx];
  if (existing) return { ...existing, level, displayName, role, pin, active, dashboardNote, failedAttempts: 0, lockUntil: null };
}
```

### 3.7 `public/app.js:44–72` — fetch interceptor

เดิมมีแค่ 3–4 จุดใน 7,310 บรรทัดที่แนบ `Authorization` header จึงเลือกแก้ที่จุดเดียว:
```js
const PUBLIC_API_PATHS = ['/api/auth/login', '/api/auth/reset-password-by-pin', '/api/customer-portal/'];
const nativeFetch = window.fetch.bind(window);
window.fetch = async function (input, init) {
  ...
  if (isApi && !isPublicApi && authToken) headers.set('Authorization', 'Bearer ' + authToken);
  const res = await nativeFetch(input, options);
  if (isApi && !isPublicApi && res.status === 401) logoutAndShowLoginGate();
  return res;
};
```
- ครอบทุก fetch เดิม (~28 endpoint) โดยไม่ต้องแก้ทีละจุด
- 401 = session หมดอายุ → เด้งกลับหน้าเข้าสู่ระบบทันที (เดิมหน้าจอค้างและพัง)

### 3.8 `public/app.js` — บังคับล็อกอินก่อนดึงข้อมูล (บรรทัด 140)

```js
// ต้องเข้าสู่ระบบก่อนเสมอ: ไม่มี token = แสดงหน้าเข้าสู่ระบบและห้ามดึงข้อมูล
if (!authToken) { logoutAndShowLoginGate(); return; }
```
และ `fetchAllData()` (บรรทัด ~226) เพิ่มการตรวจ `res.status === 401` + `data.ok === false` เพื่อไม่ให้ error object ไปทับ `appData` (เดิมจะทำให้ `renderAllViews()` พังทั้งหน้า)

หลังล็อกอินสำเร็จ (บรรทัด 2987) เพิ่ม `await fetchAllData();` เพื่อให้หน้าแรกมีข้อมูลทันที ไม่ต้องกด refresh

### 3.9 `public/app.js` — ลบช่องโหว่ auto-login

**ลบทั้งฟังก์ชัน `applyQuickRoleMode()`** ซึ่งมีรหัสผ่านฮาร์ดโค้ด 5 บัญชี:
```js
executive: ['owner_inthara', 'Inthara@Owner2026!'], ...
```
พร้อมลบ **`fillLoginPreset()`** ที่เติมรหัสผ่านจริงลงฟอร์มล็อกอิน และลบการอ่าน `?role=` ใน `DOMContentLoaded`
→ ผล: ลิงก์ `/?role=executive` ไม่ทำอะไรอีกต่อไป (เปิดหน้าเข้าสู่ระบบตามปกติ) และไม่มีรหัสผ่านในซอร์สอีก

### 3.10 `public/app.js:2917` — `downloadWithAuth(url, filename)`

ลิงก์ `<a href="/api/...">` แนบ header ไม่ได้ → หลังใส่ระบบสิทธิ์จะได้ 401 ฟังก์ชันนี้ fetch เป็น blob แล้วสั่งดาวน์โหลด (ใช้กับ 4 ปุ่มใน `index.html`)

### 3.11 `public/index.html` — UI ที่แก้ (ปลอดภัย ไม่ต้องเห็นหน้าจอ)

| บรรทัด | เดิม | ใหม่ | เหตุผล |
|--------|------|------|--------|
| 5 | `maximum-scale=1.0, user-scalable=no` | เอาzoom lock ออก | ผู้ใช้ต้องซูมได้ (accessibility) |
| 11 | ไม่มี config | `tailwind.config = { darkMode: 'class' }` | โค้ดใช้ `html.dark` + `dark:` 42 จุด แต่ Tailwind default = `'media'` → **ปุ่มสลับธีมไม่ทำงานเลย** (ยืนยันแล้วว่า `customer.html` ตั้งค่าถูก ส่วน `index.html` ลืม) |
| 139 | `#tmsMap { height: 540px }` | `clamp(260px, 55vh, 540px)` | ค่า 540px ตายตัวชนะคลาส responsive → บนมือถือกินจอเกินครึ่ง |
| 217 | `min-height: 36px` | `44px` | มาตรฐาน touch target (Apple HIG / WCAG) |
| 533 | `hidden xs:inline` | `hidden sm:inline` | ไม่มี breakpoint `xs` ใน Tailwind → ป้าย "เมนู" หายตลอด |
| 347, 357, 375 | `value="owner_inthara"`, `value="Inthara@Owner2026!"` | ลบทิ้ง + ใส่ `autocomplete` | รหัสผ่านจริงถูกฝังใน HTML (ใครเปิด view-source เห็น) |
| 596, 987, 1146, 2223 | `<a href="/api/...export-excel">` | `<button onclick="downloadWithAuth(...)">` | ลิงก์ตรงแนบ token ไม่ได้ |

### 3.12 `public/portal.html` — ปิดการเผยรหัสผ่าน (หน้า public ที่ใครก็เปิดได้)

เดิมมี 5 กล่องแสดง `Username / Password / 2FA PIN` ตรง ๆ (เช่น `owner_inthara` / `Inthara@Owner2026!` / `1988`)
แก้เป็น:
```html
<div class="...">🔒 ข้อมูลเข้าใช้งานถูกซ่อนไว้เพื่อความปลอดภัย — กรุณาติดต่อผู้ดูแลระบบเพื่อรับบัญชีของคุณ</div>
```
และลิงก์ `/?role=executive|admin|production_qc|technician|driver` ทั้ง 6 จุด → `href="/"`
ข้อมูลบทบาท/หน้าที่ของแต่ละระดับยังคงอยู่ (ไม่กระทบการใช้งาน)

---

## 4. ผลการทดสอบจริง (รันหลังแก้)

สภาพแวดล้อม: `PORT=3000 node server.js` บน VM (Node 26, `npm ci` ผ่าน)

### 4.1 endpoint ที่เคยเปิดโล่ง — ตอนนี้ถูกบล็อก
```
1) no-auth GET /api/data            -> 401
2) no-auth GET /api/security/audit  -> 401
3) no-auth GET download-excel       -> 401
4) no-auth GET /api/cloud/files     -> 401
5) no-auth POST /api/reset          -> 401
6) no-auth POST cloud/pull          -> 401
7) public GET /portal.html          -> 200   (หน้า public ยังเปิดได้)
```

### 4.2 ล็อกอินยังใช้งานได้ + สิทธิ์แยกตามบทบาท
```
8)  login owner_inthara       -> ได้ token (1,086 ตัวอักษร)
9)  owner + GET /api/data     -> 200
10) owner + GET security/audit-> 200   (ผู้บริหารเห็นข้อมูลรหัสผ่าน ตามที่ออกแบบ)

admin_office (ไม่ใช่ผู้บริหาร):
    GET /api/data                -> 200   (ใช้งาน ERP ได้ตามปกติ)
    GET /api/security/audit      -> 403
    GET /api/security/download-excel -> 403
    POST /api/reset              -> 403
```

### 4.3 CORS / ข้อมูลรั่วในหน้า public
```
11) header Access-Control-Allow-Origin เมื่อ Origin: https://evil.example -> 0 (ไม่มี = ถูกต้อง)
12) จำนวน "Inthara@" ใน /portal.html -> 0
```

### 4.4 rate limit
```
login ผิด 25 ครั้งติด: 401 ×19 → 429 ตั้งแต่ครั้งที่ 20  onward  ✅
```

### 4.5 พอร์ทัลลูกค้ายังใช้งานได้ (ไม่ถูก middleware บล็อก)
```
POST /api/customer-portal/pin/login (ไม่มี token พนักงาน) -> 400 (validation) ไม่ใช่ 401 ✅
```

### 4.6 หน้าเว็บ/ไฟล์ static
```
/  /index.html  /portal.html  /customer.html  /app.js  -> 200 ทั้งหมด
node --check server.js  -> ผ่าน
node --check public/app.js -> ผ่าน
```

### 4.7 ⚠️ ยังไม่ได้ทดสอบ (ต้องทำในเบราว์เซอร์จริง)
Cloud workspace นี้ **ไม่มี browser automation** จึงยังไม่ได้คลิกทดสอบ:
- ล็อกอินจริง → เห็นแดชบอร์ดมีข้อมูล
- รีเฟรชหน้า → ยังอยู่ในระบบ (token ใน localStorage)
- ล้าง localStorage → กลับหน้าเข้าสู่ระบบ (ไม่เห็นข้อมูล)
- กดปุ่ม "ส่งออก Excel" ทั้ง 4 ปุ่ม → ได้ไฟล์จริง
- รีเซ็ตรหัสผ่านด้วย PIN → สำเร็จ
- มุมมองมือถือ: แผนที่ TMS, ปุ่ม ≥44px, ป้าย "เมนู", ปุ่มสลับธีม dark/light

---

## 5. วิธีรันและตรวจซ้ำ (สำหรับ Antigravity)

```bash
# 1) เตรียมสภาพแวดล้อม (VM นี้ไม่เก็บ node_modules หลัง archive)
npm ci

# 2) รันเซิร์ฟเวอร์ (พอร์ต 3000 ถูกจองไว้สำหรับ preview)
PORT=3000 node server.js

# 3) ชุดทดสอบความปลอดภัย (คัดลอกวางได้เลย)
B=http://127.0.0.1:3000
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
echo "no-auth /api/data          -> $(code $B/api/data)"                    # ต้องได้ 401
echo "no-auth /api/security/audit-> $(code $B/api/security/audit)"          # ต้องได้ 401
echo "no-auth download-excel    -> $(code $B/api/security/download-excel)"  # ต้องได้ 401
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"owner_inthara","password":"<รหัสจริง>"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||''))")
echo "with token /api/data      -> $(code -H "Authorization: Bearer $TOKEN" $B/api/data)"        # ต้องได้ 200
echo "CORS foreign origin       -> $(curl -s -o /dev/null -D - -H 'Origin: https://evil.example' $B/api/data | grep -ci 'access-control-allow-origin')"  # ต้องได้ 0
```

**ข้อควรระวังเวลาทดสอบ:**
- ทดสอบ rate limit ด้วย username ที่ไม่มีจริงเท่านั้น (`nosuch_user`) อย่าใช้บัญชีจริง เพราะจะทำให้บัญชีถูกล็อก 15 นาที
- ตัวนับ rate limit อยู่ใน memory → `kill` แล้ว start ใหม่ = ล้างค่า
- การ start เซิร์ฟเวอร์จะเขียน `data/security_auth.json` ใหม่ (re-hash) → คืนค่าด้วย `git checkout -- data/security_auth.json` ก่อน commit

---

## 6. งานที่ยังเหลือ (เรียงตามความสำคัญ) — สำหรับ Antigravity

### 6.1 🔴 เปลี่ยนรหัสผ่านจริงทั้ง 5 บัญชี (ทำทันทีหลัง deploy รอบนี้)
รหัสผ่านเดิมถูกเปิดเผยในหน้า public ไปแล้ว (และอยู่ใน Git history) ถือว่ารั่วแล้ว:
```
owner_inthara / Inthara@Owner2026! / PIN 1988
admin_office  / Inthara@Admin2026! / PIN 2200
qc_production / Inthara@QC2026!    / PIN 3300
tech_cmms     / Inthara@Tech2026!  / PIN 4400
driver_gps    / Inthara@Driver2026!/ PIN 5500
```
- เปลี่ยนผ่านหน้า "จัดการรหัสผ่าน Excel" (ผู้บริหารเท่านั้น) หรือแก้ `data/security_auth.json`
- เปลี่ยน PIN ทั้ง 5 เป็นค่าที่ไม่สัมพันธ์กับปี/ชื่อ
- ห้ามใช้รหัสผ่านซ้ำกับระบบอื่น

### 6.2 🔴 ล้างรหัสผ่านออกจาก Git history
ไฟล์ที่เคย track และมีข้อมูลลับ:
- `Inthara_Users_Passwords.xlsx` (รหัสผ่านทั้งบริษัท)
- `data/security_auth.json` (มี `passwordPlain`, `pin`, `salt`, `hash`, `secretKey`)
- `data/inthara_db.json` (ข้อมูลลูกค้า/ยอดขายจริง)

แนวทาง (ต้องสำรองก่อน — เป็น operation ที่ย้อนยาก):
```bash
git clone --mirror <repo> repo-backup.git        # สำรอง
# ใช้ git-filter-repo (แนะนำ) หรือ BFG
git filter-repo --path Inthara_Users_Passwords.xlsx --path data/security_auth.json --invert-paths
```
จากนั้น **rotate secret ทุกตัว** (เปลี่ยนรหัสผ่าน + `secretKey`) เพราะถือว่ารั่วแล้ว
> ⚠️ อย่าทำเองโดยไม่แจ้งเจ้าของ: การเขียน history ใหม่ทำให้ทุกเครื่องต้อง clone ใหม่

### 6.3 🔴 ย้าย secret ไป environment variable
- `data/security_auth.json` เก็บ `secretKey` ที่ใช้เซ็น JWT (`server.js:583, 634`) — ถ้าไฟล์นี้รั่ว ผู้โจมตี **ปลอม token ผู้บริหารได้ทันที**
- แนะนำ: `process.env.AUTH_SECRET` + ปฏิเสธการ start ถ้าไม่มีค่า (production)
- ตั้งค่าบน Render ที่ Environment → `AUTH_SECRET`, `CORS_ORIGINS`

### 6.4 🟠 เลิกเก็บรหัสผ่านแบบถอดกลับได้
ปัจจุบันเก็บทั้ง `hash` (PBKDF2) และ `passwordPlain` คู่กัน เพื่อฟีเจอร์ "ตารางแก้ไขรหัสผ่าน"
- ทางเลือกที่ปลอดภัยกว่า: เก็บเฉพาะ hash + ให้ "ตั้งรหัสใหม่" แทนการ "ดูรหัสเดิม"
- ถ้าจำเป็นต้องคงฟีเจอร์: จำกัดให้เห็นเฉพาะ executive (ทำแล้ว) + เข้ารหัสไฟล์ด้วย key จาก env + บันทึก audit ทุกครั้งที่เปิดดู (ปัจจุบัน `recordAudit` ยังไม่ log การ "อ่าน" `/api/security/audit` — ควรเพิ่ม)

### 6.5 🟠 เพิ่ม security header ที่ยังไม่มี (`server.js:29` มีอยู่บางส่วน)
แนะนำ `helmet` หรือใส่เอง: `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`
ระวัง: หน้านี้โหลด CDN (tailwind, leaflet, unpkg, Google Fonts) → CSP ต้อง allowlist โดเมนเหล่านี้ ไม่งั้นหน้าเว็บพัง

### 6.6 🟡 endpoint staff tools ที่ยังใช้ `staffAllowed` (localhost bypass)
`/api/customers/:id/reset-pin`, `/unlock`, `/access-status` (ราวบรรทัด 2400+) ยอมให้ request จาก `127.0.0.1` ผ่านได้โดยไม่ต้องมีสิทธิ์
- ตอนนี้ middleware บังคับ token แล้ว จึงไม่ใช่ช่องโหว่ที่ใช้จากภายนอกได้
- แต่ถ้ามี SSRF หรือมีคนรันสคริปต์บนเครื่องเซิร์ฟเวอร์ จะข้ามสิทธิ์ได้ → ควรเปลี่ยนเป็น executive/admin เท่านั้น และถ้าต้องมีสคริปต์ภายใน ให้ใช้ service token

### 6.7 🟡 เรื่องประสิทธิภาพ/UX ที่ยังไม่ได้ทำ (ไม่เกี่ยวกับความปลอดภัย)
1. **ไม่มี gzip/brotli**: `app.js` 359 KB + `index.html` 266 KB ส่งดิบทุกครั้ง → ใส่ `compression` middleware (ลดเหลือ ~1/4)
2. **`Cache-Control: public, max-age=0`** บน static → ตั้ง `maxAge` + `immutable` สำหรับ asset ที่มี hash
3. **Sidebar บน desktop**: เมนูซ่อนใน drawer ต้องกด ☰ ทุกครั้ง → ควรเป็น sidebar ถาวรที่ ≥1024px
4. **ตารางบนมือถือ**: ยังเป็นตารางกว้าง ต้องเลื่อนแนวนอน → เปลี่ยนเป็น card layout ที่ <640px
5. **PWA**: ยังไม่มี manifest/service worker → เพิ่มเพื่อใช้งานออฟไลน์หน้างาน (ข้อควรระวัง: ห้าม cache `/api/*`)
6. **ย้ายจาก JSON ไฟล์ไป SQLite** (`data/inthara_db.json` เขียนทับทั้งไฟล์ทุกครั้ง → เสี่ยงข้อมูลหายถ้า process ตายกลางทาง)
7. **Rate limit ermanent**: ตัวนับอยู่ใน memory หายเมื่อ restart → ย้ายไป Redis/ตาราง DB ถ้าต้องการจริงจัง

### 6.8 🟡 เรื่อง Repository
- `.gitignore` ปัจจุบันมีแค่ `node_modules/`, `*.log`, `.DS_Store` → ยังไม่กัน `data/`, `backups/`, `.env`
- **ห้าม untrack `data/*.json` ทันที** ถ้า Render ใช้ repo เป็น seed ตอน deploy (จะทำให้ข้อมูลเริ่มต้นหาย) → ทางที่ปลอดภัย: ย้ายข้อมูลตั้งต้นไป `data/seed/*.json` ที่ไม่มีข้อมูลจริง แล้วให้ runtime เขียนลง `data/` ที่ ignore

---

## 7. Checklist สำหรับตรวจรับ

**เซิร์ฟเวอร์**
- [x] `node --check server.js` ผ่าน
- [x] `/api/data`, `/api/security/audit`, `/api/security/download-excel`, `/api/cloud/*`, `/api/reset` ตอบ 401 เมื่อไม่มี token
- [x] `admin_office` ได้ 403 บน endpoint ผู้บริหาร แต่ยังใช้ `/api/data` ได้
- [x] `owner_inthara` ล็อกอินได้และได้ 200 ทั้ง `/api/data` และ `/api/security/audit`
- [x] ไม่มี `Access-Control-Allow-Origin` เมื่อ Origin ภายนอก
- [x] login ผิด 20 ครั้ง → 429
- [x] `/api/customer-portal/*` ยังเข้าได้โดยไม่ต้องมี token พนักงาน
- [ ] ⬜ เปลี่ยนรหัสผ่านทั้ง 5 บัญชี (ข้อ 6.1)

**ฟรอนต์**
- [x] `node --check public/app.js` ผ่าน
- [x] ไม่พบ `applyQuickRoleMode` / `fillLoginPreset` / `Inthara@...` ในไฟล์ที่เสิร์ฟ
- [x] `portal.html` ไม่มีชื่อผู้ใช้/รหัสผ่าน/PIN
- [ ] ⬜ คลิกทดสอบในเบราว์เซอร์ (หัวข้อ 4.7)

**ก่อน commit**
- [ ] `git checkout -- data/security_auth.json` (คืนไฟล์ที่เซิร์ฟเวอร์เขียนตอน start)
- [ ] ตรวจ `git diff` ว่าไม่มีข้อมูลจริง/รหัสผ่านหลุดเข้าไปในรอบนี้

---

## 8. ข้อจำกัดของรายงานนี้

1. ทดสอบผ่าน HTTP (curl) เท่านั้น — **ยังไม่มีการทดสอบในเบราว์เซอร์จริง** เพราะสภาพแวดล้อม Cloud ไม่มี browser automation ต้องให้ผู้ใช้คลิกตรวจตามหัวข้อ 4.7
2. ไม่ได้ทดสอบบนมือถือจริง — การแก้ CSS อ้างอิงค่ามาตรฐาน (44px, `clamp()`, breakpoint) แต่ยังไม่เห็นผลด้วยตา
3. ไม่ได้แตะข้อมูลจริง: ไม่มีการลบ/เขียนทับฐานข้อมูลระหว่างทดสอบ (ยกเว้น `POST /api/reset` ที่ทดสอบเฉพาะกรณีถูกบล็อก 401/403 เท่านั้น — ไม่ได้ให้ผ่าน)
4. ตัวเลข "43 จาก ~44 endpoint" มาจากการนับด้วย `grep -cE "^app\.(get|post|put|delete)\('/api/"` บนโค้ดก่อนแก้
