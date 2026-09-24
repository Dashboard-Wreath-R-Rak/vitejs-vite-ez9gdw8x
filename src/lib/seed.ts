// ข้อมูลตัวอย่างสำหรับทดลองระบบ (ไม่ใช่ข้อมูลจริง) — สร้างวันที่อิงจากวันนี้
import type { AppData, Asset, Building, MaintenanceEvent, StockMovement, WOStatus, WorkOrder } from './types'
import { addDays, todayISO } from './format'
import { catOf } from './equipment'

export const DATA_VERSION = 1

const parts: AppData['parts'] = [
  { code: 'EE-11', hqCode: 'EE-11', cscCode: 'E-11', name: 'หลอด LED T8 18W', category: 'Electrical', unit: 'หลอด', min: 40, max: 120, boxNo: 'A1', active: true },
  { code: 'EE-12', hqCode: 'EE-12', cscCode: 'E-12', name: 'หลอด LED Downlight 12W', category: 'Electrical', unit: 'ดวง', min: 20, max: 60, boxNo: 'A1', active: true },
  { code: 'EE-43', hqCode: 'EE-43', cscCode: 'E-43', name: 'เบรกเกอร์ 1P 20A', category: 'Electrical', unit: 'ตัว', min: 5, max: 20, boxNo: 'A2', active: true },
  { code: 'EE-44', hqCode: 'EE-44', name: 'ปลั๊กกราวด์คู่', category: 'Electrical', unit: 'ชุด', min: 10, max: 30, boxNo: 'A2', active: true },
  { code: 'EE-54', hqCode: 'EE-54', name: 'สตาร์ทเตอร์ / บัลลาสต์', category: 'Electrical', unit: 'ตัว', min: 10, max: 30, boxNo: 'A3', active: true },
  { code: 'EE-55', hqCode: 'EE-55', name: 'เทปพันสายไฟ', category: 'Electrical', unit: 'ม้วน', min: 12, max: 48, boxNo: 'A3', active: true },
  { code: 'EE-08', cscCode: 'E-08', name: 'สายไฟ VAF 2x2.5', category: 'Electrical', unit: 'ม้วน', min: 28, max: 10, boxNo: 'A4', active: true },
  { code: 'SAN-02', hqCode: 'SAN-02', name: 'ก๊อกน้ำอ่างล้างมือ', category: 'Sanitary', unit: 'ตัว', min: 4, max: 12, boxNo: 'B1', active: true },
  { code: 'SAN-03', hqCode: 'SAN-03', name: 'สายน้ำดี 24"', category: 'Sanitary', unit: 'เส้น', min: 10, max: 30, boxNo: 'B1', active: true },
  { code: 'SAN-05', hqCode: 'SAN-05', name: 'ชุดฟลัชวาล์วชักโครก', category: 'Sanitary', unit: 'ชุด', min: 3, max: 10, boxNo: 'B2', active: true },
  { code: 'SAN-07', hqCode: 'SAN-07', name: 'ซิลิโคนยาแนว', category: 'Sanitary', unit: 'หลอด', min: 6, max: 24, boxNo: 'B2', active: true },
  { code: 'AC-01', hqCode: 'AC-01', name: 'Filter ใยสังเคราะห์ AHU 24x24', category: 'Air Condition', unit: 'แผ่น', min: 30, max: 100, boxNo: 'C1', active: true },
  { code: 'AC-02', hqCode: 'AC-02', name: 'สายพาน B-76', category: 'Air Condition', unit: 'เส้น', min: 4, max: 12, boxNo: 'C2', active: true },
  { code: 'AC-03', hqCode: 'AC-03', name: 'ลูกปืน 6308ZZC3', category: 'Air Condition', unit: 'ตัว', min: 4, max: 10, boxNo: 'C2', active: true },
  { code: 'AC-04', hqCode: 'AC-04', name: 'สายพาน B-68', category: 'Air Condition', unit: 'เส้น', min: 4, max: 12, boxNo: 'C2', active: true },
  { code: 'AC-05', hqCode: 'AC-05', name: 'ลูกปืน 6206ZZ', category: 'Air Condition', unit: 'ตัว', min: 4, max: 10, boxNo: 'C3', active: true },
  { code: 'AC-06', hqCode: 'AC-06', name: 'น้ำยาล้างคอยล์', category: 'Air Condition', unit: 'แกลลอน', min: 2, max: 8, boxNo: 'C3', active: true },
  { code: 'AC-07', hqCode: 'AC-07', name: 'Capacitor 35uF', category: 'Air Condition', unit: 'ตัว', min: 3, max: 10, boxNo: 'C4', active: true },
  { code: 'STOCK-01', hqCode: 'STOCK-01', name: 'สีน้ำอะครีลิก ขาว', category: 'Building', unit: 'แกลลอน', min: 2, max: 6, boxNo: 'D1', active: true },
  { code: 'STOCK-03', hqCode: 'STOCK-03', name: 'แผ่นฝ้ายิปซัม 60x60', category: 'Building', unit: 'แผ่น', min: 10, max: 40, boxNo: 'D1', active: true },
]

