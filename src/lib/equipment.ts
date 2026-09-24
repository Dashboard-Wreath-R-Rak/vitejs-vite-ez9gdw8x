// ตรรกะทะเบียนเครื่องจักร — ย้ายมาจาก Prototype equipment-register.html
// (parseSheet, toDate, catOf, typeOf, metrics, batchKeys)
import type { Asset, MaintenanceEvent } from './types'
import { pad } from './format'

export const EV_CATS = ['ไส้กรอง/PM', 'สายพาน', 'ลูกปืน', 'มอเตอร์', 'ไฟฟ้า/ควบคุม', 'คอยล์/ฉนวน', 'UV', 'ติดตั้ง/ปรับปรุง', 'อื่นๆ']

const EV_RULES: [RegExp, string][] = [
  [/ติดตั้งใหม่|ปรับปรุง|install/i, 'ติดตั้ง/ปรับปรุง'],
  [/\buv\b|uv lamp|ยูวี/i, 'UV'],
  [/filter|ฟิลเตอร์|กรอง|ล้างคอยล์|ล้างทำความสะอาด|\bpm\b/i, 'ไส้กรอง/PM'],
  [/สายพาน|belt/i, 'สายพาน'],
  [/ลูกปืน|bearing/i, 'ลูกปืน'],
  [/มอเตอร์|motor/i, 'มอเตอร์'],
  [/inverter|valve|วาล์ว|contactor|breaker|เบรกเกอร์|relay|รีเลย์|ไฟฟ้า|capacitor|คาปา|sensor|เซนเซอร์|thermostat|ตู้ควบคุม/i, 'ไฟฟ้า/ควบคุม'],
  [/คอยล์|coil|ฉนวน|insulation/i, 'คอยล์/ฉนวน'],
]
export const MAJOR = new Set(['ติดตั้ง/ปรับปรุง', 'คอยล์/ฉนวน'])

export const TYPE_RULES: [RegExp, string][] = [
  [/\bahu\b|air handl/i, 'AHU'], [/\bfcu\b|fan coil/i, 'FCU'], [/chiller|ชิลเลอร์/i, 'Chiller'],
  [/cooling tower|คูลลิ่ง/i, 'Cooling Tower'], [/pump|ปั๊ม/i, 'ปั๊มน้ำ'], [/generator|genset|เครื่องกำเนิด|ปั่นไฟ/i, 'เครื่องปั่นไฟ'],
  [/lift|elevator|escalator|ลิฟต์|บันไดเลื่อน/i, 'ลิฟต์'], [/transformer|หม้อแปลง/i, 'หม้อแปลง'],
  [/fire|ดับเพลิง/i, 'ระบบดับเพลิง'], [/exhaust|\bfan\b|พัดลม/i, 'พัดลม'], [/split|condensing|\bcdu\b|แอร์/i, 'แอร์/CDU'],
]

export const catOf = (text: string) => {
  for (const [re, c] of EV_RULES) if (re.test(text)) return c
  return 'อื่นๆ'
}
export const typeOf = (s: string) => {
  for (const [re, t] of TYPE_RULES) if (re.test(s)) return t
  return 'อื่นๆ'
}
export const docId = (code: string) => code.replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 180) || 'asset_' + Date.now()

const NOW_Y = () => new Date().getFullYear()

export interface ParsedDate {
  iso: string
  fixed: boolean
  original: string
}

