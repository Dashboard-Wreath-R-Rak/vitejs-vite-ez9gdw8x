import { useMemo, useState } from 'react'
import { PackagePlus, SlidersHorizontal } from 'lucide-react'
import { addMovement, log, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { AIBadge, Card, Empty, Field, Modal, PageHead, Tag } from '../components/ui'
import { balances, findOffer, forecast, lastPrice, lowStock, usedBuildings } from '../lib/rules'
import { fmt, thDate, todayISO } from '../lib/format'
import type { Building, MovementType, Part } from '../lib/types'

export default function Inventory({ route }: { route: Route }) {
  const { data, update, user, toast } = useStore()
  const [building, setBuilding] = useState<Building>('HQ')
  const [onlyLow, setOnlyLow] = useState(route.query.get('filter') === 'low')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ part: Part; type: MovementType } | null>(null)
  const [histPart, setHistPart] = useState('')

  const bal = useMemo(() => balances(data.parts, data.movements), [data.parts, data.movements])
  const used = useMemo(() => usedBuildings(data), [data])
  const low = useMemo(() => lowStock(data), [data])
  const lowSet = new Set(low.map((l) => l.building + '|' + l.part.code))

  const list = data.parts
    .filter((p) => used[building].has(p.code) || !onlyLow)
    .filter((p) => !onlyLow || lowSet.has(building + '|' + p.code))
    .filter((p) => !q || `${p.code} ${p.hqCode} ${p.cscCode} ${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()))

  const hist = data.movements
    .filter((m) => m.building === building && (!histPart || m.partCode === histPart))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 40)

  return (
    <>
      <PageHead title="สต็อกอะไหล่" sub="ยอดคงเหลือคำนวณ real-time จากการรับเข้า (IN) และการเบิกใน Work Order (OUT)"
        actions={<div className="seg" role="group" aria-label="อาคาร">
          {(['HQ', 'CSC'] as Building[]).map((b) => <button key={b} aria-pressed={building === b} onClick={() => setBuilding(b)}>{b}</button>)}
        </div>} />

      {low.filter((l) => l.building === building).length > 0 && (
        <div className="notice danger">
          อะไหล่ {building} ต่ำกว่าหรือเท่ากับ MIN {low.filter((l) => l.building === building).length} รายการ — ระบบส่งการ์ดแจ้งเตือนเข้า Google Chat แล้ว
          {' '}<button className="btn sm" style={{ marginLeft: 8 }} onClick={() => setOnlyLow(true)}>แสดงเฉพาะรายการนี้</button>
        </div>
      )}

      <Card>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input className="input search" type="search" placeholder="ค้นหารหัส (HQ/CSC) หรือชื่ออะไหล่" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
          <label className="check"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />เฉพาะสต็อกต่ำ</label>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>รหัสกลาง</th><th>ชื่ออะไหล่</th><th className="hide-sm">รหัส HQ / CSC</th><th className="hide-sm">Box</th><th className="num">MIN / MAX</th><th className="num">คงเหลือ</th><th>สถานะ</th><th className="hide-sm">Forecast</th><th></th></tr></thead>
          <tbody>
            {list.map((p) => {
              const onHand = bal[building][p.code] ?? 0
              const isLow = onHand <= p.min && used[building].has(p.code)
              const f = forecast(data, p.code, building)
              const lp = lastPrice(data, p.code)
              const offer = isLow && lp ? findOffer(data, p.code, lp.unitPrice, lp.vendorId) : null
              return (
                <tr key={p.code}>
                  <td className="code">{p.code}</td>
                  <td>{p.name}<div className="small muted">{p.category} · {p.unit}</div></td>
                  <td className="small hide-sm">{p.hqCode ?? '–'} / {p.cscCode ?? '–'}</td>
                  <td className="hide-sm">{p.boxNo ?? '–'}</td>
                  <td className="num">{p.min} / {p.max}{p.min > p.max && <div><Tag tone="danger" title="Master data ผิด (P7)">MIN &gt; MAX</Tag></div>}</td>
                  <td className="num"><b>{onHand}</b></td>
                  <td>
                    {!used[building].has(p.code) ? <Tag>ไม่ได้เก็บที่ {building}</Tag> : onHand === 0 ? <Tag tone="danger">หมด</Tag> : isLow ? <Tag tone="warn">ต่ำกว่า MIN</Tag> : <Tag tone="ok">ปกติ</Tag>}
                    {isLow && <div className="small muted">สั่ง {Math.max(0, p.max - onHand)} ให้ถึง MAX</div>}
                    {offer && <div style={{ marginTop: 4 }}><a className="tag ai" href={`#/prices?part=${p.code}`}>มีราคาถูกกว่า {offer.diffPct.toFixed(0)}%</a></div>}
                  </td>
                  <td className="small hide-sm">
                    {f.perMonth > 0 ? <>
                      ใช้ ~{fmt(f.perMonth, 1)}/เดือน
                      {(f.min !== p.min || f.max !== p.max) && f.min <= f.max && <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        <AIBadge /><button className="btn sm" onClick={() => {
                          if (!confirm(`ปรับ ${p.code} เป็น MIN ${f.min} / MAX ${f.max}?`)) return
                          update((d) => { const x = d.parts.find((y) => y.code === p.code)!; log(d, user, 'ปรับ MIN/MAX', `${p.code} ${x.min}/${x.max} → ${f.min}/${f.max}`); x.min = f.min; x.max = f.max })
                          toast(`ปรับ ${p.code} แล้ว`)
                        }}>{f.min}/{f.max}</button>
                      </div>}
                    </> : <span className="muted">–</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setModal({ part: p, type: 'IN' })}><PackagePlus size={14} />รับเข้า</button>
                      <button className="icon-btn" title="ปรับยอด (นับสต็อก)" aria-label="ปรับยอด" onClick={() => setModal({ part: p, type: 'ADJUST' })}><SlidersHorizontal size={15} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {!list.length && <Empty>ไม่พบอะไหล่</Empty>}
      </Card>

      <Card title={`ประวัติเคลื่อนไหว ${building}`} right={
        <select className="input" style={{ width: 'auto' }} value={histPart} onChange={(e) => setHistPart(e.target.value)} aria-label="กรองอะไหล่">
          <option value="">ทุกอะไหล่</option>
          {data.parts.map((p) => <option key={p.code} value={p.code}>{p.code}</option>)}
        </select>}>
        <div className="table-wrap"><table>
          <thead><tr><th>วันที่</th><th>อะไหล่</th><th>ประเภท</th><th className="num">จำนวน</th><th>อ้างอิง</th><th>ผู้บันทึก</th></tr></thead>
          <tbody>
            {hist.map((m) => (
              <tr key={m.id}>
                <td className="nowrap">{thDate(m.date)}</td>
                <td className="code">{m.partCode}</td>
                <td>{m.type === 'IN' ? <Tag tone="ok">รับเข้า</Tag> : m.type === 'OUT' ? <Tag tone="warn">เบิก</Tag> : <Tag tone="info">ตั้งยอด</Tag>}</td>
                <td className="num">{m.type === 'OUT' ? '−' : m.type === 'IN' ? '+' : '='}{m.qty}</td>
                <td className="small">{m.refJobNo ? <a href={`#/work-orders/edit/${encodeURIComponent(m.refJobNo)}`}>{m.refJobNo}</a> : m.note ?? '–'}</td>
                <td className="small">{m.recordedBy}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {modal && <MovementModal part={modal.part} type={modal.type} building={building} onHand={bal[building][modal.part.code] ?? 0} onClose={() => setModal(null)} />}
    </>
  )
}

function MovementModal({ part, type, building, onHand, onClose }: { part: Part; type: MovementType; building: Building; onHand: number; onClose: () => void }) {
  const { data, update, user, toast } = useStore()
  const [qty, setQty] = useState(type === 'ADJUST' ? String(onHand) : String(Math.max(1, part.max - onHand)))
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [price, setPrice] = useState('')
  const n = parseInt(qty) || 0
  const lp = lastPrice(data, part.code)
  const offer = type === 'IN' && price ? findOffer(data, part.code, +price, vendorId) : null

  function save() {
    if (n < 0 || (type === 'IN' && n === 0)) { toast('จำนวนไม่ถูกต้อง', 'warn'); return }
    update((d) => {
      addMovement(d, { partCode: part.code, building, type, qty: n, date, recordedBy: user, note: note || undefined }, user)
      if (type === 'IN' && vendorId && +price > 0) {
        d.prices.push({ id: 'p' + Date.now(), partCode: part.code, vendorId, unitPrice: +price, qty: n, vatIncluded: true, date, source: 'PO', docRef: note || undefined })
      }
    })
    toast(type === 'IN' ? `รับเข้า ${part.code} ${n} ${part.unit}` : `ตั้งยอด ${part.code} = ${n}`, 'ok')
    onClose()
  }

  return (
    <Modal title={`${type === 'IN' ? 'รับเข้า' : 'ปรับยอด (นับสต็อก)'} · ${part.code} ${part.name} (${building})`} onClose={onClose}>
      <div className="stack">
        <p className="small muted">คงเหลือปัจจุบัน {onHand} {part.unit} · MIN {part.min} / MAX {part.max}</p>
        <div className="form-grid">
          <Field label={type === 'IN' ? 'จำนวนที่รับเข้า' : 'ยอดที่นับได้จริง'}><input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="วันที่"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          {type === 'IN' && <>
            <Field label="Vendor (ถ้ามี)">
              <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">—</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="ราคาต่อหน่วย (บาท รวม VAT)" hint={lp ? `ครั้งล่าสุด ${fmt(lp.unitPrice, 2)} บาท (${thDate(lp.date)})` : undefined}>
              <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </>}
          <Field label={type === 'IN' ? 'เลขที่ PO / เอกสาร' : 'หมายเหตุ'} full><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {offer && (
          <div className="suggest">
            <AIBadge label="Offer" />
            <span className="small">ราคานี้สูงกว่าราคาต่ำสุดใน {data.settings.priceWindowMonths} เดือน {offer.diffPct.toFixed(1)}% ({fmt(offer.best.unitPrice, 2)} บาท จาก {data.vendors.find((v) => v.id === offer.best.vendorId)?.name}, {thDate(offer.best.date)}) — <a href={`#/prices?part=${part.code}`}>ไปหน้า Challenge</a></span>
          </div>
        )}
        {type === 'IN' && <p className="small muted">หลังรับเข้า: {onHand + n} {part.unit}</p>}
        <div className="row"><button className="btn primary" onClick={save}>บันทึก</button><button className="btn" onClick={onClose}>ยกเลิก</button></div>
      </div>
    </Modal>
  )
}