const locations: AppData['locations'] = [
  ...['1FL', 'MFL', '2FL', '5FL', '10FL', '15FL', 'Roof'].map((f) => ({ id: 'HQ-' + f, building: 'HQ' as Building, floor: f, name: `HQ ชั้น ${f.replace('FL', '')}` })),
  { id: 'HQ-Common', building: 'HQ', floor: 'Common', name: 'HQ พื้นที่ส่วนกลาง' },
  ...['1FL', '2FL', '3FL'].map((f) => ({ id: 'CSC-' + f, building: 'CSC' as Building, floor: f, name: `CSC ชั้น ${f.replace('FL', '')}` })),
  { id: 'CSC-Common', building: 'CSC', floor: 'Common', name: 'CSC พื้นที่ส่วนกลาง' },
]

const categories: AppData['categories'] = [
  { id: 'EE', nameTh: 'ระบบไฟฟ้าและสื่อสาร', nameEn: 'Electrical System' },
  { id: 'SAN', nameTh: 'ระบบสุขาภิบาล', nameEn: 'Sanitary System' },
  { id: 'AC', nameTh: 'ระบบปรับอากาศ', nameEn: 'Air Condition System' },
  { id: 'BLD', nameTh: 'อาคารและโครงสร้าง', nameEn: 'Building & Structure works' },
  { id: 'OTH', nameTh: 'อื่นๆ', nameEn: 'Others' },
]

const staff: AppData['staff'] = [
  { id: 's1', name: 'กิตติ', aliases: ['K กิตติ', 'คุณกิตติ'], role: 'technician', active: true },
  { id: 's2', name: 'สมชาย', aliases: ['คุณสมชาย'], role: 'technician', active: true },
  { id: 's3', name: 'วีระ', aliases: [], role: 'technician', active: true },
  { id: 's4', name: 'ประชา', aliases: ['คุณประชา', 'K ประชา'], role: 'requester', active: true },
  { id: 's5', name: 'มาลี', aliases: ['คุณมาลี'], role: 'requester', active: true },
  { id: 's6', name: 'อรุณี', aliases: [], role: 'requester', active: true },
  { id: 's7', name: 'ธนากร', aliases: [], role: 'manager', active: true },
]

const vendors: AppData['vendors'] = [
  { id: 'v1', name: 'บจก. แอร์เซอร์วิส (ตัวอย่าง)', role: 'contractor', phone: '02-000-0001', contact: 'คุณเอ', email: 'sales@example-air.co.th' },
  { id: 'v2', name: 'หจก. ไฟฟ้าพัฒนา (ตัวอย่าง)', role: 'supplier', phone: '02-000-0002', contact: 'คุณบี', email: 'order@example-elec.co.th' },
  { id: 'v3', name: 'บจก. เอชวีเอซีซัพพลาย (ตัวอย่าง)', role: 'supplier', phone: '02-000-0003', contact: 'คุณซี', email: 'quote@example-hvac.co.th' },
  { id: 'v4', name: 'บจก. เครื่องปรับอากาศไทย (ตัวอย่าง)', role: 'dealer', phone: '02-000-0004', contact: 'คุณดี' },
  { id: 'v5', name: 'หจก. ช่างรวมวิศวกรรม (ตัวอย่าง)', role: 'installer', phone: '02-000-0005', contact: 'คุณอี' },
]

