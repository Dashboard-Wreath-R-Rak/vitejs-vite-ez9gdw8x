export type Building = 'HQ' | 'CSC'
export type WOStatus = 'open' | 'in_process' | 'completed' | 'suspended'
export type StaffRole = 'technician' | 'requester' | 'manager'
export type VendorRole = 'dealer' | 'installer' | 'contractor' | 'supplier'
export type MovementType = 'IN' | 'OUT' | 'ADJUST'
export type ChallengeStatus = 'draft' | 'sent' | 'reduced' | 'held' | 'no_reply'

export interface Part {
  code: string // รหัสกลาง
  hqCode?: string
  cscCode?: string
  name: string
  category: string
  unit: string
  min: number
  max: number
  boxNo?: string
  active: boolean
}

export interface Location {
  id: string
  building: Building
  floor: string
  zone?: string
  name: string
}

export interface Category {
  id: string
  nameTh: string
  nameEn: string
}

export interface Staff {
  id: string
  name: string
  aliases: string[]
  role: StaffRole
  active: boolean
}

export interface Vendor {
  id: string
  name: string
  role: VendorRole
  phone?: string
  contact?: string
  email?: string
}

export interface WOPart {
  partCode: string
  qty: number
}

export interface WorkOrder {
  jobNo: string // YY/NNN
  building: Building
  createdAt: string // ISO timestamp
  workDate: string // YYYY-MM-DD
  requesterId: string
  technicianId: string
  locationId: string
  categoryId: string
  assetCode?: string
  description: string
  status: WOStatus
  routine?: boolean // งานประจำ (PM2.5 / อุณหภูมิ) แยกจากงานซ่อม (P8)
  parts: WOPart[]
}

export interface StockMovement {
  id: string
  partCode: string
  building: Building
  type: MovementType
  qty: number // IN/OUT เป็นบวกเสมอ, ADJUST เป็นยอดใหม่ที่ตั้ง
  refJobNo?: string
  date: string
  recordedBy: string
  note?: string
}

export interface MaintenanceEvent {
  no: number | null
  date: string | null // YYYY-MM-DD หรือ YYYY-MM-00 (รู้แค่เดือน)
  fixed: boolean // แก้ปีอัตโนมัติ
  originalDate?: string | null // ค่าก่อนแก้ปี (NFR: เก็บค่าเดิมไว้เสมอ)
  item: string
  category: string
  categoryByAI?: boolean
  price: number | null
  by: string
  wStart: string | null
  wEnd: string | null
  jobNo?: string
}

export interface Asset {
  id: string
  code: string
  name: string
  type: string
  location: string
  installedYear: number | null
  lifeMin: number | null
  lifeMax: number | null
  vendor: string
  installer: string
  specs: string[]
  belt: string
  bearing: string
  bomLinks?: Record<string, string> // role -> part code
  events: MaintenanceEvent[]
  source: string
  updatedAt: string
  newPrice?: number // ราคาเครื่องใหม่โดยประมาณ (ใช้กับ Repair-or-Replace)
}

export interface PriceRecord {
  id: string
  partCode: string
  spec?: string
  vendorId: string
  unitPrice: number
  qty: number
  vatIncluded: boolean
  deliveryCost?: number // ค่าขนส่งทั้งล็อต (บาท)
  warrantyMonths?: number
  date: string
  source: 'quote' | 'PO' | 'history'
  docRef?: string
  decision?: string
}

export interface Challenge {
  id: string
  partCode: string
  currentVendorId: string
  currentPrice: number
  targetPrice: number
  rfqVendorIds: string[]
  status: ChallengeStatus
  deadline: string
  message: string
  finalPrice?: number
  createdAt: string
  decidedBy?: string
  reason?: string
}

export interface Notification {
  id: string
  at: string
  channel: 'chat'
  title: string
  body: string
  kind: 'workorder' | 'lowstock' | 'pm' | 'summary' | 'offer'
  read: boolean
}

export interface ChangeLog {
  id: string
  at: string
  who: string
  action: string
  detail: string
}

export interface Settings {
  offerThresholdPct: number
  priceWindowMonths: number
  replaceCostPct: number
  pmWarnDays: number
}

export interface AppData {
  version: number
  parts: Part[]
  locations: Location[]
  categories: Category[]
  staff: Staff[]
  vendors: Vendor[]
  workOrders: WorkOrder[]
  movements: StockMovement[]
  assets: Record<string, Asset>
  prices: PriceRecord[]
  challenges: Challenge[]
  notifications: Notification[]
  log: ChangeLog[]
  settings: Settings
}
