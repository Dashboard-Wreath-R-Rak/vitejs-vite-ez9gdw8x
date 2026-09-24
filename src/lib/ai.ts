// ผู้ช่วย AI — เวอร์ชันนี้ทำงานในเครื่อง (rule-based) ไม่ส่งข้อมูลออกภายนอก
// ตัวเลขทั้งหมดคำนวณด้วยโค้ด ส่วนนี้ทำหน้าที่ "เขียนสรุป / แนะนำ" เท่านั้น
// เมื่อบริษัทอนุมัติ LLM แล้ว ให้เปลี่ยน implementation ของฟังก์ชันในไฟล์นี้ (อินพุต/เอาต์พุตเดิม)
import type { AppData, Asset, Part, Vendor, WorkOrder } from './types'
import { addDays, fmt, thDate, todayISO } from './format'
import { batchCountsOf, batchKeys, EV_CATS, metrics, replaceSignal } from './equipment'
import { balances, findPart, lowStock, STATUS_LABEL } from './rules'

export const AI_ENGINE = 'ผู้ช่วยในเครื่อง (rule-based)'

// ---------- F7: แนะนำการกรอก Work Order ----------
const WO_CAT_RULES: [RegExp, string][] = [
  [/pm\s*2\.?5|ฝุ่น|วัดอุณหภูมิ|อุณหภูมิประจำ|ตรวจเช็คประจำ/i, 'OTH'],
  [/แอร์|ahu|fcu|ไม่เย็น|คอยล์|ฟิลเตอร์|filter|สายพาน|คอมเพรสเซอร์|chiller|ชิลเลอร์|ลมไม่ออก/i, 'AC'],
  [/หลอด|ไฟดับ|ไฟฟ้า|ปลั๊ก|เบรกเกอร์|breaker|สายไฟ|สวิตช์|ไฟกระพริบ|โทรศัพท์|แลน|lan/i, 'EE'],
  [/ก๊อก|ท่อ|น้ำรั่ว|รั่ว|ชักโครก|สุขภัณฑ์|อ่างล้าง|สายน้ำดี|ส้วม|ปั๊มน้ำ|ท่อตัน/i, 'SAN'],
  [/ฝ้า|ผนัง|ประตู|หน้าต่าง|กระเบื้อง|ทาสี|สี|หลังคา|พื้น|กุญแจ/i, 'BLD'],
]
const PART_HINTS: [RegExp, string][] = [
  [/หลอด.*(downlight|ดาวน์ไลท์)/i, 'EE-12'], [/หลอด|ไฟดับ/i, 'EE-11'], [/เบรกเกอร์|breaker|ทริป/i, 'EE-43'],
  [/ปลั๊ก/i, 'EE-44'], [/สายน้ำดี|ก๊อก.*รั่ว/i, 'SAN-03'], [/ก๊อก/i, 'SAN-02'], [/ชักโครก|ฟลัช/i, 'SAN-05'],
  [/ฟิลเตอร์|filter|ไม่เย็น/i, 'AC-01'], [/สายพาน|belt|เสียงดัง/i, 'AC-02'], [/ลูกปืน|bearing/i, 'AC-03'],
  [/ล้างคอยล์/i, 'AC-06'], [/คาปา|capacitor/i, 'AC-07'], [/ฝ้า/i, 'STOCK-03'], [/ทาสี/i, 'STOCK-01'],
]

export interface WOSuggestion {
  categoryId?: string
  routine: boolean
  locationId?: string
  assetCode?: string
  partCodes: string[]
  reasons: string[]
}