/** แปลงค่าวันที่จาก Excel พร้อมแก้ปีที่ผิดจากรูปแบบ พ.ศ. (P10) */
export function toDate(v: unknown): ParsedDate | null {
  if (v == null || v === '') return null
  let y: number, m: number, d: number
  let fixed = false, partial = false
  if (v instanceof Date) {
    const t = new Date(v.getTime() + 12 * 3600e3)
    y = t.getFullYear(); m = t.getMonth() + 1; d = t.getDate()
  } else if (typeof v === 'number' && v > 20000 && v < 80000) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5)
    y = t.getUTCFullYear(); m = t.getUTCMonth() + 1; d = t.getUTCDate()
  } else if (typeof v === 'string') {
    const s = v.trim()
    let r: RegExpMatchArray | null
    if ((r = s.match(/^(\d{1,2})\/(\d{4})$/))) { m = +r[1]; y = +r[2]; d = 1; partial = true }
    else if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; if (y < 100) y += 2000 }
    else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +r[1]; m = +r[2]; d = +r[3] }
    else if ((r = s.match(/^(\d{4})$/))) { y = +r[1]; m = 1; d = 1; partial = true }
    else return null
  } else return null
  const original = partial ? `${y}-${pad(m)}-00` : `${y}-${pad(m)}-${pad(d || 1)}`
  if (y > 2400) { y -= 543; fixed = true }
  if (y < 2000 && y + 43 <= NOW_Y() + 1 && y + 43 >= 2000) { y += 43; fixed = true }
  if (!(m >= 1 && m <= 12)) return null
  return { iso: partial ? `${y}-${pad(m)}-00` : `${y}-${pad(m)}-${pad(d || 1)}`, fixed, original }
}

export const yearOf = (iso: string | null) => (iso ? +iso.slice(0, 4) : null)
const cellStr = (v: unknown) => (v == null ? '' : v instanceof Date ? '' : String(v))
const afterColon = (s: string) => {
  const i = s.indexOf(':')
  return i < 0 ? '' : s.slice(i + 1).replace(/\s+/g, ' ').trim()
}

/** อ่านใบประวัติเครื่องจักร 1 ชีต = 1 เครื่อง */
export function parseSheet(rows: unknown[][], sheetName: string, fileName: string): Asset | null {
  let hdr = -1
  for (let r = 0; r < rows.length; r++) {
    if ((rows[r] || []).some((c) => typeof c === 'string' && c.trim() === 'ครั้งที่')) { hdr = r; break }
  }
  if (hdr < 0) return null
  const top = rows.slice(0, hdr)
  const cells: string[] = []
  top.forEach((row) => (row || []).forEach((c) => { if (typeof c === 'string' && c.trim()) cells.push(c) }))
  const find = (re: RegExp) => {
    for (const c of cells) { const m = c.match(re); if (m) return m[1].replace(/\s+/g, ' ').trim() }
    return ''
  }
  const name = find(/Name of Equipment\s*:\s*(.+)/i)
  let code = find(/(?:^|\s)Code\s*:\s*(.+)/i).replace(/\s*-\s*/g, '-').replace(/\s+/g, '')
  let location = ''
  for (const c of cells) {
    if (/^\s*Location\s*:/i.test(c)) {
      const v = afterColon(c)
      if (/floor|fl\b|ชั้น|room|zone|ห้อง|อาคาร|roof/i.test(v)) location = v
    }
  }
  const installed = find(/Installed Year\s*:\s*([\d/]+)/i)
  const lifeRaw = find(/Lifetime\s*:\s*([\d\s\-–]+)/i)
  const lifeNums = (lifeRaw.match(/\d+/g) || []).map(Number)
  const vendor = find(/ตัวแทนจำหน่าย\s*:\s*(.+)/)
  const installer = find(/ผู้ติดตั้ง\s*:\s*(.+)/)
  const specStart = top.findIndex((row) => (row || []).some((c) => typeof c === 'string' && /Electrical Equipment/i.test(c)))
  const specs: string[] = []
  if (specStart >= 0) {
    top.slice(specStart + 1).forEach((row) => (row || []).forEach((c) => {
      if (typeof c === 'string' && c.includes(':')) { const s = c.replace(/\s+/g, ' ').trim(); if (s.length > 3) specs.push(s) }
    }))
  }
  const belt = find(/Belt\s*:\s*(.+)/i), bearing = find(/Bearing\s*:\s*(.+)/i)

  const H = rows[hdr].map((c) => (typeof c === 'string' ? c : ''))
  const col = (re: RegExp, def: number) => { const i = H.findIndex((h) => re.test(h)); return i < 0 ? def : i }
  const cNo = col(/ครั้งที่/, 0), cDate = col(/ว\.ด\.ป|วันที่|date/i, 1), cItem = col(/รายการ/, 2)
  const cPrice = col(/ราคา/, 5), cBy = col(/ซ่อมโดย|ผู้ซ่อม/, 6), cW = col(/รับประกัน/, 8)
  const events: MaintenanceEvent[] = []
  let curDate: ParsedDate | null = null, curBy = '', curNo: number | null = null
  for (let r = hdr + 1; r < rows.length; r++) {
    const row = rows[r] || []
    if (row.some((c) => typeof c === 'string' && c.trim() === 'รวม')) break
    const no = row[cNo]
    const item = row.slice(cItem, cPrice).map(cellStr).join(' ').replace(/\s+/g, ' ').replace(/^\s*-\s*/, '').trim()
    const dt = toDate(row[cDate])
    if (typeof no === 'number') { curNo = no; curDate = dt; curBy = cellStr(row[cBy]).trim() }
    else if (dt) curDate = dt
    if (!item) continue
    const p = row[cPrice]
    const price = typeof p === 'number' ? p : typeof p === 'string' && /\d/.test(p) ? +p.replace(/[^\d.]/g, '') : null
    const ws = toDate(row[cW]), we = toDate(row[cW + 1])
    events.push({
      no: curNo, date: curDate ? curDate.iso : null, fixed: !!(curDate && curDate.fixed),
      originalDate: curDate && curDate.fixed ? curDate.original : undefined,
      item, category: catOf(item), price: price || null, by: cellStr(row[cBy]).trim() || curBy,
      wStart: ws ? ws.iso : null, wEnd: we ? we.iso : null,
    })
  }
  if (!code) code = sheetName.replace(/_/g, '-')
  const lifeMin = lifeNums[0] || null, lifeMax = lifeNums[1] || lifeNums[0] || null
  const iy = installed.match(/(\d{4})/)
  return {
    id: docId(code), code, name: name || sheetName, type: typeOf(name + ' ' + code + ' ' + sheetName), location,
    installedYear: iy ? +iy[1] : null, lifeMin, lifeMax, vendor, installer, specs, belt, bearing, events,
    source: fileName + ' / ' + sheetName, updatedAt: new Date().toISOString(),
  }
}

