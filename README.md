# Inthara Smart Water ERP v2

ระบบบริหารจัดการโรงงานผลิตและจัดจำหน่ายน้ำดื่มอินธารา (Inthara Smart Water) อ.ท่าปลา จ.อุตรดิตถ์  
พัฒนาขึ้นใหม่ในรูปแบบโมเดิร์นเว็บแอปพลิเคชัน รองรับการบริหารจัดการ 16 โมดูลธุรกิจครบวงจร

---

## 🏛️ สถาปัตยกรรมระบบ (System Architecture)

- **Backend:** Node.js (>=20), Express 4, better-sqlite3 (WAL Mode + Foreign Keys), Zod Validation, JWT Auth & RBAC (5 บทบาท: `admin`, `manager`, `staff`, `driver`, `portal`), Gzip Compression
- **Database:** SQLite 3 พร้อมระบบ Migration อัตโนมัติ (`server/src/db/migrations/`), Backup อัตโนมัติรายวัน 02:00 น. ด้วยคำสั่ง `VACUUM INTO` และระบบ Restore ปลอดภัย
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, TanStack React Query, React Router DOM (Lazy Code-Splitting ต่อโมดูล)
- **Monorepo:** npm workspaces (`@inthara/server`, `@inthara/web`)

```text
inthara-smart-water/
├── server/                 # Backend API (Express + SQLite)
│   ├── src/
│   │   ├── db/             # Connection, Migrations (001_init.sql)
│   │   ├── middleware/     # Auth, RBAC, Validation, Error Handling, Audit Log
│   │   ├── modules/        # 16 โมดูล (Auth, CRM, Pricing, Orders, Delivery, Billing, TMS,
│   │   │                   #           Production, Inventory, CMMS, Assets, Employees,
│   │   │                   #           Expenses, Portal, Reports, Backup)
│   │   └── utils/          # Logger (Pino), Money (Satang), Geo coordinates
│   ├── scripts/            # Seed scripts (seed-admin, seed-production)
│   └── tests/              # Vitest API Unit/Integration & E2E Tests
├── web/                    # Frontend SPA (React + TypeScript + Vite)
│   ├── src/
│   │   ├── api/            # API Client (Fetch + Error Mapping + Download)
│   │   ├── layouts/        # AppLayout (Sidebar + Navbar)
│   │   └── modules/        # UI Pages & Components
├── docker/                 # Deployment Configurations (v2)
│   ├── Dockerfile.v2       # Multi-stage production container build
│   └── render-v2.yaml      # Render Blueprint specification
└── docs/specs/             # เอกสารข้อกำหนดระบบ (SRS, Design, DB Schema, API Spec)
```

---

## 🚀 การเริ่มต้นพัฒนา (Development)

### ความต้องการของระบบ (Prerequisites)
- Node.js >= 20.0.0
- npm >= 10.0.0

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. รัน Backend ในโหมด Development
```bash
npm --workspace @inthara/server run dev
# หรือ cd server && npm run dev
```
เซิร์ฟเวอร์จะเปิดที่ `http://localhost:3001` (SQLite จะสร้างไฟล์ที่ `server/data/inthara.db` อัตโนมัติพร้อมรัน migration)

### 3. รัน Frontend ในโหมด Development
```bash
npm --workspace web run dev
# หรือ cd web && npm run dev
```
เว็บจะเปิดที่ `http://localhost:5173` พร้อม Reverse Proxy ไปยัง Backend `/api`

---

## 🧪 การทดสอบ (Testing)

รันชุดทดสอบ API Integration และ E2E Smoke Tests ทั้งหมด (Vitest):
```bash
npm --workspace @inthara/server test
# หรือรันเฉพาะ E2E Flow
npm --workspace @inthara/server test -- tests/api/e2e-flow.test.js
```

---

## 📦 การ Build โปรดักชัน (Production Build)

คอมไพล์ TypeScript และสร้างไฟล์ Static Bundle สำหรับ Frontend:
```bash
npm --workspace web run build
```
ผลลัพธ์จะอยู่ที่โฟลเดอร์ `web/dist/`

---

## 🔑 การตั้งค่าข้อมูลเริ่มต้น (Seed Production Accounts)

สร้างบัญชีผู้ใช้จริง 5 บทบาทตามระบบเดิม พร้อมทรัพยากรตั้งต้น (Price Tiers, พนักงาน, รถส่งน้ำ, เครื่องจักร, สต็อกสินค้า):
```bash
# สามารถระบุรหัสผ่านเริ่มต้นของ Admin ผ่าน env ได้ (ถ้าไม่ระบุ ระบบจะสุ่มให้อัตโนมัติ)
ADMIN_INITIAL_PASSWORD=YourSecurePass123! node server/scripts/seed-production.mjs
```
สคริปต์จะพิมพ์ตารางสรุป Username, Display Name, Role, Password และ PIN ออกมาทางหน้าจอ

บัญชีเริ่มต้นที่ถูกสร้าง:
1. `owner_inthara` — เจ้าของกิจการ / ผู้บริหาร (`admin`)
2. `admin_office` — แอดมินสำนักงาน (`admin`)
3. `qc_production` — เจ้าหน้าที่ฝ่ายผลิตและควบคุมคุณภาพ (`staff`)
4. `tech_cmms` — ช่างเทคนิคและซ่อมบำรุงเครื่องจักร (`staff`)
5. `driver_gps` — พนักงานขับรถส่งน้ำ (`driver`)

---

## 🌐 การเสิร์ฟและการ Deploy (Production Serving & Deployment)

### 1. รัน Production Server โดยตรง
ในโหมด `NODE_ENV=production` Backend Express จะทำหน้าที่เสิร์ฟ Static Files จาก `web/dist` และทำ SPA Fallback ให้อัตโนมัติ:
```bash
npm --workspace web run build
NODE_ENV=production node server/src/index.js
```

### 2. รันผ่าน Docker (Multi-stage Build)
ใช้ `docker/Dockerfile.v2` ซึ่งทำการ build web frontend และติดตั้ง production server ให้อัตโนมัติในคอนเทนเนอร์เดียว:
```bash
docker build -f docker/Dockerfile.v2 -t inthara-erp-v2 .

# รันคอนเทนเนอร์พร้อมผูก Volume สำหรับจัดเก็บฐานข้อมูลและไฟล์สำรอง
docker run -d \
  --name inthara-v2 \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e JWT_SECRET=your_production_jwt_secret_key_at_least_32_chars \
  -v inthara-data:/app/data \
  -v inthara-backups:/app/backups \
  inthara-erp-v2
```

### 3. Deploy บน Render.com Cloud
ใช้พิมพ์เขียว `docker/render-v2.yaml` เพื่อตั้งค่า Persistent Disk ขนาด 1GB และรันคอนเทนเนอร์บน Cloud Region Singapore
