import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { Card, Empty, PageHead, Tag } from '../components/ui'
import { pmDue } from '../lib/ai'
import { TH_MONTHS_FULL, addDays, isoOf, pad, thDate, todayISO } from '../lib/format'

interface CalEv { date: string; label: string; tone: 'ok' | 'warn' | 'danger' | 'info'; href: string; title: string }

export default function PMCalendar() {
  const { data } = useStore()
  const t = todayISO()
  const [ym, setYm] = useState(() => t.slice(0, 7))
  const [view, setView] = useState<'month' | 'list'>('month')
  const pm = useMemo(() => pmDue(data), [data])

  const toneOf = (d: string): CalEv['tone'] => (d < t ? 'danger' : d <= addDays(t, data.settings.pmWarnDays) ? 'warn' : 'ok')

  const events = useMemo(() => {
    const out: CalEv[] = []
    pm.forEach(({ a, m }) => {
      // ครั้งถัดไป + รอบต่อ ๆ ไปอีก 3 รอบ (สำหรับวางแผน)
      let d = m.next!
      for (let k = 0; k < 4; k++) {
        out.push({ date: d, label: `${a.code} ไส้กรอง`, tone: k === 0 ? toneOf(d) : 'ok', href: `#/work-orders/new?asset=${encodeURIComponent(a.code)}&cat=AC&desc=${encodeURIComponent('PM เปลี่ยนไส้กรอง / ล้างคอยล์')}`, title: `${a.code} · ${a.location}` })
        d = addDays(d, Math.round(m.interval!))
      }
    })
    // งานประจำ (checklist): วัด PM2.5/อุณหภูมิ ทุกวันจันทร์
    const [y, mo] = ym.split('-').map(Number)
    const days = new Date(y, mo, 0).getDate()
    for (let day = 1; day <= days; day++) {
      const iso = `${ym}-${pad(day)}`
      if (new Date(iso + 'T00:00:00').getDay() === 1) {
        const done = data.workOrders.some((w) => w.routine && w.workDate >= iso && w.workDate <= addDays(iso, 6))
        out.push({ date: iso, label: `วัด PM2.5/อุณหภูมิ${done ? ' ✓' : ''}`, tone: 'info', href: `#/work-orders/new?cat=OTH&desc=${encodeURIComponent('วัดค่า PM2.5 และอุณหภูมิประจำสัปดาห์')}`, title: done ? 'ทำแล้วในสัปดาห์นี้' : 'งานประจำสัปดาห์' })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pm, ym, data.workOrders, t])

  const [y, mo] = ym.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)) // เริ่มวันจันทร์
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoOf(d) })
  const shift = (n: number) => { const d = new Date(y, mo - 1 + n, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`) }

  const list = pm.slice().sort((a, b) => (a.m.next! < b.m.next! ? -1 : 1))

  return (
    <>
      <PageHead title="PM Calendar" sub="รอบ PM ต่อเครื่องคำนวณจากประวัติจริง (median ของช่วงห่างการเปลี่ยนไส้กรอง) · งานประจำแยกเป็น checklist"
        actions={<div className="seg"><button aria-pressed={view === 'month'} onClick={() => setView('month')}>เดือน</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>รายการ</button></div>} />
      <div className="row small">
        <Tag tone="ok">ปกติ</Tag><Tag tone="warn">ใกล้ถึง ({data.settings.pmWarnDays} วัน)</Tag><Tag tone="danger">เลยกำหนด</Tag><Tag tone="info">งานประจำ</Tag>
      </div>
      {pm.some((x) => x.overdue) && (
        <div className="notice danger">
          PM เลยกำหนด:{' '}
          {pm.filter((x) => x.overdue).map((x, i) => (
            <span key={x.a.id}>{i > 0 && ', '}<a href={`#/assets/${encodeURIComponent(x.a.id)}`}>{x.a.code}</a> ({thDate(x.m.next)})</span>
          ))}
        </div>
      )}
      {view === 'month' ? (
        <Card title={`${TH_MONTHS_FULL[mo - 1]} ${y}`} right={<>
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="เดือนก่อน"><ChevronLeft size={18} /></button>
          <button className="btn sm" onClick={() => setYm(t.slice(0, 7))}>วันนี้</button>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="เดือนถัดไป"><ChevronRight size={18} /></button>
        </>}>
          <div className="cal">
            {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((c) => {
              const evs = events.filter((e) => e.date === c)
              return (
                <div key={c} className={`day ${c.slice(0, 7) !== ym ? 'out' : ''} ${c === t ? 'today' : ''}`}>
                  <span className="d">{+c.slice(8)}</span>
                  {evs.map((e, i) => <a key={i} className={`ev ${e.tone}`} href={e.href} title={e.title}>{e.label}</a>)}
                </div>
              )
            })}
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>คลิกที่รายการเพื่อเปิดฟอร์มบันทึกงานพร้อมรหัสเครื่อง</p>
        </Card>
      ) : (
        <Card title="กำหนด PM เปลี่ยนไส้กรอง">
          {list.length === 0 ? <Empty>ยังไม่มีเครื่องที่มีประวัติเปลี่ยนไส้กรองพอคำนวณรอบ (ต้อง ≥ 2 ครั้ง)</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>เครื่อง</th><th>สถานที่</th><th>ครั้งล่าสุด</th><th>รอบ</th><th>ครั้งถัดไป</th><th>สถานะ</th><th></th></tr></thead>
              <tbody>
                {list.map(({ a, m, overdue, soon }) => (
                  <tr key={a.id}>
                    <td className="code"><a href={`#/assets/${encodeURIComponent(a.id)}`}>{a.code}</a></td>
                    <td>{a.location}</td>
                    <td className="nowrap">{thDate(addDays(m.next!, -Math.round(m.interval!)))}</td>
                    <td className="nowrap">{Math.round(m.interval! / 30)} เดือน</td>
                    <td className="nowrap">{thDate(m.next)}</td>
                    <td>{overdue ? <Tag tone="danger">เลยกำหนด</Tag> : soon ? <Tag tone="warn">ใกล้ถึง</Tag> : <Tag tone="ok">ปกติ</Tag>}</td>
                    <td><a className="btn sm" href={`#/work-orders/new?asset=${encodeURIComponent(a.code)}&cat=AC&desc=${encodeURIComponent('PM เปลี่ยนไส้กรอง / ล้างคอยล์')}`}>บันทึกงาน</a></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}
    </>
  )
}