function ev(no: number, date: string, item: string, price: number | null, by = 'บจก. แอร์เซอร์วิส', fixedFrom?: string): MaintenanceEvent {
  return { no, date, fixed: !!fixedFrom, originalDate: fixedFrom, item, category: catOf(item), price, by, wStart: null, wEnd: null }
}

function buildAssets(): Record<string, Asset> {
  const t = todayISO()
  const y = +t.slice(0, 4)
  const floors = ['1FL', '2FL', '5FL', '10FL', '15FL', '15FL']
  const list: Asset[] = []
  const batchDate = `${y - 1}-03-15`
  floors.forEach((fl, i) => {
    const code = `AHU-${fl.replace('FL', '')}.${(i % 2) + 1}`
    const overhauled = i < 4
    const events: MaintenanceEvent[] = [
      ev(1, '2016-06-00', 'ติดตั้งใหม่ คอยล์เย็น + มอเตอร์พัดลม (Overhaul)', overhauled ? 185000 : null, 'บจก. เครื่องปรับอากาศไทย'),
      ev(2, `2019-0${i + 2}-1${i}`, 'เปลี่ยนสายพาน B-76 จำนวน 2 เส้น', 1800 + i * 50, 'บจก. แอร์เซอร์วิส', `1976-0${i + 2}-1${i}`),
      ev(3, `2021-0${i + 3}-2${i}`, 'เปลี่ยนลูกปืน 6308ZZC3', 3200, 'บจก. แอร์เซอร์วิส', `1978-0${i + 3}-2${i}`),
      ev(4, addDays(t, -560 - i * 7), 'เปลี่ยน Filter ใยสังเคราะห์', 3800),
      ev(5, batchDate, 'เปลี่ยน Filter ใยสังเคราะห์ (ทั้งอาคาร)', 24600),
      ev(6, addDays(t, i === 1 ? -330 : -240 + i * 9), 'เปลี่ยน Filter ใยสังเคราะห์ + ล้างคอยล์', 4100),
    ]
    if (i === 2) events.push(ev(7, addDays(t, -40), 'มอเตอร์พัดลมเสียงดัง เปลี่ยนมอเตอร์ 5.5kW', 28500))
    if (i === 5) events.push(ev(7, addDays(t, -90), 'เปลี่ยน Contactor + Thermostat', 6400), ev(8, addDays(t, -30), 'ซ่อมรอยรั่วถาดน้ำทิ้ง', 2500))
    if (!overhauled) events.shift()
    list.push({
      id: code, code, name: 'Air Handling Unit', type: 'AHU', location: `HQ ${fl} Zone ${i % 2 ? 'B' : 'A'}`,
      installedYear: 1997, lifeMin: 10, lifeMax: 15, vendor: 'บจก. เครื่องปรับอากาศไทย (ตัวอย่าง)', installer: 'หจก. ช่างรวมวิศวกรรม (ตัวอย่าง)',
      specs: ['Brand : Carrier', 'M/D : 39G', `Serial No. : SN-${1000 + i}`, 'H.P. : 7.5', 'Amps : 11.2', 'Volt : 380', 'Speed : 1450 rpm', 'Capacity : 20 TR'],
      belt: 'B-76', bearing: '6308ZZC3', bomLinks: { belt: 'AC-02', bearing: 'AC-03', filter: 'AC-01' },
      events, source: 'ข้อมูลตัวอย่าง', updatedAt: new Date().toISOString(), newPrice: 450000,
    })
  })
  ;['1FL', '2FL', '3FL'].forEach((fl, i) => {
    const code = `FCU-C${i + 1}`
    list.push({
      id: code, code, name: 'Fan Coil Unit', type: 'FCU', location: `CSC ${fl}`, installedYear: 2017, lifeMin: 10, lifeMax: 12,
      vendor: 'บจก. เครื่องปรับอากาศไทย (ตัวอย่าง)', installer: 'หจก. ช่างรวมวิศวกรรม (ตัวอย่าง)',
      specs: ['Brand : Daikin', 'Capacity : 36,000 BTU'], belt: '', bearing: '6206ZZ', bomLinks: { bearing: 'AC-05' },
      events: [
        ev(1, addDays(t, -400), 'ล้างคอยล์ PM ประจำปี', 1500),
        ev(2, addDays(t, -200 + i * 20), 'ล้างคอยล์ PM', 1500),
        ...(i === 0 ? [ev(3, addDays(t, -15), 'เปลี่ยน Capacitor พัดลม', 900)] : []),
      ],
      source: 'ข้อมูลตัวอย่าง', updatedAt: new Date().toISOString(), newPrice: 65000,
    })
  })
  list.push({
    id: 'CH-01', code: 'CH-01', name: 'Water Cooled Chiller', type: 'Chiller', location: 'HQ Roof', installedYear: 2008, lifeMin: 15, lifeMax: 20,
    vendor: 'บจก. เครื่องปรับอากาศไทย (ตัวอย่าง)', installer: 'หจก. ช่างรวมวิศวกรรม (ตัวอย่าง)', specs: ['Brand : Trane', 'Capacity : 300 TR'], belt: '', bearing: '',
    events: [ev(1, '2018-05-10', 'Overhaul คอมเพรสเซอร์', 420000), ev(2, addDays(t, -120), 'เปลี่ยน Sensor อุณหภูมิน้ำเย็น', 12500)],
    source: 'ข้อมูลตัวอย่าง', updatedAt: new Date().toISOString(), newPrice: 6500000,
  })
  list.push({
    id: 'PUMP-01', code: 'PUMP-01', name: 'Chilled Water Pump', type: 'ปั๊มน้ำ', location: 'HQ Roof', installedYear: 2004, lifeMin: 15, lifeMax: 20,
    vendor: '', installer: '', specs: ['H.P. : 15'], belt: '', bearing: '6308ZZC3', bomLinks: { bearing: 'AC-03' },
    events: [ev(1, addDays(t, -700), 'เปลี่ยน Mechanical Seal', 8500), ev(2, addDays(t, -60), 'เปลี่ยนลูกปืนมอเตอร์ปั๊ม', 5200)],
    source: 'ข้อมูลตัวอย่าง', updatedAt: new Date().toISOString(), newPrice: 180000,
  })
  return Object.fromEntries(list.map((a) => [a.id, a]))
}

