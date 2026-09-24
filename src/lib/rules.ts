// กฎตรวจข้อมูล Work Order, สต็อก, ราคา (F1, F2, F3, F14) และ Data Quality (P1–P7)
import type { AppData, Building, Part, PriceRecord, Staff, StockMovement, WOStatus, WorkOrder } from './types'
import { todayISO } from './format'

export const STATUS_LABEL: Record<WOStatus, string> = {
  open: 'เปิดอยู่', in_process: 'กำลังทำ', completed: 'เสร็จแล้ว', suspended: 'ระงับ',
}
export const STATUS_TONE: Record<WOStatus, 'info' | 'warn' | 'ok' | 'danger'> = {
  open: 'info', in_process: 'warn', completed: 'ok', suspended: 'danger',
}

/** Job No. → YY/NNN ("450" → "26/450") */
export function normalizeJobNo(raw: string, year = new Date().getFullYear()) {
  const s = raw.trim().replace(/\s+/g, '')
  const yy = String(year % 100).padStart(2, '0')
  let m = s.match(/^(\d{2})[/-](\d{1,4})$/)
  if (m) return `${m[1]}/${m[2].padStart(3, '0')}`
  m = s.match(/^(\d{1,4})$/)
  if (m) return `${yy}/${m[1].padStart(3, '0')}`
  return s
}
export const isValidJobNo = (s: string) => /^\d{2}\/\d{3,4}$/.test(s)

