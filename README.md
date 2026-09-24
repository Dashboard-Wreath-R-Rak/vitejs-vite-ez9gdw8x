# FM Assist — ระบบซ่อมบำรุงอาคาร (Prototype)

ต้นแบบเว็บแอปสำหรับฝ่าย Building Facilities ตาม `PROJECT_SCOPE` (AI Maintenance, Spare Parts & Equipment History Assistant)
เชื่อม **แจ้งซ่อม → ช่างซ่อม (รหัสเครื่อง) → เบิกอะไหล่ → ตัดสต็อก → ประวัติเครื่อง → เตือน → สรุป/วางแผน** ไว้ในระบบเดียว

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## หน้าจอ
| เมนู | ฟีเจอร์ |
|---|---|
| Dashboard | การ์ดสรุป 8 ใบ (คลิกไปหน้ารายการที่กรองไว้), โดนัทสถานะ, กราฟงานรายวันแยกประเภท, AI สรุปสัปดาห์, งานล่าสุด / อะไหล่ที่ต้องสั่ง / PM 7 วัน |
| Work Orders | ตาราง + กรองสถานะ/ประเภท/อาคาร/ชั้น/ช่าง, เปลี่ยนสถานะในตาราง |
| บันทึกงาน (มือถือ) | F1 เช็ก Job ซ้ำ + รูปแบบ YY/NNN, รหัสอะไหล่ต้องมีใน master, เลือกคนจาก Staff · F4 รหัสเครื่อง / เปิดจาก QR · F7 AI แนะนำประเภท/สถานที่/เครื่อง/อะไหล่ |
| เครื่องจักร | ย้ายตรรกะจาก `equipment-register.html` (อัปโหลด Excel, แก้ปี พ.ศ., จัดหมวด, ราคาล็อต, อายุจากงานใหญ่, รอบไส้กรอง) + BOM เช็กสต็อก, QR, Repair-or-Replace, ส่งออก Excel |
| PM Calendar | มุมมองเดือน/รายการ, สีปกติ/ใกล้ถึง/เลยกำหนด, งานประจำ (PM2.5/อุณหภูมิ) เป็น checklist |
| สต็อกอะไหล่ | ยอดคงเหลือ HQ/CSC จาก movement, รับเข้า/ปรับยอด, ป้ายสต็อกต่ำ + จำนวนที่ต้องสั่งถึง MAX, Forecast แนะนำ MIN/MAX |
| เปรียบเทียบราคา | หาราคาต่ำสุดของทุกอะไหล่จากทุก Vendor (ปรับให้รวม VAT + ค่าขนส่งต่อหน่วย), เทียบกับราคาที่ซื้อล่าสุด, ประหยัดได้เท่าไร, แนวโน้มราคา, ส่งออก Excel |
| ราคา & Vendor | F14 Offer (ราคาต่ำกว่า ≥5% ใน 12 เดือน), Challenge (AI ร่างข้อความ, ตรวจไม่ให้มีชื่อ Vendor อื่น, RFQ, สถานะ, เงินที่ประหยัด) |
| รายงาน | F6 สรุปรายเดือน (ตัวเลขคำนวณด้วยโค้ด), ส่งเข้า Google Chat (จำลอง), ส่งออก Excel |
| ถาม AI | F11 ถามภาษาคน เช่น "เครื่องไหนใช้สายพาน B-76", "ปีนี้ AHU ชั้น 15 ใช้เงินเท่าไร" |
| Master Data | Parts / Locations / Staff / Categories / Vendors, ตรวจคุณภาพข้อมูล (P1, P3, P7), เกณฑ์ระบบ, Log การแก้ไข |

## โครงสร้างโค้ด
- `src/lib/equipment.ts` — `parseSheet`, `toDate`, `catOf`, `typeOf`, `metrics`, `batchKeys` (พอร์ตจาก Prototype)
- `src/lib/rules.ts` — validation Work Order, ยอดสต็อก, low-stock, forecast, Offer, data quality
- `src/lib/ai.ts` — ผู้ช่วย AI (เวอร์ชันนี้เป็น rule-based ในเครื่อง ไม่ส่งข้อมูลออก) — เปลี่ยน implementation ได้เมื่อบริษัทอนุมัติ LLM
- `src/lib/store.ts` — การบันทึก (ตัดสต็อก, เพิ่มประวัติเครื่อง, การ์ด Google Chat, log)
- `src/lib/seed.ts` — **ข้อมูลตัวอย่าง** (ไม่ใช่ข้อมูลจริง)

## ข้อจำกัดของต้นแบบ
- ข้อมูลเก็บใน `localStorage` ของเบราว์เซอร์ — ขั้นต่อไปคือเชื่อม Google Sheets / Apps Script ตาม Data Model ในเอกสาร scope
- การแจ้งเตือน Google Chat เป็นการจำลอง (กระดิ่งมุมขวาบน)
- AI เป็น rule-based ทั้งหมด ยังไม่เรียก LLM ภายนอก