const DESCS: [string, string, string[], WOStatus[]][] = [
  ['EE', 'เปลี่ยนหลอดไฟห้องประชุมที่ดับ', ['EE-11'], ['completed']],
  ['EE', 'ปลั๊กไฟโต๊ะทำงานไม่มีไฟ ตรวจและเปลี่ยนปลั๊ก', ['EE-44'], ['completed', 'open']],
  ['EE', 'เบรกเกอร์ทริป ตรวจโหลดและเปลี่ยนเบรกเกอร์', ['EE-43'], ['completed', 'in_process']],
  ['SAN', 'ก๊อกน้ำห้องน้ำหญิงรั่ว เปลี่ยนสายน้ำดี', ['SAN-03'], ['completed', 'open']],
  ['SAN', 'ชักโครกน้ำไหลไม่หยุด เปลี่ยนฟลัชวาล์ว', ['SAN-05'], ['completed', 'open']],
  ['AC', 'แอร์ไม่เย็น ล้างคอยล์และเปลี่ยนฟิลเตอร์', ['AC-01', 'AC-06'], ['completed', 'open', 'in_process']],
  ['AC', 'AHU เสียงดัง ตรวจสายพาน เปลี่ยนสายพานใหม่', ['AC-02'], ['completed', 'open']],
  ['BLD', 'ฝ้าเพดานมีคราบน้ำ เปลี่ยนแผ่นฝ้า', ['STOCK-03'], ['completed', 'suspended']],
  ['BLD', 'ทาสีผนังทางเดินที่ลอก', ['STOCK-01'], ['open', 'suspended']],
  ['OTH', 'วัดค่า PM2.5 และอุณหภูมิประจำสัปดาห์', [], ['completed']],
]