export interface ParseResult { assets: Asset[]; problems: string[] }

export async function parseWorkbooks(files: File[]): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const assets: Asset[] = [], problems: string[] = []
  for (const f of files) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true })
      for (const sn of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null })
        const a = parseSheet(rows, sn, f.name)
        if (a) assets.push(a); else problems.push(f.name + ' / ' + sn)
      }
    } catch {
      problems.push(f.name + ' (อ่านไฟล์ไม่ได้)')
    }
  }
  return { assets, problems }
}

/** ราคาล็อตซ้ำ (P11): วันเดียวกัน + รายการเดียวกัน + ราคาเดียวกัน พบใน ≥ 3 เครื่อง */
export const evKey = (e: MaintenanceEvent) => e.date + '|' + e.item + '|' + e.price
export function batchKeys(assets: Asset[]) {
  const m: Record<string, Set<string>> = {}
  assets.forEach((a) => a.events.forEach((e) => {
    if (e.price && e.date) (m[evKey(e)] = m[evKey(e)] || new Set()).add(a.id)
  }))
  const out = new Set<string>()
  Object.entries(m).forEach(([k, s]) => { if (s.size >= 3) out.add(k) })
  return out
}

export function costTotals(assets: Asset[], bk: Set<string>) {
  let total = 0, dedup = 0
  const seen = new Set<string>()
  assets.forEach((a) => a.events.forEach((e) => {
    if (!e.price) return
    total += e.price
    const k = evKey(e)
    if (bk.has(k)) { if (!seen.has(k)) { seen.add(k); dedup += e.price } } else dedup += e.price
  }))
  return { total, dedup }
}

