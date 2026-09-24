import { useEffect, useState } from 'react'

export interface Route {
  path: string // เช่น /assets/AHU-5.1
  parts: string[]
  query: URLSearchParams
}

function parse(): Route {
  const h = window.location.hash.replace(/^#/, '') || '/dashboard'
  const [p, q = ''] = h.split('?')
  const path = p.startsWith('/') ? p : '/' + p
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) }
}

export function useRoute() {
  const [r, setR] = useState(parse)
  useEffect(() => {
    const on = () => { setR(parse()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export const go = (to: string) => { window.location.hash = to.replace(/^#/, '') }

/** ลิงก์สำหรับ QR ที่ตัวเครื่อง → เปิดฟอร์มบันทึกงานพร้อมรหัสเครื่อง */
export const assetFormUrl = (code: string) =>
  `${window.location.origin}${window.location.pathname}#/work-orders/new?asset=${encodeURIComponent(code)}`
