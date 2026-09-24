import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** QR สำหรับติดที่ตัวเครื่อง → เปิดฟอร์มบันทึกงานพร้อมรหัสเครื่อง */
export function QR({ text, size = 96 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { margin: 0, width: size * 2 }).then((u) => { if (alive) setSrc(u) }).catch(() => {})
    return () => { alive = false }
  }, [text, size])
  return src ? <img className="qr" src={src} alt={`QR: ${text}`} style={{ width: size, height: size }} /> : <div className="qr" style={{ width: size, height: size }} />
}