export type AgeStatus = 'เกินอายุ' | 'ใกล้ครบอายุ' | 'ปกติ' | 'ไม่ทราบ'
export interface AssetMetrics {
  base: number | null
  age: number | null
  status: AgeStatus
  tone: 'danger' | 'warn' | 'ok' | 'info'
  cost: number
  cost3y: number
  count: number
  last: string | null
  next: string | null
  interval: number | null
}

const toTime = (iso: string) => new Date(iso.replace(/-00$/, '-01') + 'T00:00:00').getTime()

/** อายุ สถานะ ค่าใช้จ่าย และรอบเปลี่ยนไส้กรองของเครื่อง */
export function metrics(a: Asset, bk?: Set<string>, batchCounts?: Record<string, number>): AssetMetrics {
  const nowY = NOW_Y()
  const dated = a.events.filter((e) => e.date).sort((x, y) => (x.date! < y.date! ? -1 : 1))
  const majorYears = a.events.filter((e) => MAJOR.has(e.category) && e.date).map((e) => yearOf(e.date)!)
  const base = Math.max(a.installedYear || 0, ...majorYears, 0) || null
  const age = base ? nowY - base : null
  let status: AgeStatus = 'ไม่ทราบ', tone: AssetMetrics['tone'] = 'info'
  if (age != null && a.lifeMax) {
    if (age > a.lifeMax) { status = 'เกินอายุ'; tone = 'danger' }
    else if (age >= (a.lifeMin || a.lifeMax)) { status = 'ใกล้ครบอายุ'; tone = 'warn' }
    else { status = 'ปกติ'; tone = 'ok' }
  }
  const cost = a.events.reduce((s, e) => s + (e.price || 0), 0)
  // ค่าซ่อม 3 ปีล่าสุด หลังแบ่งราคาล็อตตามจำนวนเครื่อง
  const cost3y = a.events.reduce((s, e) => {
    if (!e.price || !e.date || yearOf(e.date)! < nowY - 2) return s
    const k = evKey(e)
    const share = bk && bk.has(k) && batchCounts ? e.price / (batchCounts[k] || 1) : e.price
    return s + share
  }, 0)
  const fDates = [...new Set(a.events.filter((e) => e.category === 'ไส้กรอง/PM' && e.date).map((e) => e.date!))].sort()
  let next: string | null = null, interval: number | null = null
  if (fDates.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < fDates.length; i++) gaps.push((toTime(fDates[i]) - toTime(fDates[i - 1])) / 864e5)
    gaps.sort((x, y) => x - y)
    interval = gaps[Math.floor(gaps.length / 2)]
    if (interval > 20) {
      const n = new Date(toTime(fDates[fDates.length - 1]) + interval * 864e5)
      next = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
    } else interval = null
  }
  return {
    base, age, status, tone, cost, cost3y,
    count: new Set(a.events.map((e) => e.no + '|' + e.date)).size,
    last: dated.length ? dated[dated.length - 1].date : null, next, interval,
  }
}

export function batchCountsOf(assets: Asset[]) {
  const m: Record<string, Set<string>> = {}
  assets.forEach((a) => a.events.forEach((e) => {
    if (e.price && e.date) (m[evKey(e)] = m[evKey(e)] || new Set()).add(a.id)
  }))
  const out: Record<string, number> = {}
  Object.entries(m).forEach(([k, s]) => (out[k] = s.size))
  return out
}

/** สัญญาณควรพิจารณาเปลี่ยนเครื่อง: เกินอายุ และค่าซ่อม 3 ปี > X% ของราคาเครื่องใหม่ */
export function replaceSignal(a: Asset, m: AssetMetrics, pct: number) {
  if (m.status !== 'เกินอายุ') return null
  if (!a.newPrice) return { level: 'check' as const, ratio: null }
  const ratio = (m.cost3y / a.newPrice) * 100
  return ratio > pct ? { level: 'replace' as const, ratio } : { level: 'watch' as const, ratio }
}
