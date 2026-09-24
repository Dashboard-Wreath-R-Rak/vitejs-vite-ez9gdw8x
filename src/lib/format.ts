export const fmt = (n: number | null | undefined, digits = 0) =>
  (n || 0).toLocaleString('th-TH', { maximumFractionDigits: digits })

export const pad = (n: number) => String(n).padStart(2, '0')

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const addDays = (iso: string, days: number) => {
  const d = new Date(iso.replace(/-00$/, '-01') + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

export const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(b.replace(/-00$/, '-01') + 'T00:00:00').getTime() -
      new Date(a.replace(/-00$/, '-01') + 'T00:00:00').getTime()) /
      864e5,
  )

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** แสดงวันที่แบบไทยสั้น เช่น 5 ม.ค. 2026 หรือ ม.ค. 2026 (รู้แค่เดือน) */
export const thDate = (iso: string | null | undefined) => {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-')
  const mm = TH_MONTHS[+m - 1] || m
  return (d && d !== '00' ? +d + ' ' : '') + mm + ' ' + y
}

export const thDateTime = (iso: string) => {
  const d = new Date(iso)
  return thDate(isoOf(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
}
