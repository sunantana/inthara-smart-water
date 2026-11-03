# 00 — ภาพรวมชุดเอกสาร: ระบบอินธารา อินธารา Smart Water ERP v2

โปรเจกต์: **สร้างระบบบริหารโรงงานน้ำดื่มอินธาราขึ้นใหม่ (Rebuild)** จากระบบเดิม (Express + ไฟล์ JSON) สู่สถาปัตยกรรมที่ถูกต้อง ปลอดภัย และรองรับข้อมูล/ผู้ใช้ที่โตขึ้นได้

## ขั้นตอนการทำงานของทั้งโปรเจกต์ (Division of Labor)

| ขั้น | ผู้รับผิดชอบ | ผลลัพธ์ |
|---|---|---|
| 1. วิเคราะห์ + วางแผน + ออกแบบระบบ | (เอกสารชุดนี้) | SRS, สถาปัตยกรรม, DB Schema, API Spec |
| 2. เขียนโค้ดทั้งโปรเจกต์ | **Freebuff** (AI coding agent) | โค้ดตาม Phase ในไฟล์ 05 |
| 3. ตรวจสอบ + ปรับปรุง + ทดสอบ + Refactor | **Antigravity AI** | รายงาน review, แก้ bug, เพิ่ม test, refactor ตามไฟล์ 06 |
| 4. โอนย้ายข้อมูลจริง | คน + สคริปต์ (ไฟล์ 07) | ข้อมูลเดิมใน SQLite ใหม่ |

## รายการเอกสาร

| ไฟล์ | เนื้อหา | ใช้โดย |
|---|---|---|
| `01_SRS_ความต้องการระบบ.md` | ความต้องการฟังก์ชัน/ไม่ใช่ฟังก์ชัน ทุกโมดูล | Freebuff (ต้นทางความจริง), Antigravity (เทียบตอน review) |
| `02_สถาปัตยกรรมระบบ.md` | โครงสร้างระบบ, tech stack, โฟลเดอร์, มาตรฐานโค้ด, security | Freebuff, Antigravity |
| `03_DB_Schema_SQLite.md` | โครงสร้างตาราง SQL DDL ครบทุกตาราง + index | Freebuff (สร้าง migration), Antigravity |
| `04_API_Spec.md` | REST API ทุก endpoint, รูปแบบ response/error, pagination | Freebuff, Antigravity (ใช้เขียน integration test) |
| `05_แผนงาน_Freebuff_Phases.md` | แผนแบ่ง 11 Phase (0–10) พร้อม prompt สั่งงานราย Phase | ผู้ใช้ → คัดลอกไปสั่ง Freebuff |
| `06_คำสั่ง_Antigravity_Review.md` | คำสั่ง review/ทดสอบ/refactor + checklist ตรวจรับ | ผู้ใช้ → คัดลอกไปสั่ง Antigravity |
| `07_แผน_Migrate_ข้อมูล.md` | ขั้นตอนย้ายข้อมูลจาก JSON/Excel เดิม + การเก็บรหัสผ่านใหม่ | ผู้ใช้ + Freebuff (เขียนสคริปต์) |

## กติกาสำคัญของโปรเจกต์ (อ่านทุกครั้งก่อนสั่งงาน AI)

1. **Single Source of Truth:** ถ้าโค้ดขัดกับเอกสาร ให้ยึดเอกสาร ไฟล์ 01–04 และห้าม "เดาความต้องการ" — ถ้าไม่แน่ใจให้หยุดถาม
2. **เดินตาม Phase เรียงลำดับ:** ห้ามข้าม Phase, ห้ามรวมหลาย Phase ในการสั่งงานครั้งเดียว
3. **ทุก Phase ต้องผ่านการตรวจของ Antigravity ก่อนไป Phase ถัดไป** (มี gate ตรวจรับในไฟล์ 06)
4. **ห้าม commit ข้อมูลจริง/รหัสผ่าน/secret ขึ้น git เด็ดขาด** (ระบบเดิมมี `Inthara_Users_Passwords.xlsx` ใน repo — ห้ามเกิดซ้ำ)
5. เอกสารทั้งชุดเป็นภาษาไทย แต่โค้ด/ชื่อตัวแปร/commit message เป็นภาษาอังกฤษ

## Tech Stack สรุป (รายละเอียดในไฟล์ 02)

- **Backend:** Node.js ≥ 20, Express 4, better-sqlite3 (WAL mode), Zod (validation), JWT access+refresh
- **Frontend:** React 18 + Vite, TanStack Query, Tailwind CSS, Leaflet (แผนที่ TMS)
- **Test:** Vitest + Supertest (backend), React Testing Library (frontend)
- **Deploy:** Docker / Render (เหมือนเดิม) + รองรับรัน local บน Windows