export function suggestWorkOrder(text: string, data: AppData): WOSuggestion {
  const s: WOSuggestion = { routine: false, partCodes: [], reasons: [] }
  if (text.trim().length < 4) return s
  for (const [re, id] of WO_CAT_RULES) {
    if (re.test(text)) {
      s.categoryId = id
      const c = data.categories.find((c) => c.id === id)
      s.reasons.push(`ประเภทงาน "${c?.nameEn}" จากคำว่า "${text.match(re)![0]}"`)
      break
    }
  }
  if (s.categoryId === 'OTH') { s.routine = true; s.reasons.push('เป็นงานประจำ (ไม่ใช่งานซ่อม) — แยกเป็น checklist') }
  const fl = text.match(/ชั้น\s*(\d+|m)|(\d+)\s*fl/i)
  if (fl) {
    const f = (fl[1] || fl[2]).toUpperCase() + 'FL'
    const loc = data.locations.find((l) => l.floor === f)
    if (loc) { s.locationId = loc.id; s.reasons.push(`สถานที่ ${loc.name}`) }
  }
  const code = text.match(/\b(AHU|FCU|CH|PUMP)[\s-]*([\w.]+)/i)
  if (code) {
    const k = (code[1] + '-' + code[2]).toUpperCase()
    const a = Object.values(data.assets).find((a) => a.code.toUpperCase() === k)
    if (a) { s.assetCode = a.code; s.reasons.push(`เครื่อง ${a.code}`) }
  }
  for (const [re, p] of PART_HINTS) {
    if (re.test(text) && data.parts.some((x) => x.code === p) && !s.partCodes.includes(p)) s.partCodes.push(p)
    if (s.partCodes.length >= 2) break
  }
  if (s.partCodes.length) s.reasons.push('อะไหล่ที่มักใช้กับงานลักษณะนี้: ' + s.partCodes.join(', '))
  return s
}

// ---------- F7: จัดหมวดรายการประวัติที่ rule จัดไม่ได้ ----------
const EXTRA_EV_RULES: [RegExp, string][] = [
  [/คอมเพรสเซอร์|compressor|พัดลม|ใบพัด|\bfan\b/i, 'มอเตอร์'],
  [/ถาดน้ำ|ท่อน้ำทิ้ง|drain/i, 'อื่นๆ'],
  [/seal|ซีล|ปะเก็น/i, 'อื่นๆ'],
  [/overhaul|ยกเครื่อง/i, 'ติดตั้ง/ปรับปรุง'],
  [/ตรวจเช็ค|ตรวจสอบ|บำรุงรักษา|service/i, 'ไส้กรอง/PM'],
]
export function suggestEventCategory(item: string): string | null {
  for (const [re, c] of EXTRA_EV_RULES) if (re.test(item) && c !== 'อื่นๆ' && EV_CATS.includes(c)) return c
  return null
}

// ---------- F6: สรุปสัปดาห์ / เดือน ----------
export interface SummaryLine { text: string; link?: string; tone?: 'ok' | 'warn' | 'danger' | 'info' }

const catName = (d: AppData, id: string) => d.categories.find((c) => c.id === id)?.nameTh ?? id
const locName = (d: AppData, id: string) => d.locations.find((l) => l.id === id)?.name ?? id

function topBy<T>(list: T[], key: (x: T) => string) {
  const m: Record<string, number> = {}
  list.forEach((x) => { const k = key(x); m[k] = (m[k] || 0) + 1 })
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

export function pmDue(data: AppData) {
  const t = todayISO()
  return Object.values(data.assets)
    .map((a) => ({ a, m: metrics(a) }))
    .filter((x) => x.m.next)
    .map((x) => ({ ...x, overdue: x.m.next! < t, soon: x.m.next! >= t && x.m.next! <= addDays(t, data.settings.pmWarnDays) }))
}

export function weeklySummary(data: AppData): SummaryLine[] {
  const t = todayISO()
  const since = addDays(t, -7)
  const week = data.workOrders.filter((w) => w.workDate >= since && !w.routine)
  const pending = data.workOrders.filter((w) => w.status === 'open' || w.status === 'in_process')
  const lines: SummaryLine[] = []
  lines.push({ text: `7 วันที่ผ่านมามีงานซ่อม ${week.length} งาน เสร็จแล้ว ${week.filter((w) => w.status === 'completed').length} งาน`, link: '#/work-orders' })
  if (pending.length) {
    const [cat, n] = topBy(pending, (w) => w.categoryId)[0]
    const [loc] = topBy(pending.filter((w) => w.categoryId === cat), (w) => w.locationId)[0]
    const pct = Math.round((n / pending.length) * 100)
    lines.push({ text: `งานค้าง ${pending.length} งาน — ${pct}% เป็นงาน${catName(data, cat)} ส่วนใหญ่ที่ ${locName(data, loc)}`, link: `#/work-orders?status=pending&cat=${cat}`, tone: 'warn' })
  }
  const low = lowStock(data)
  if (low.length) lines.push({ text: `อะไหล่ต่ำกว่า MIN ${low.length} รายการ เช่น ${low.slice(0, 2).map((l) => `${l.part.name} (${l.building} เหลือ ${l.onHand})`).join(', ')}`, link: '#/inventory?filter=low', tone: 'danger' })
  const repeat = repeatAssets(data, 90)
  if (repeat.length) lines.push({ text: `เครื่องที่เสียซ้ำใน 90 วัน: ${repeat.slice(0, 3).map((r) => `${r.code} (${r.n} ครั้ง)`).join(', ')}`, link: '#/assets', tone: 'warn' })
  const pm = pmDue(data)
  const od = pm.filter((x) => x.overdue)
  if (od.length) lines.push({ text: `PM เปลี่ยนไส้กรองเลยกำหนด ${od.length} เครื่อง (${od.slice(0, 3).map((x) => x.a.code).join(', ')})`, link: '#/pm', tone: 'danger' })
  return lines.slice(0, 5)
}

export function repeatAssets(data: AppData, days: number) {
  const since = addDays(todayISO(), -days)
  const m: Record<string, number> = {}
  data.workOrders.filter((w) => w.assetCode && w.workDate >= since).forEach((w) => { m[w.assetCode!] = (m[w.assetCode!] || 0) + 1 })
  Object.values(data.assets).forEach((a) => a.events.forEach((e) => {
    if (!e.jobNo && e.date && e.date >= since && e.category !== 'ไส้กรอง/PM') m[a.code] = (m[a.code] || 0) + 1
  }))
  return Object.entries(m).filter(([, n]) => n >= 2).map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n)
}