function buildWorkOrders(assets: Record<string, Asset>) {
  const t = todayISO()
  const yy = String(new Date().getFullYear() % 100)
  const wos: WorkOrder[] = []
  const hqFloors = ['HQ-1FL', 'HQ-MFL', 'HQ-2FL', 'HQ-5FL', 'HQ-5FL', 'HQ-10FL', 'HQ-15FL', 'HQ-Common']
  const ahus = Object.values(assets).filter((a) => a.type === 'AHU')
  let n = 400
  for (let d = 45; d >= 0; d--) {
    const count = (d * 7) % 3 === 0 ? 2 : d % 4 === 0 ? 0 : 1
    for (let k = 0; k < count; k++) {
      n++
      const i = (n * 7 + d) % DESCS.length
      const [cat, desc, pcs, statuses] = DESCS[i]
      const building: Building = n % 5 === 0 ? 'CSC' : 'HQ'
      const loc = building === 'CSC' ? ['CSC-1FL', 'CSC-2FL', 'CSC-3FL'][n % 3] : hqFloors[n % hqFloors.length]
      const status: WOStatus = d > 10 ? (statuses.includes('completed') ? 'completed' : statuses[0]) : statuses[n % statuses.length]
      const date = addDays(t, -d)
      const isAhu = cat === 'AC' && building === 'HQ' && desc.includes('AHU')
      wos.push({
        jobNo: `${yy}/${n}`, building, createdAt: date + 'T' + String(8 + ((n * 3) % 9)).padStart(2, '0') + ':15:00',
        workDate: date, requesterId: ['s4', 's5', 's6'][n % 3], technicianId: ['s1', 's2', 's3'][n % 3], locationId: loc, categoryId: cat,
        assetCode: isAhu ? ahus[n % ahus.length].code : undefined, description: desc, status, routine: cat === 'OTH',
        parts: pcs.map((p) => ({ partCode: p, qty: p === 'AC-01' ? 4 : p === 'EE-11' ? 3 : 1 })),
      })
    }
  }
  // ตัวอย่างข้อมูลไม่มาตรฐานจากระบบเดิม (P1, P3) ให้หน้า Data Quality ตรวจเจอ
  wos.push({ ...wos[wos.length - 3], createdAt: wos[wos.length - 3].createdAt.replace(':15:', ':17:') })
  wos.push({ ...wos[5], jobNo: '450', parts: [{ partCode: 'Ee-55', qty: 1 }], description: 'พันสายไฟปลั๊กที่ชำรุด', categoryId: 'EE', assetCode: undefined })
  return wos
}

function buildMovements(wos: WorkOrder[]): StockMovement[] {
  const start = addDays(todayISO(), -180)
  const mv: StockMovement[] = []
  const opening: Record<string, [number, number]> = {
    'EE-11': [110, 70], 'EE-12': [30, 20], 'EE-43': [15, 6], 'EE-44': [30, 0], 'EE-54': [12, 0], 'EE-55': [20, 0], 'EE-08': [0, 5],
    'SAN-02': [8, 0], 'SAN-03': [14, 0], 'SAN-05': [9, 0], 'SAN-07': [10, 0], 'AC-01': [95, 0], 'AC-02': [9, 0], 'AC-03': [5, 0],
    'AC-04': [6, 0], 'AC-05': [3, 4], 'AC-06': [9, 0], 'AC-07': [4, 2], 'STOCK-01': [9, 0], 'STOCK-03': [30, 0],
  }
  let i = 0
  Object.entries(opening).forEach(([code, [hq, csc]]) => {
    if (hq || ['EE-11', 'AC-01'].includes(code)) mv.push({ id: 'm' + i++, partCode: code, building: 'HQ', type: 'ADJUST', qty: hq, date: start, recordedBy: 'ยกยอด' })
    if (csc || code === 'EE-08') mv.push({ id: 'm' + i++, partCode: code, building: 'CSC', type: 'ADJUST', qty: csc, date: start, recordedBy: 'ยกยอด' })
  })
  // การเบิกย้อนหลังเพื่อให้ Forecast มีข้อมูล
  for (let d = 170; d > 50; d -= 14) {
    mv.push({ id: 'm' + i++, partCode: 'EE-11', building: 'HQ', type: 'OUT', qty: 3, date: addDays(todayISO(), -d), recordedBy: 'ย้อนหลัง' })
    mv.push({ id: 'm' + i++, partCode: 'EE-11', building: 'CSC', type: 'OUT', qty: 4, date: addDays(todayISO(), -d), recordedBy: 'ย้อนหลัง' })
    mv.push({ id: 'm' + i++, partCode: 'AC-01', building: 'HQ', type: 'OUT', qty: 2, date: addDays(todayISO(), -d), recordedBy: 'ย้อนหลัง' })
  }
  mv.push({ id: 'm' + i++, partCode: 'AC-01', building: 'HQ', type: 'IN', qty: 20, date: addDays(todayISO(), -100), recordedBy: 'กิตติ', note: 'PO-2026-031' })
  wos.forEach((w) => w.parts.forEach((p) => {
    if (p.partCode !== p.partCode.toUpperCase()) return
    const building = w.building === 'CSC' && ['EE-11', 'EE-12', 'EE-43', 'AC-05', 'AC-07', 'EE-08'].includes(p.partCode) ? 'CSC' : 'HQ'
    mv.push({ id: 'm' + i++, partCode: p.partCode, building, type: 'OUT', qty: p.qty, refJobNo: w.jobNo, date: w.workDate, recordedBy: 'Work Order' })
  }))
  return mv
}

