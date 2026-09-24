// ที่เก็บข้อมูลของแอป (เวอร์ชันต้นแบบใช้ localStorage ในเบราว์เซอร์)
// เมื่อย้ายไป Google Sheets / Apps Script ให้เปลี่ยน load/save และฟังก์ชัน action ในไฟล์นี้
import { createContext, useContext } from 'react'
import type { AppData, Asset, Building, ChangeLog, Notification, StockMovement, WorkOrder } from './types'
import { DATA_VERSION, seedData } from './seed'
import { lowStock, STATUS_LABEL } from './rules'
import { catOf } from './equipment'
import { uid } from './format'

const KEY = 'facilities-cmms-data'

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      if (d.version === DATA_VERSION) return d
    }
  } catch { /* ใช้ข้อมูลตัวอย่าง */ }
  return seedData()
}

export function saveData(d: AppData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* พื้นที่เต็ม/ถูกบล็อก */ }
}

export function resetData() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  return seedData()
}

export type Updater = (fn: (d: AppData) => void) => void

export interface StoreValue {
  data: AppData
  update: Updater
  user: string
  setUser: (u: string) => void
  toast: (msg: string, tone?: 'ok' | 'warn' | 'danger') => void
}

export const StoreContext = createContext<StoreValue | null>(null)
export function useStore() {
  const v = useContext(StoreContext)
  if (!v) throw new Error('StoreContext missing')
  return v
}

// ---------- helpers ที่แก้ไข draft (เรียกภายใน update) ----------
export function log(d: AppData, who: string, action: string, detail: string) {
  const entry: ChangeLog = { id: uid('l'), at: new Date().toISOString(), who, action, detail }
  d.log.unshift(entry)
  d.log = d.log.slice(0, 500)
}

export function notify(d: AppData, n: Omit<Notification, 'id' | 'at' | 'read' | 'channel'>) {
  d.notifications.unshift({ ...n, id: uid('n'), at: new Date().toISOString(), read: false, channel: 'chat' })
  d.notifications = d.notifications.slice(0, 100)
}

function alertNewLowStock(d: AppData, before: Set<string>) {
  lowStock(d).forEach((l) => {
    const k = l.building + '|' + l.part.code
    if (!before.has(k)) {
      notify(d, {
        kind: 'lowstock',
        title: `สต็อกต่ำ: ${l.part.name} (${l.building})`,
        body: `คงเหลือ ${l.onHand} ${l.part.unit} (MIN ${l.part.min}) — ควรสั่ง ${l.orderQty} ${l.part.unit} ให้ถึง MAX ${l.part.max}`,
      })
    }
  })
}
const lowKeys = (d: AppData) => new Set(lowStock(d).map((l) => l.building + '|' + l.part.code))

/** บันทึก Work Order: ตัดสต็อก (F2) + เตือนสต็อกต่ำ (F3) + เพิ่มประวัติเครื่อง (F4) + การ์ด Google Chat */
export function saveWorkOrder(d: AppData, wo: WorkOrder, who: string, stockBuilding: Building, isNew: boolean) {
  const before = lowKeys(d)
  const idx = d.workOrders.findIndex((w) => w.jobNo === wo.jobNo)
  const prev = idx >= 0 ? d.workOrders[idx] : null
  if (idx >= 0) d.workOrders[idx] = wo
  else d.workOrders.unshift(wo)

  // ย้อนการเบิกเดิมของ Job นี้ แล้วลงใหม่ตามรายการล่าสุด
  d.movements = d.movements.filter((m) => !(m.refJobNo === wo.jobNo && m.type === 'OUT'))
  wo.parts.forEach((p) => {
    const mv: StockMovement = { id: uid('m'), partCode: p.partCode, building: stockBuilding, type: 'OUT', qty: p.qty, refJobNo: wo.jobNo, date: wo.workDate, recordedBy: who }
    d.movements.push(mv)
  })

  syncAssetEvent(d, wo)

  notify(d, {
    kind: 'workorder',
    title: `${wo.building} WORK ORDER ${wo.jobNo}${isNew ? '' : ' (แก้ไข)'}`,
    body: `${wo.description} — ${STATUS_LABEL[wo.status]}` + (wo.parts.length ? ` · เบิก ${wo.parts.map((p) => `${p.partCode}×${p.qty}`).join(', ')}` : ' · ไม่มีการใช้อะไหล่'),
  })
  alertNewLowStock(d, before)
  log(d, who, isNew ? 'สร้าง Work Order' : 'แก้ไข Work Order', `${wo.jobNo}${prev && prev.status !== wo.status ? ` สถานะ ${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[wo.status]}` : ''}`)
}

/** งานเสร็จที่ระบุรหัสเครื่อง → เพิ่ม/อัปเดตแถวใน MaintenanceEvents */
function syncAssetEvent(d: AppData, wo: WorkOrder) {
  Object.values(d.assets).forEach((a) => { a.events = a.events.filter((e) => e.jobNo !== wo.jobNo) })
  if (!wo.assetCode || wo.status !== 'completed') return
  const a = Object.values(d.assets).find((x) => x.code === wo.assetCode)
  if (!a) return
  const partNames = wo.parts.map((p) => d.parts.find((x) => x.code === p.partCode)?.name ?? p.partCode)
  const item = wo.description + (partNames.length ? ` (${partNames.join(', ')})` : '')
  const tech = d.staff.find((s) => s.id === wo.technicianId)?.name ?? ''
  const nos = a.events.map((e) => e.no ?? 0)
  a.events.push({ no: (nos.length ? Math.max(...nos) : 0) + 1, date: wo.workDate, fixed: false, item, category: catOf(item), price: null, by: tech, wStart: null, wEnd: null, jobNo: wo.jobNo })
  a.updatedAt = new Date().toISOString()
}

export function setWOStatus(d: AppData, jobNo: string, status: WorkOrder['status'], who: string) {
  const wo = d.workOrders.find((w) => w.jobNo === jobNo)
  if (!wo) return
  const prev = wo.status
  wo.status = status
  syncAssetEvent(d, wo)
  log(d, who, 'เปลี่ยนสถานะ', `${jobNo} ${STATUS_LABEL[prev]} → ${STATUS_LABEL[status]}`)
}

export function addMovement(d: AppData, m: Omit<StockMovement, 'id'>, who: string) {
  const before = lowKeys(d)
  d.movements.push({ ...m, id: uid('m') })
  alertNewLowStock(d, before)
  log(d, who, m.type === 'IN' ? 'รับเข้าอะไหล่' : m.type === 'ADJUST' ? 'ปรับยอดสต็อก' : 'เบิกอะไหล่', `${m.partCode} ${m.building} ${m.qty}${m.note ? ' · ' + m.note : ''}`)
}

export function upsertAssets(d: AppData, assets: Asset[], who: string) {
  assets.forEach((a) => {
    const old = d.assets[a.id]
    // เก็บงานจาก Work Order และการเชื่อม BOM ของเดิมไว้
    const woEvents = old ? old.events.filter((e) => e.jobNo) : []
    d.assets[a.id] = { ...a, bomLinks: old?.bomLinks ?? a.bomLinks, newPrice: old?.newPrice ?? a.newPrice, events: [...a.events, ...woEvents] }
  })
  log(d, who, 'นำเข้าใบประวัติ', `${assets.length} เครื่อง`)
}