export interface MonthReport {
  month: string
  wos: WorkOrder[]
  byCategory: [string, number][]
  byFloor: [string, number][]
  topParts: { part: Part | undefined; code: string; qty: number }[]
  repeat: { code: string; n: number }[]
  overduePM: Asset[]
  reorder: ReturnType<typeof lowStock>
  lines: string[]
}

export function monthReport(data: AppData, month: string): MonthReport {
  const wos = data.workOrders.filter((w) => w.workDate.startsWith(month))
  const repairs = wos.filter((w) => !w.routine)
  const byCategory = topBy(repairs, (w) => catName(data, w.categoryId))
  const byFloor = topBy(repairs, (w) => locName(data, w.locationId))
  const pq: Record<string, number> = {}
  wos.forEach((w) => w.parts.forEach((p) => { const c = findPart(data.parts, p.partCode)?.code ?? p.partCode; pq[c] = (pq[c] || 0) + p.qty }))
  const topParts = Object.entries(pq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, qty]) => ({ code, qty, part: data.parts.find((p) => p.code === code) }))
  const repeat = repeatAssets(data, 90)
  const overduePM = pmDue(data).filter((x) => x.overdue).map((x) => x.a)
  const reorder = lowStock(data)
  const done = repairs.filter((w) => w.status === 'completed').length
  const lines = [
    `เดือนนี้มีงานซ่อม ${repairs.length} งาน เสร็จ ${done} งาน (${repairs.length ? Math.round((done / repairs.length) * 100) : 0}%) และงานประจำ ${wos.length - repairs.length} งาน`,
    byCategory.length ? `ประเภทงานที่มากที่สุดคือ ${byCategory[0][0]} ${byCategory[0][1]} งาน${byCategory[1] ? ` รองลงมาคือ ${byCategory[1][0]} ${byCategory[1][1]} งาน` : ''}` : 'ยังไม่มีงานซ่อมในเดือนนี้',
    byFloor.length ? `พื้นที่ที่แจ้งซ่อมบ่อยที่สุด: ${byFloor.slice(0, 2).map(([f, n]) => `${f} (${n})`).join(', ')}` : '',
    topParts.length ? `อะไหล่ที่ใช้มากที่สุด: ${topParts.slice(0, 3).map((p) => `${p.part?.name ?? p.code} ${p.qty} ${p.part?.unit ?? ''}`).join(', ')}` : '',
    repeat.length ? `ควรตรวจหาสาเหตุเครื่องที่เสียซ้ำ: ${repeat.slice(0, 3).map((r) => r.code).join(', ')}` : 'ไม่พบเครื่องที่เสียซ้ำใน 90 วัน',
    overduePM.length ? `PM เลยกำหนด ${overduePM.length} เครื่อง ควรจัดคิวในสัปดาห์หน้า` : 'ไม่มี PM ที่เลยกำหนด',
    reorder.length ? `ต้องสั่งอะไหล่ ${reorder.length} รายการเพื่อให้ถึงระดับ MAX` : 'สต็อกอยู่ในระดับปกติทุกรายการ',
  ].filter(Boolean)
  return { month, wos, byCategory, byFloor, topParts, repeat, overduePM, reorder, lines }
}

