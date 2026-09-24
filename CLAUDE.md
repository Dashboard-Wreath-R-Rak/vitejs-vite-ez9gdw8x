# CLAUDE.md — FM Assist (ระบบซ่อมบำรุงอาคาร)

> สรุปโปรเจกต์สำหรับ Claude Code — อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง
> อธิบายงานกับผู้ใช้เป็น **ภาษาไทย** เสมอ

## 1. โปรเจกต์คืออะไร
ต้นแบบ (Prototype) เว็บแอปของฝ่าย **Building Facilities (Corporate Affairs)** บจก. ตรีเพชรอีซูซุเซลส์
โปรแกรม TPIT AI Academy — AI Business Innovation (ต.ค.–ธ.ค. 2569)

เป้าหมาย: เชื่อม **แจ้งซ่อม → ช่างซ่อม (รหัสเครื่อง) → เบิกอะไหล่ → ตัดสต็อก → บันทึกประวัติเครื่อง → เตือนสต็อกต่ำ/PM → AI สรุป + วางแผน** ไว้ในระบบเดียว
เอกสารต้นทาง: `PROJECT_SCOPE` (v3) และ Prototype `equipment-register.html` (ตรรกะทะเบียนเครื่องจักร)
UI อ้างอิงโครงจาก Quick PM (Sidebar + การ์ดสรุป + กราฟ) — **ห้ามใช้โลโก้/ชื่อ/แบรนด์ของ Quick PM** ใช้ชื่อ "FM Assist" ของเราเอง

## 2. คำสั่ง
```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build — ต้องผ่านก่อน commit
npm run lint      # eslint — ต้องไม่มี error
```
Stack: Vite 7 + React 19 + TypeScript (strict) · recharts · lucide-react · xlsx (SheetJS, dynamic import) · qrcode
ไม่มี router library — ใช้ hash routing เอง (`src/lib/router.ts`) · CSS เขียนเองใน `src/index.css` (ไม่ใช้ Tailwind)

## 3. โครงสร้างไฟล์
```
src/
  App.tsx              Layout (Sidebar + Topbar + กระดิ่ง Google Chat จำลอง + Dark mode) และ switch หน้า
                       /work-orders/new|edit → แสดงแบบ "โทรศัพท์จำลอง" (m-stage/m-phone) ไม่มี sidebar
  index.css            design tokens (:root + dark mode), class ทั่วไป, และส่วน .m-* สำหรับหน้าจอมือถือ
  components/ui.tsx    Card, Tag, AIBadge, Stat, PageHead, Modal, Field, Empty, Bars
  components/QR.tsx    QR code (ลิงก์เปิดฟอร์มพร้อมรหัสเครื่อง)
  lib/types.ts         Data model ทั้งหมด (AppData)
  lib/equipment.ts     ★ ตรรกะจาก Prototype: parseSheet, toDate, catOf, typeOf, metrics, batchKeys,
                       costTotals, replaceSignal, parseWorkbooks
  lib/rules.ts         Validation Job No./รหัสอะไหล่, balances (สต็อก), lowStock, forecast,
                       effectiveUnit (ราคาเทียบได้), findOffer, dataIssues (P1/P3/P7)
  lib/ai.ts            ผู้ช่วย AI (rule-based ในเครื่อง): suggestWorkOrder, suggestEventCategory,
                       weeklySummary, monthReport, challengeDraft, askAI, pmDue
  lib/store.ts         Context + localStorage + actions: saveWorkOrder, setWOStatus, addMovement,
                       upsertAssets, notify (Google Chat จำลอง), log
  lib/seed.ts          ★ ข้อมูลตัวอย่าง (ไม่ใช่ข้อมูลจริง) — DATA_VERSION = 2
  lib/format.ts        fmt, thDate, addDays, uid ฯลฯ
  lib/router.ts        useRoute, go, assetFormUrl
  pages/
    Dashboard.tsx      การ์ด 8 ใบ, AI สรุปสัปดาห์, โดนัทสถานะ, กราฟแท่งรายวัน, ตาราง 3 ชุด
    WorkOrders.tsx     รายการงาน + ตัวกรอง + เปลี่ยนสถานะ
    WorkOrderForm.tsx  ★ ฟอร์มช่างแบบแอปมือถือ 4 ขั้น + bottom sheet + หน้ายืนยัน
    Assets.tsx         ทะเบียนเครื่อง (อัปโหลด Excel) + รายละเอียด (BOM, QR, Repair-or-Replace)
    PMCalendar.tsx     ปฏิทินเดือน/รายการ + งานประจำ checklist
    Inventory.tsx      สต็อก HQ/CSC, รับเข้า/ปรับยอด, forecast MIN/MAX
    Compare.tsx        ★ เปรียบเทียบราคา หาราคาต่ำสุดทุก Vendor (/compare, /compare/:part)
    Prices.tsx         ใบเสนอราคาใหม่ → Offer → Challenge, ทะเบียน Vendor
    Reports.tsx        รายงานรายเดือน, ส่ง Chat (จำลอง), ส่งออก Excel
    AskAI.tsx          ถาม AI ภาษาคน
    Settings.tsx       Master Data (Parts/Locations/Staff/Categories/Vendors), Data quality, เกณฑ์, Log
```

