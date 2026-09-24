import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { setWOStatus, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { Card, Empty, PageHead, Tag } from '../components/ui'
import { STATUS_LABEL, STATUS_TONE } from '../lib/rules'
import { thDate } from '../lib/format'
import type { WOStatus } from '../lib/types'

const STATUSES: WOStatus[] = ['open', 'in_process', 'completed', 'suspended']

export default function WorkOrders({ route }: { route: Route }) {
  const { data, update, user, toast } = useStore()
  const [status, setStatus] = useState(route.query.get('status') ?? '')
  const [cat, setCat] = useState(route.query.get('cat') ?? '')
  const [building, setBuilding] = useState('')
  const [floor, setFloor] = useState('')
  const [tech, setTech] = useState('')
  const [q, setQ] = useState('')
  const [showRoutine, setShowRoutine] = useState(true)

  const staff = (id: string) => data.staff.find((s) => s.id === id)?.name ?? id
  const loc = (id: string) => data.locations.find((l) => l.id === id)
  const catName = (id: string) => data.categories.find((c) => c.id === id)?.nameEn ?? id

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return data.workOrders
      .filter((w) => !status || (status === 'pending' ? w.status === 'open' || w.status === 'in_process' : w.status === status))
      .filter((w) => !cat || w.categoryId === cat)
      .filter((w) => !building || w.building === building)
      .filter((w) => !floor || loc(w.locationId)?.floor === floor)
      .filter((w) => !tech || w.technicianId === tech)
      .filter((w) => showRoutine || !w.routine)
      .filter((w) => !ql || `${w.jobNo} ${w.description} ${w.assetCode ?? ''} ${w.parts.map((p) => p.partCode).join(' ')}`.toLowerCase().includes(ql))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, status, cat, building, floor, tech, q, showRoutine])

  const floors = [...new Set(data.locations.map((l) => l.floor))]

  return (
    <>
      <PageHead title="Work Orders" sub="รายการงานซ่อมและงานประจำ · กดที่แถวเพื่อแก้ไข" actions={<a className="btn primary" href="#/work-orders/new"><Plus size={16} />บันทึกงาน</a>} />
      <Card>
        <div className="stack">
          <div className="chips" role="group" aria-label="กรองสถานะ">
            {[['', 'ทั้งหมด'], ['pending', 'ยังไม่เสร็จ'], ...STATUSES.map((s) => [s, STATUS_LABEL[s]])].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={status === v} onClick={() => setStatus(v)}>
                {l} ({data.workOrders.filter((w) => !v || (v === 'pending' ? w.status === 'open' || w.status === 'in_process' : w.status === v)).length})
              </button>
            ))}
          </div>
          <div className="toolbar">
            <div className="search" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--muted)' }} />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="ค้นหา Job, รายละเอียด, รหัสเครื่อง/อะไหล่" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
            </div>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="ประเภทงาน">
              <option value="">ทุกประเภท</option>
              {data.categories.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
            </select>
            <select className="input" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="อาคาร">
              <option value="">HQ + CSC</option><option>HQ</option><option>CSC</option>
            </select>
            <select className="input" value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="ชั้น">
              <option value="">ทุกชั้น</option>
              {floors.map((f) => <option key={f}>{f}</option>)}
            </select>
            <select className="input" value={tech} onChange={(e) => setTech(e.target.value)} aria-label="ช่าง">
              <option value="">ช่างทุกคน</option>
              {data.staff.filter((s) => s.role === 'technician').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={showRoutine} onChange={(e) => setShowRoutine(e.target.checked)} />รวมงานประจำ</label>
          </div>
        </div>
      </Card>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Job No.</th><th>วันที่</th><th>สถานที่</th><th>ประเภท</th><th>รายละเอียด</th><th className="hide-sm">อะไหล่</th><th className="hide-sm">ช่าง</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {list.map((w, i) => (
                <tr key={w.jobNo + i} className="click" onClick={() => (window.location.hash = `/work-orders/edit/${encodeURIComponent(w.jobNo)}`)}>
                  <td className="code">{w.jobNo}<div className="small muted" style={{ fontWeight: 400 }}>{w.building}</div></td>
                  <td className="nowrap">{thDate(w.workDate)}</td>
                  <td>{loc(w.locationId)?.floor ?? w.locationId}</td>
                  <td className="small">{catName(w.categoryId)}{w.routine && <div><Tag tone="info">งานประจำ</Tag></div>}</td>
                  <td style={{ minWidth: 200 }}>{w.description}{w.assetCode && <div className="small"><a href={`#/assets/${encodeURIComponent(w.assetCode)}`} onClick={(e) => e.stopPropagation()}>{w.assetCode}</a></div>}</td>
                  <td className="small hide-sm">{w.parts.length ? w.parts.map((p) => `${p.partCode}×${p.qty}`).join(', ') : <span className="muted">–</span>}</td>
                  <td className="hide-sm">{staff(w.technicianId)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="input" style={{ padding: '4px 6px', fontSize: 13, width: 'auto', color: `var(--${STATUS_TONE[w.status]})`, fontWeight: 500 }} value={w.status} aria-label={`สถานะ ${w.jobNo}`}
                      onChange={(e) => { const st = e.target.value as WOStatus; update((d) => setWOStatus(d, w.jobNo, st, user)); toast(`${w.jobNo} → ${STATUS_LABEL[st]}`) }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <Empty>ไม่พบงานที่ตรงกับเงื่อนไข</Empty>}
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>แสดง {list.length} จาก {data.workOrders.length} งาน</p>
      </Card>
    </>
  )
}