// ---------- F14: ร่างข้อความ Challenge ----------
export function challengeDraft(p: { part: Part; vendor: Vendor; currentPrice: number; targetPrice: number; qty: number; deadline: string }) {
  return `เรียน ${p.vendor.contact ?? ''} ${p.vendor.name}

ทางฝ่าย Building Facilities ขอขอบคุณสำหรับใบเสนอราคา ${p.part.name} จำนวน ${fmt(p.qty)} ${p.part.unit} ในราคา ${fmt(p.currentPrice, 2)} บาท/${p.part.unit}

จากข้อมูลราคาอ้างอิงภายในของบริษัทในช่วง 12 เดือนที่ผ่านมา สำหรับสินค้าสเปกเดียวกันและเงื่อนไขใกล้เคียงกัน (รวม VAT) เราขอเรียนสอบถามความเป็นไปได้ในการปรับราคาเป็น ${fmt(p.targetPrice, 2)} บาท/${p.part.unit}

หากสามารถปรับได้ รบกวนส่งใบเสนอราคาฉบับแก้ไขภายในวันที่ ${thDate(p.deadline)} เพื่อให้เราดำเนินการสั่งซื้อต่อได้ทันที

ขอบคุณครับ/ค่ะ
ฝ่าย Building Facilities`
}

// ---------- F11: ถาม AI เป็นภาษาคน ----------
export interface AskAnswer { text: string; rows?: string[][]; head?: string[]; link?: string }