## 4. Routes (hash)
`#/dashboard` · `#/work-orders` (`?status=open|in_process|completed|suspended|pending&cat=`) ·
`#/work-orders/new` (`?asset=AHU-5.1&cat=AC&desc=...`) · `#/work-orders/edit/:jobNo` ·
`#/assets` (`?status=เกินอายุ`) · `#/assets/:id` · `#/pm` · `#/inventory` (`?filter=low`) ·
`#/compare` · `#/compare/:partCode` · `#/prices` (`?part=`) · `#/reports` · `#/ask` · `#/settings` (`?tab=`)

## 5. Flow หลักตอนบันทึก Work Order (`saveWorkOrder` ใน store.ts)
1. เพิ่ม/แทนที่ WorkOrder
2. ลบ movement OUT เดิมของ Job นี้ แล้วลงใหม่ตามอะไหล่ (F2 ตัดสต็อก)
3. ถ้ามี `assetCode` และสถานะ = completed → เพิ่ม MaintenanceEvent ในเครื่อง (`jobNo` ผูกไว้) (F4)
4. ส่งการ์ด Google Chat (จำลองใน `notifications`) + ถ้ามีอะไหล่ใหม่ที่ ≤ MIN → การ์ดสต็อกต่ำ (F3)
5. เขียน `log` (ทุกการแก้ไขต้องมี log)

## 6. กฎธุรกิจ (ห้ามเปลี่ยนโดยไม่ถามผู้ใช้)
- **แก้ปี (P10):** ปี < 2000 และ ปี+43 อยู่ระหว่าง 2000–ปีปัจจุบัน+1 → +43 ปี; ปี > 2400 → −543; เก็บ `originalDate` ไว้เสมอ
- **"MM/YYYY"** → วันที่แบบ `YYYY-MM-00` (รู้แค่เดือน)
- **หมวดประวัติ:** `EV_RULES` ตรวจตามลำดับ · ประเภทเครื่อง: `TYPE_RULES`
- **อายุเครื่อง:** ฐาน = max(ปีติดตั้ง, ปีล่าสุดของงาน ติดตั้ง/ปรับปรุง หรือ คอยล์/ฉนวน) · อายุ > life_max = เกินอายุ · ≥ life_min = ใกล้ครบอายุ
- **ราคาล็อต (P11):** วัน+รายการ+ราคาเดียวกัน ≥ 3 เครื่อง → ตั้งธง; แสดงยอดทั้งตามบันทึกและแบบนับครั้งเดียว/แบ่งเครื่อง
- **รอบ PM ไส้กรอง:** median ช่วงห่าง (≥ 2 ครั้ง, > 20 วัน) → ครั้งถัดไป; เลยวันนี้ = เลยกำหนด
- **Repair-or-Replace:** เกินอายุ และค่าซ่อม 3 ปี (แบ่งราคาล็อต) > X% ของราคาเครื่องใหม่ (`settings.replaceCostPct`, ค่าเริ่มต้น 30)
- **Job No.:** รูปแบบ `YY/NNN` (`"450"` → `"26/450"`), ห้ามซ้ำ · รหัสอะไหล่ตัวใหญ่และต้องมีใน Parts (รองรับรหัส HQ/CSC)
- **สต็อก:** ADJUST = ตั้งยอด, IN = +, OUT = − · ต่ำ = คงเหลือ ≤ MIN · ควรสั่ง = MAX − คงเหลือ
- **ราคาเทียบได้ (`effectiveUnit`):** ราคาในใบ × 1.07 (ถ้าไม่รวม VAT) + ค่าขนส่ง ÷ จำนวน
- **Offer (F14):** ราคาต่ำกว่า ≥ 5% ในช่วง 12 เดือน (ตั้งค่าได้) · Challenge **ห้ามมีชื่อ/เอกสาร Vendor อื่น** (ระบบตรวจแล้ว) · เลือก "ใช้ราคานี้" ต้องใส่เหตุผล
- **AI:** ทุกผลลัพธ์ต้องมีป้าย "AI แนะนำ" + คนกดยืนยัน · ตัวเลขทั้งหมดคำนวณด้วยโค้ด AI แค่เขียนสรุป

