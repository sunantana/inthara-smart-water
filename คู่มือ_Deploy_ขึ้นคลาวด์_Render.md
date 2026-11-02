# 🚀 คู่มือการนำระบบน้ำดื่มอินธาราขึ้นคลาวด์ 24 ชม. (Render.com)

ระบบ **Inthara Smart Water ERP** ได้รับการปรับโครงสร้างและเตรียมไฟล์คอนฟิกสำหรับขึ้น Cloud Production เรียบร้อยแล้ว (รองรับ Linux Container, Bind `0.0.0.0`, Node.js 20, มี `render.yaml` และ `Dockerfile` พร้อมใช้งาน)

---

## 📋 ภาพรวมขั้นตอน (3 ขั้นตอนง่ายๆ ใช้เวลาประมาณ 5 นาที)

1. **สร้าง GitHub Repository** (ใช้เวลา 1 นาที)
2. **รันไฟล์ `PUSH_TO_GITHUB.bat`** เพื่อส่งโค้ดขึ้น GitHub (ใช้เวลา 1 นาที)
3. **เชื่อมต่อกับ Render.com** และกด Deploy (ใช้เวลา 2-3 นาที)

---

## ขั้นตอนที่ 1: สร้าง Repository บน GitHub
1. เข้าไปที่ [GitHub.com](https://github.com) (หากยังไม่มีบัญชี สามารถกด Sign up สมัครฟรีได้ทันที)
2. กดปุ่ม **New Repository** (หรือเครื่องหมาย `+` มุมขวาบน)
3. ตั้งชื่อ Repository เช่น: `inthara-smart-water-erp`
4. เลือกระดับเป็น **Private** (เพื่อความปลอดภัยของข้อมูลโรงงาน) หรือ **Public**
5. **ไม่ต้องติ๊ก** Add README, .gitignore หรือ License
6. กดปุ่ม **Create repository**
7. คัดลอก URL ของ Repository (เช่น `https://github.com/your-username/inthara-smart-water-erp.git`)

---

## ขั้นตอนที่ 2: ส่งโค้ดขึ้น GitHub
1. ในโฟลเดอร์โปรแกรมนี้ ดับเบิ้ลคลิกที่ไฟล์ **`PUSH_TO_GITHUB.bat`**
2. วาง URL ที่คัดลอกมาจากขั้นตอนที่ 1 แล้วกด **Enter**
3. ระบบจะอัปโหลดโค้ด, ฐานข้อมูลโรงงาน, และหน้าเว็บขึ้น GitHub ให้โดยอัตโนมัติ

---

## ขั้นตอนที่ 3: เปิดบริการบน Render.com (ฟรี 24 ชม.)
1. เข้าสู่ระบบที่ [Render.com](https://dashboard.render.com) (กดปุ่ม **Continue with GitHub**)
2. ที่หน้าแดชบอร์ด กดปุ่ม **New +** ที่มุมขวาบน แล้วเลือก **Web Service**
3. เลือก **Build and deploy from a Git repository** แล้วกด **Next**
4. เลือกโปรเจกต์ `inthara-smart-water-erp` ที่เพิ่งอัปโหลด แล้วกด **Connect**
5. ตั้งค่า (ระบบจะดึงจาก `render.yaml` ให้อัตโนมัติ):
   * **Name:** `inthara-smart-water-erp`
   * **Region:** `Singapore` (ใกล้ประเทศไทยที่สุด เพื่อความเร็วสูงสุด)
   * **Branch:** `main`
   * **Runtime:** `Node`
   * **Build Command:** `npm install`
   * **Start Command:** `node server.js`
   * **Instance Type:** `Free`
6. กดปุ่ม **Create Web Service** ด้านล่างสุด

---

## 🎉 ผลลัพธ์
* ระบบจะสร้างเซิร์ฟเวอร์เสร็จสมบูรณ์ภายใน 2-3 นาที
* คุณจะได้รับ URL ลิงก์ HTTPS ใช้งานจริง เช่น:
  👉 **`https://inthara-smart-water-erp.onrender.com`**
* เข้าใช้งานผ่านมือถือ/แท็บเล็ตได้ทุกที่ทั่วโลกตลอด 24 ชั่วโมง โดยไม่ต้องเปิดคอมพิวเตอร์ทิ้งไว้ครับ