export function askAI(q: string, data: AppData): AskAnswer {
  const s = q.trim()
  const assets = Object.values(data.assets)
  const bk = batchKeys(assets)
  const bc = batchCountsOf(assets)
  const y = new Date().getFullYear()

  const partSpec = s.match(/(?:สายพาน|belt|ลูกปืน|bearing)\s*([A-Z0-9-]+)/i)
  if (partSpec) {
    const spec = partSpec[1].toUpperCase()
    const hit = assets.filter((a) => a.belt.toUpperCase() === spec || a.bearing.toUpperCase() === spec)
    const part = data.parts.find((p) => p.name.toUpperCase().includes(spec))
    const bal = part ? balances(data.parts, data.movements) : null
    return {
      text: hit.length ? `มี ${hit.length} เครื่องที่ใช้ ${spec}` + (part && bal ? ` — ในสต็อก HQ ${bal.HQ[part.code]} / CSC ${bal.CSC[part.code]} ${part.unit} (${part.code})` : ' — ยังไม่ได้ผูกกับรหัสสต็อก') : `ไม่พบเครื่องที่ใช้ ${spec} ในทะเบียน`,
      head: ['รหัส', 'สถานที่', 'สายพาน', 'ลูกปืน'], rows: hit.map((a) => [a.code, a.location, a.belt || '–', a.bearing || '–']),
    }
  }

  if (/ใช้เงิน|ค่าใช้จ่าย|ค่าซ่อม|เท่าไร|เท่าไหร่/.test(s)) {
    const fl = s.match(/ชั้น\s*(\d+)/)
    const type = s.match(/\b(AHU|FCU|Chiller)\b/i)?.[1]?.toUpperCase()
    const yearOnly = /ปีนี้/.test(s)
    let list = assets
    if (fl) list = list.filter((a) => new RegExp(`\\b${fl[1]}\\s*FL|ชั้น\\s*${fl[1]}\\b`, 'i').test(a.location))
    if (type) list = list.filter((a) => a.type.toUpperCase() === type)
    let total = 0, dedup = 0
    const rows = list.map((a) => {
      let c = 0, d = 0
      a.events.forEach((e) => {
        if (!e.price || (yearOnly && !e.date?.startsWith(String(y)))) return
        c += e.price
        const k = e.date + '|' + e.item + '|' + e.price
        d += bk.has(k) ? e.price / (bc[k] || 1) : e.price
      })
      total += c; dedup += d
      return [a.code, a.location, fmt(c), fmt(d)]
    })
    return {
      text: `${type ?? 'เครื่อง'}${fl ? ` ชั้น ${fl[1]}` : ''} ${list.length} เครื่อง ${yearOnly ? `ปี ${y}` : 'ตลอดอายุ'} ใช้เงินตามบันทึก ${fmt(total)} บาท หลังแบ่งราคาล็อต ${fmt(dedup)} บาท`,
      head: ['รหัส', 'สถานที่', 'ตามบันทึก', 'หลังแบ่งราคาล็อต'], rows,
    }
  }

  if (/เปลี่ยนเครื่อง|ควรเปลี่ยน|repair|replace|ซ่อมหรือเปลี่ยน/i.test(s)) {
    const ranked = assets.map((a) => ({ a, m: metrics(a, bk, bc) })).map((x) => ({ ...x, sig: replaceSignal(x.a, x.m, data.settings.replaceCostPct) }))
      .filter((x) => x.sig).sort((p, q) => (q.sig!.ratio ?? 0) - (p.sig!.ratio ?? 0))
    return {
      text: ranked.length ? `เครื่องที่เกินอายุและควรพิจารณา ${ranked.length} เครื่อง (เกณฑ์: ค่าซ่อม 3 ปี > ${data.settings.replaceCostPct}% ของราคาเครื่องใหม่)` : 'ยังไม่มีเครื่องที่เข้าเกณฑ์ควรเปลี่ยน',
      head: ['รหัส', 'อายุ', 'ค่าซ่อม 3 ปี', '% ราคาใหม่', 'คำแนะนำ'],
      rows: ranked.map((x) => [x.a.code, `${x.m.age} ปี`, fmt(x.m.cost3y), x.sig!.ratio != null ? x.sig!.ratio.toFixed(1) + '%' : '–', x.sig!.level === 'replace' ? 'ควรเปลี่ยน' : x.sig!.level === 'watch' ? 'เฝ้าระวัง' : 'ระบุราคาเครื่องใหม่']),
      link: '#/assets',
    }
  }

  if (/สต็อก|อะไหล่.*(หมด|ต่ำ|สั่ง)|min/i.test(s)) {
    const low = lowStock(data)
    return {
      text: low.length ? `อะไหล่ที่ต่ำกว่าหรือเท่ากับ MIN ${low.length} รายการ` : 'ไม่มีอะไหล่ที่ต่ำกว่า MIN',
      head: ['รหัส', 'ชื่อ', 'อาคาร', 'คงเหลือ', 'ควรสั่ง'], rows: low.map((l) => [l.part.code, l.part.name, l.building, String(l.onHand), String(l.orderQty)]), link: '#/inventory?filter=low',
    }
  }

  if (/pm|ไส้กรอง|filter|เลยกำหนด/i.test(s)) {
    const pm = pmDue(data).sort((a, b) => (a.m.next! < b.m.next! ? -1 : 1))
    return {
      text: `มีกำหนด PM เปลี่ยนไส้กรอง ${pm.length} เครื่อง เลยกำหนด ${pm.filter((x) => x.overdue).length} เครื่อง`,
      head: ['รหัส', 'ครั้งถัดไป', 'รอบ (เดือน)', 'สถานะ'], rows: pm.map((x) => [x.a.code, thDate(x.m.next), String(Math.round((x.m.interval ?? 0) / 30)), x.overdue ? 'เลยกำหนด' : x.soon ? 'ใกล้ถึง' : 'ปกติ']), link: '#/pm',
    }
  }

  if (/งานค้าง|งานเปิด|สถานะ/.test(s)) {
    const pend = data.workOrders.filter((w) => w.status !== 'completed')
    return {
      text: `งานที่ยังไม่เสร็จ ${pend.length} งาน`, head: ['Job', 'วันที่', 'สถานที่', 'รายละเอียด', 'สถานะ'],
      rows: pend.map((w) => [w.jobNo, thDate(w.workDate), locName(data, w.locationId), w.description, STATUS_LABEL[w.status]]), link: '#/work-orders?status=pending',
    }
  }

  return { text: 'ยังไม่เข้าใจคำถามนี้ ลองถามเช่น "เครื่องไหนใช้สายพาน B-76", "ปีนี้ AHU ชั้น 15 ใช้เงินเท่าไร", "เครื่องไหนควรเปลี่ยน", "อะไหล่อะไรต้องสั่ง", "PM เลยกำหนด"' }
}