function buildPrices(): AppData['prices'] {
  const t = todayISO()
  return [
    { id: 'p1', partCode: 'AC-01', vendorId: 'v1', unitPrice: 410, qty: 60, vatIncluded: true, date: addDays(t, -200), source: 'PO' },
    { id: 'p2', partCode: 'AC-01', vendorId: 'v3', unitPrice: 355, qty: 40, vatIncluded: true, date: addDays(t, -120), source: 'quote' },
    { id: 'p3', partCode: 'AC-02', vendorId: 'v1', unitPrice: 950, qty: 4, vatIncluded: true, date: addDays(t, -150), source: 'PO' },
    { id: 'p4', partCode: 'AC-02', vendorId: 'v3', unitPrice: 820, qty: 6, vatIncluded: true, date: addDays(t, -80), source: 'quote' },
    { id: 'p5', partCode: 'EE-11', vendorId: 'v2', unitPrice: 89, qty: 100, vatIncluded: true, date: addDays(t, -60), source: 'PO' },
    { id: 'p6', partCode: 'EE-43', vendorId: 'v2', unitPrice: 185, qty: 10, vatIncluded: true, date: addDays(t, -90), source: 'PO' },
    { id: 'p7', partCode: 'AC-03', vendorId: 'v3', unitPrice: 1150, qty: 4, vatIncluded: true, date: addDays(t, -40), source: 'quote' },
    { id: 'p8', partCode: 'AC-03', vendorId: 'v1', unitPrice: 1390, qty: 4, vatIncluded: true, date: addDays(t, -300), source: 'history' },
  ]
}

export function seedData(): AppData {
  const assets = buildAssets()
  const workOrders = buildWorkOrders(assets)
  // งานที่เสร็จและระบุรหัสเครื่อง → อยู่ในประวัติเครื่องแล้ว (F4)
  workOrders.forEach((w) => {
    const a = w.assetCode && w.status === 'completed' ? assets[w.assetCode] : undefined
    if (!a || a.events.some((e) => e.jobNo === w.jobNo)) return
    a.events.push({ no: a.events.length + 1, date: w.workDate, fixed: false, item: w.description, category: catOf(w.description), price: null, by: staff.find((s) => s.id === w.technicianId)?.name ?? '', wStart: null, wEnd: null, jobNo: w.jobNo })
  })
  const t = todayISO()
  return {
    version: DATA_VERSION, parts, locations, categories, staff, vendors, workOrders,
    movements: buildMovements(workOrders), assets, prices: buildPrices(),
    challenges: [{
      id: 'c1', partCode: 'AC-01', currentVendorId: 'v1', currentPrice: 410, targetPrice: 360, rfqVendorIds: ['v3'], status: 'reduced',
      deadline: addDays(t, -5), message: '', finalPrice: 365, createdAt: addDays(t, -12) + 'T10:00:00', decidedBy: 'ธนากร',
    }],
    notifications: [], log: [],
    settings: { offerThresholdPct: 5, priceWindowMonths: 12, replaceCostPct: 30, pmWarnDays: 14 },
  }
}