## 7. หลักการ UI
- ภาษาไทยเป็นหลัก ฟอนต์ IBM Plex Sans Thai · ใช้บนมือถือได้ทุกหน้า · Dark mode ผ่าน CSS tokens
- สีสถานะ: ปกติ = `--ok` เขียว, เตือน = `--warn` เหลือง, เกิน/ขาด = `--danger` แดง, AI = `--ai` ม่วง
- สีกราฟหลายชุดใช้ `--s1..--s5` (ผ่านการตรวจ colorblind แล้ว) ห้ามใช้สีสถานะแทนชุดข้อมูล
- ฟอร์มช่าง: ปุ่มสูง ≥ 44–48px, ปุ่มบันทึกติดล่างจอ, เลือกด้วยการแตะมากกว่าพิมพ์

## 8. ข้อจำกัด / สิ่งที่ยังไม่ได้ทำ
- ข้อมูลอยู่ใน **localStorage** (key `facilities-cmms-data`) — เปลี่ยน `DATA_VERSION` ใน seed.ts เมื่อโครงสร้างข้อมูลเปลี่ยน (ข้อมูลเก่าจะถูกรีเซ็ต)
- **ยังไม่เชื่อม Google Sheets / Apps Script / Google Chat จริง** — ต้องขอดูโค้ด Apps Script และโครงสร้าง Sheet จริงก่อน อย่าเดา
- **AI ยังไม่เรียก LLM** — รออนุมัติจากบริษัท; เปลี่ยนเฉพาะ implementation ใน `lib/ai.ts` (คง signature เดิม) · API key ต้องเก็บใน Script Properties ห้าม hard-code · ส่งข้อมูลให้ AI เท่าที่จำเป็น (PDPA)
- สแกน QR ด้วยกล้องยังไม่ทำ (ให้เลือกจากรายการแทน)
- `xlsx@0.18.5` มีช่องโหว่ที่ประกาศแล้ว — ควรอัปเกรดเป็นเวอร์ชันจาก cdn.sheetjs.com ก่อนใช้งานจริง
- ข้อมูลใน seed.ts เป็นตัวอย่างทั้งหมด (Vendor มีคำว่า "(ตัวอย่าง)")

## 9. ขั้นต่อไปที่แนะนำ (ตาม Scope)
1. Phase 0: ขอสำเนา Sheet Work Order Log / Master Inventory / ใบประวัติจริง → ทดสอบ import และ data quality
2. ย้าย store เป็น Google Sheets (1 ชีตต่อ 1 ตาราง ตาม Data Model) ผ่าน Apps Script Web App
3. ต่อ Google Chat webhook จริงแทน `notify()`
4. เปลี่ยน `lib/ai.ts` เป็น LLM ที่บริษัทอนุมัติ
5. คำถามที่ยังเปิดอยู่: ดูข้อ 11 ใน PROJECT_SCOPE (ใครดูแลโค้ดเดิม, HQ/CSC ใช้ Sheet เดียวกันไหม, ราคาเครื่องใหม่แต่ละประเภท ฯลฯ)

## 10. วิธีทำงานในโปรเจกต์นี้
- ทำงานบน branch `claude/gracious-keller-ajffje` · ก่อน commit ต้อง `npm run build` และ `npm run lint` ผ่าน
- ตรวจหน้าจอด้วย Playwright (Chromium อยู่ที่ `/opt/pw-browsers`) ทั้งขนาด 1280px และ 390px
- เขียนโค้ดเป็นโมดูลเล็ก · ตรรกะไว้ใน `lib/` หน้าจอไว้ใน `pages/`
- ข้อมูลไม่ชัด → ถามผู้ใช้ก่อน · การแก้ข้อมูลอัตโนมัติต้องมี log และย้อนกลับได้ · ไม่ลบข้อมูลเอง (รายงานให้คนตรวจ)

## 11. ประวัติการพัฒนา
| Commit | งาน |
|---|---|
| Build FM Assist maintenance app prototype | โครงแอปทั้งหมด 10 หน้า + ตรรกะจาก Prototype + ข้อมูลตัวอย่าง |
| Add price comparison page | หน้าเปรียบเทียบราคา หาราคาต่ำสุด (รวม VAT + ค่าขนส่ง) |
| Redesign the work order form as a phone app screen | ฟอร์มช่างแบบแอปมือถือ 4 ขั้น + กรอบโทรศัพท์บนคอม |