export function nextJobNo(wos: WorkOrder[]) {
  const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
  const nums = wos.filter((w) => w.jobNo.startsWith(yy + '/')).map((w) => +w.jobNo.split('/')[1])
  return `${yy}/${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
}

/** รหัสอะไหล่ → ตัวใหญ่ + ค้นจากรหัสกลาง/HQ/CSC */
export const normalizePartCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '')
export function findPart(parts: Part[], code: string) {
  const c = normalizePartCode(code)
  return parts.find((p) => p.code === c || p.hqCode === c || p.cscCode === c)
}

/** ชื่อคน → staff (รองรับ "คุณประชา", "K ประชา") */
export function matchStaff(staff: Staff[], name: string) {
  const n = name.trim().replace(/^(คุณ|K\.?|พี่|นาย|นาง(สาว)?)\s*/i, '')
  return staff.find((s) => s.name === n || s.aliases.includes(name.trim()) || s.aliases.includes(n))
}

// ---------- สต็อก ----------
export function balances(parts: Part[], movements: StockMovement[]) {
  const out: Record<Building, Record<string, number>> = { HQ: {}, CSC: {} }
  const sorted = [...movements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const m of sorted) {
    const b = out[m.building]
    const cur = b[m.partCode] || 0
    b[m.partCode] = m.type === 'IN' ? cur + m.qty : m.type === 'OUT' ? cur - m.qty : m.qty
  }
  parts.forEach((p) => { out.HQ[p.code] ??= 0; out.CSC[p.code] ??= 0 })
  return out
}

export interface LowStock { part: Part; building: Building; onHand: number; orderQty: number }
export function lowStock(data: AppData): LowStock[] {
  const bal = balances(data.parts, data.movements)
  const used = usedBuildings(data)
  const res: LowStock[] = []
  for (const b of ['HQ', 'CSC'] as Building[]) {
    for (const p of data.parts) {
      if (!p.active || !used[b].has(p.code)) continue
      const onHand = bal[b][p.code] || 0
      if (onHand <= p.min) res.push({ part: p, building: b, onHand, orderQty: Math.max(0, p.max - onHand) })
    }
  }
  return res.sort((a, b) => a.onHand - a.part.min - (b.onHand - b.part.min))
}

/** อะไหล่ที่อาคารนั้นเก็บจริง (มีการเคลื่อนไหว) */
export function usedBuildings(data: AppData) {
  const out: Record<Building, Set<string>> = { HQ: new Set(), CSC: new Set() }
  data.movements.forEach((m) => out[m.building].add(m.partCode))
  return out
}

/** อัตราใช้เฉลี่ยต่อเดือน → แนะนำ MIN/MAX (F9) */
export function forecast(data: AppData, partCode: string, building: Building, leadMonths = 1) {
  const since = new Date(); since.setMonth(since.getMonth() - 6)
  const s = since.toISOString().slice(0, 10)
  const out = data.movements.filter((m) => m.partCode === partCode && m.building === building && m.type === 'OUT' && m.date >= s)
  const perMonth = out.reduce((t, m) => t + m.qty, 0) / 6
  return {
    perMonth,
    min: Math.ceil(perMonth * leadMonths * 1.5),
    max: Math.ceil(perMonth * (leadMonths + 2) * 1.5),
  }
}

// ---------- ราคา / Offer (F14) ----------
export const VAT = 0.07
/** ราคาต่อหน่วยที่เทียบกันได้: รวม VAT + เฉลี่ยค่าขนส่งต่อหน่วย */
export function effectiveUnit(r: PriceRecord, qty = r.qty, withDelivery = true) {
  const unit = r.unitPrice * (r.vatIncluded ? 1 : 1 + VAT)
  return unit + (withDelivery ? (r.deliveryCost ?? 0) / Math.max(1, qty) : 0)
}

export interface Offer { best: PriceRecord; diffPct: number }
export function findOffer(data: AppData, partCode: string, unitPrice: number, excludeVendor?: string): Offer | null {
  const since = new Date(); since.setMonth(since.getMonth() - data.settings.priceWindowMonths)
  const s = since.toISOString().slice(0, 10)
  const cand = data.prices.filter((p) => p.partCode === partCode && p.date >= s && p.vendorId !== excludeVendor)
  if (!cand.length) return null
  const best = cand.reduce((a, b) => (effectiveUnit(b) < effectiveUnit(a) ? b : a))
  const diffPct = ((unitPrice - effectiveUnit(best)) / unitPrice) * 100
  return diffPct >= data.settings.offerThresholdPct ? { best, diffPct } : null
}

export function lastPrice(data: AppData, partCode: string) {
  const list = data.prices.filter((p) => p.partCode === partCode).sort((a, b) => (a.date < b.date ? 1 : -1))
  return list[0]
}

// ---------- Data quality (Phase 0) ----------
export interface Issue { kind: string; ref: string; detail: string; tone: 'warn' | 'danger' }
export function dataIssues(data: AppData): Issue[] {
  const issues: Issue[] = []
  const seen: Record<string, number> = {}
  data.workOrders.forEach((w) => { seen[w.jobNo] = (seen[w.jobNo] || 0) + 1 })
  Object.entries(seen).forEach(([j, n]) => { if (n > 1) issues.push({ kind: 'Job ซ้ำ (P1)', ref: j, detail: `พบ ${n} รายการ`, tone: 'danger' }) })
  data.workOrders.forEach((w) => {
    if (!isValidJobNo(w.jobNo)) issues.push({ kind: 'Job No. ผิดรูปแบบ (P3)', ref: w.jobNo, detail: `ควรเป็น ${normalizeJobNo(w.jobNo)}`, tone: 'warn' })
    w.parts.forEach((p) => {
      if (!findPart(data.parts, p.partCode)) issues.push({ kind: 'รหัสอะไหล่ไม่มีใน master', ref: w.jobNo, detail: p.partCode, tone: 'warn' })
      else if (p.partCode !== normalizePartCode(p.partCode)) issues.push({ kind: 'รหัสอะไหล่ไม่มาตรฐาน (P3)', ref: w.jobNo, detail: `${p.partCode} → ${normalizePartCode(p.partCode)}`, tone: 'warn' })
    })
  })
  data.parts.forEach((p) => {
    if (p.min > p.max) issues.push({ kind: 'MIN > MAX (P7)', ref: p.code, detail: `MIN ${p.min} / MAX ${p.max}`, tone: 'danger' })
  })
  return issues
}

export const isThisMonth = (iso: string) => iso.slice(0, 7) === todayISO().slice(0, 7)
