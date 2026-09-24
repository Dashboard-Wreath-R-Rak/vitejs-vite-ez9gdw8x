import { useMemo, useState } from 'react'
import { BadgeDollarSign, Copy, Gavel, Plus, Tags } from 'lucide-react'
import { log, notify, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { AIBadge, Card, Empty, Field, Modal, PageHead, Stat, Tag } from '../components/ui'
import { findOffer, isThisMonth, effectiveUnit, lastPrice, lowStock, type Offer } from '../lib/rules'
import { challengeDraft } from '../lib/ai'
import { addDays, fmt, thDate, todayISO, uid } from '../lib/format'
import type { Challenge, ChallengeStatus } from '../lib/types'

const CH_LABEL: Record<ChallengeStatus, string> = { draft: 'ร่าง', sent: 'ส่งแล้ว', reduced: 'Vendor ลดราคา', held: 'ยืนราคา', no_reply: 'ไม่ตอบ' }
const CH_TONE: Record<ChallengeStatus, 'neutral' | 'info' | 'ok' | 'warn' | 'danger'> = { draft: 'neutral', sent: 'info', reduced: 'ok', held: 'warn', no_reply: 'danger' }

interface QuoteDraft { partCode: string; vendorId: string; unitPrice: number; qty: number }

export default function Prices({ route }: { route: Route }) {
  const { data, update, user, toast } = useStore()
  const [partCode, setPartCode] = useState(route.query.get('part') ?? data.parts[11]?.code ?? '')
  const [vendorId, setVendorId] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [offer, setOffer] = useState<{ q: QuoteDraft; o: Offer } | null>(null)
  const [reason, setReason] = useState('')
  const [chModal, setChModal] = useState<QuoteDraft & { target: number } | null>(null)

  const vName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? id
  const part = data.parts.find((p) => p.code === partCode)
  const history = data.prices.filter((p) => p.partCode === partCode).sort((a, b) => (a.date < b.date ? 1 : -1))
  const since = addDays(todayISO(), -data.settings.priceWindowMonths * 30)
  const inWindow = history.filter((h) => h.date >= since)
  const min = inWindow.length ? Math.min(...inWindow.map((h) => effectiveUnit(h))) : null

  const lowOffers = useMemo(() => lowStock(data).map((l) => {
    const lp = lastPrice(data, l.part.code)
    return lp ? { l, lp, o: findOffer(data, l.part.code, effectiveUnit(lp), lp.vendorId) } : null
  }).filter((x) => x?.o), [data])

  const savingMonth = data.challenges.filter((c) => c.finalPrice != null && isThisMonth(c.createdAt.slice(0, 10))).reduce((s, c) => s + Math.max(0, c.currentPrice - c.finalPrice!), 0)
  const savingAll = data.challenges.filter((c) => c.finalPrice != null).reduce((s, c) => s + Math.max(0, c.currentPrice - c.finalPrice!), 0)

  function check() {
    const p = +price
    if (!partCode || !vendorId || !(p > 0)) { toast('เลือกอะไหล่ Vendor และกรอกราคา', 'warn'); return }
    const q = { partCode, vendorId, unitPrice: p, qty: parseInt(qty) || 1 }
    const o = findOffer(data, partCode, p, vendorId)
    if (o) { setOffer({ q, o }); setReason(''); update((d) => notify(d, { kind: 'offer', title: `Offer: ${part?.name}`, body: `ใบเสนอราคา ${fmt(p, 2)} บาท สูงกว่าราคาต่ำสุด ${o.diffPct.toFixed(1)}%` })) }
    else { record(q, 'ราคาไม่สูงกว่าราคาอ้างอิง'); toast('ราคานี้อยู่ในเกณฑ์ — บันทึกแล้ว', 'ok') }
  }

  function record(q: QuoteDraft, decision: string) {
    update((d) => {
      d.prices.push({ id: uid('p'), partCode: q.partCode, vendorId: q.vendorId, unitPrice: q.unitPrice, qty: q.qty, vatIncluded: true, date: todayISO(), source: 'quote', decision })
      log(d, user, 'บันทึกใบเสนอราคา', `${q.partCode} ${vName(q.vendorId)} ${q.unitPrice} · ${decision}`)
    })
    setPrice('')
  }

  return (
    <>
      <PageHead title="ราคา & Vendor" sub="เทียบราคากับประวัติของบริษัทเอง (Offer) และส่ง Challenge ขอปรับราคา" actions={<a className="btn" href="#/compare">เปรียบเทียบราคาทุกรายการ</a>} />
      <div className="stats">
        <Stat icon={<BadgeDollarSign size={18} />} tone="ai" small="เดือนนี้ (บาท/หน่วย)" label="ประหยัดจาก Challenge" value={fmt(savingMonth)} />
        <Stat icon={<BadgeDollarSign size={18} />} tone="ok" small="สะสม (บาท/หน่วย)" label="ประหยัดทั้งหมด" value={fmt(savingAll)} />
        <Stat icon={<Gavel size={18} />} tone="info" label="Challenge ที่รอคำตอบ" value={data.challenges.filter((c) => c.status === 'sent' || c.status === 'draft').length} />
        <Stat icon={<Tags size={18} />} tone="primary" label="ประวัติราคา" value={data.prices.length} />
      </div>

      {lowOffers.length > 0 && (
        <Card ai title="Offer จาก Low-stock Alert" right={<AIBadge label="Offer อัตโนมัติ" />}>
          <div className="stack" style={{ gap: 8 }}>
            {lowOffers.map((x) => (
              <div key={x!.l.building + x!.l.part.code} className="row between">
                <span><b>{x!.l.part.code}</b> {x!.l.part.name} ({x!.l.building} เหลือ {x!.l.onHand}) — ครั้งล่าสุด {fmt(effectiveUnit(x!.lp), 2)} จาก {vName(x!.lp.vendorId)} · ราคาต่ำสุด {fmt(effectiveUnit(x!.o!.best), 2)} จาก {vName(x!.o!.best.vendorId)} ({thDate(x!.o!.best.date)}) ถูกกว่า {x!.o!.diffPct.toFixed(1)}%</span>
                <button className="btn sm" onClick={() => { setPartCode(x!.l.part.code); setVendorId(x!.lp.vendorId); setPrice(String(x!.lp.unitPrice)); setQty(String(x!.l.orderQty)) }}>ตรวจใบเสนอราคา</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid g2">
        <Card title="กรอกใบเสนอราคา / PO ใหม่">
          <div className="form-grid">
            <Field label="อะไหล่ / สินค้า" full>
              <select className="input" value={partCode} onChange={(e) => { setPartCode(e.target.value); setOffer(null) }}>
                {data.parts.map((p) => <option key={p.code} value={p.code}>{p.code} {p.name}</option>)}
              </select>
            </Field>
            <Field label="Vendor">
              <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">— เลือก —</option>{data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
            <Field label="จำนวน"><input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="ราคาต่อหน่วย (บาท รวม VAT)" full hint="เทียบแบบเดียวกันจริง: สเปก จำนวน รับประกัน ค่าขนส่ง VAT">
              <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          </div>
          <div className="row" style={{ marginTop: 14 }}><button className="btn primary" onClick={check}><Plus size={16} />ตรวจราคาและบันทึก</button></div>

          {offer && (
            <div className="suggest" style={{ marginTop: 14 }}>
              <div className="row between"><AIBadge label="Offer" /><span className="small muted">เกณฑ์ ≥ {data.settings.offerThresholdPct}% ใน {data.settings.priceWindowMonths} เดือน</span></div>
              <div className="kv">
                <div><span>ราคานี้</span><b>{fmt(offer.q.unitPrice, 2)}</b> บาท · {vName(offer.q.vendorId)}</div>
                <div><span>ราคาต่ำสุด</span><b>{fmt(effectiveUnit(offer.o.best), 2)}</b> บาท · {vName(offer.o.best.vendorId)} ({thDate(offer.o.best.date)})</div>
                <div><span>ส่วนต่าง</span><b style={{ color: 'var(--danger)' }}>{offer.o.diffPct.toFixed(1)}%</b> ({fmt((offer.q.unitPrice - effectiveUnit(offer.o.best)) * offer.q.qty)} บาท ทั้งล็อต)</div>
              </div>
              <div className="row">
                <button className="btn primary sm" onClick={() => { record({ ...offer.q, vendorId: offer.o.best.vendorId, unitPrice: Math.round(effectiveUnit(offer.o.best) * 100) / 100 }, 'ใช้ Vendor ที่ถูกกว่า'); setOffer(null); toast('บันทึก: ใช้ Vendor ที่ถูกกว่า', 'ok') }}>ใช้ Vendor ที่ถูกกว่า</button>
                <button className="btn ai sm" onClick={() => { setChModal({ ...offer.q, target: Math.round(effectiveUnit(offer.o.best) * 100) / 100 }); }}><Gavel size={14} />Challenge</button>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" placeholder="เหตุผลที่ใช้ราคานี้ (บังคับ)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn sm" disabled={reason.trim().length < 3} onClick={() => { record(offer.q, 'ใช้ราคานี้: ' + reason.trim()); setOffer(null); toast('บันทึกพร้อมเหตุผลแล้ว', 'ok') }}>ใช้ราคานี้</button>
              </div>
            </div>
          )}
        </Card>

        <Card title={`ประวัติราคา ${part?.name ?? ''}`} right={<a className="small" href={`#/compare/${encodeURIComponent(partCode)}`}>เทียบทุก Vendor</a>}>
          {history.length === 0 ? <Empty>ยังไม่มีประวัติราคา</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>วันที่</th><th>Vendor</th><th className="num">ราคา/หน่วย</th><th className="num">จำนวน</th><th>ที่มา</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={h.date < since ? { opacity: 0.55 } : undefined}>
                    <td className="nowrap">{thDate(h.date)}</td>
                    <td>{vName(h.vendorId)}{h.decision && <div className="small muted">{h.decision}</div>}</td>
                    <td className="num">{fmt(effectiveUnit(h), 2)}{(!h.vatIncluded || h.deliveryCost) && <div className="small muted">ใบเสนอ {fmt(h.unitPrice, 2)}{!h.vatIncluded ? ' +VAT' : ''}{h.deliveryCost ? ` +ส่ง ${fmt(h.deliveryCost)}` : ''}</div>}{effectiveUnit(h) === min && h.date >= since && <div><Tag tone="ok">ต่ำสุด</Tag></div>}</td>
                    <td className="num">{h.qty}</td>
                    <td><Tag>{h.source}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="small muted" style={{ marginTop: 8 }}>แถวสีจางคือราคาที่เก่ากว่า {data.settings.priceWindowMonths} เดือน (ไม่ใช้เป็นราคาอ้างอิง) · แสดงวันที่ของราคาเสมอ</p>
        </Card>
      </div>

      <Card title="Challenge">
        {data.challenges.length === 0 ? <Empty>ยังไม่มี Challenge</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>อะไหล่</th><th>Vendor ปัจจุบัน</th><th className="num">ราคาเริ่มต้น</th><th className="num">ราคาเป้าหมาย</th><th>Deadline</th><th>สถานะ</th><th className="num">ราคาสุดท้าย</th><th className="num">ประหยัด/หน่วย</th></tr></thead>
            <tbody>
              {data.challenges.map((c) => (
                <ChallengeRow key={c.id} c={c} vName={vName} />
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="ทะเบียน Vendor">
        <div className="table-wrap"><table>
          <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>ผู้ติดต่อ</th><th>โทร</th><th>อีเมล</th></tr></thead>
          <tbody>{data.vendors.map((v) => <tr key={v.id}><td>{v.name}</td><td><Tag>{v.role}</Tag></td><td>{v.contact ?? '–'}</td><td className="nowrap">{v.phone ?? '–'}</td><td>{v.email ?? '–'}</td></tr>)}</tbody>
        </table></div>
        <p className="small muted" style={{ marginTop: 8 }}>แก้ไข Vendor ได้ที่ <a href="#/settings?tab=vendors">Master Data</a> — แก้ที่เดียว ใช้ทุกเครื่อง (P13)</p>
      </Card>

      {chModal && <ChallengeModal q={chModal} onClose={() => setChModal(null)} onCreated={() => { record(chModal, 'ส่ง Challenge'); setOffer(null); setChModal(null) }} />}
    </>
  )
}

function ChallengeRow({ c, vName }: { c: Challenge; vName: (id: string) => string }) {
  const { data, update, user } = useStore()
  const [final, setFinal] = useState(c.finalPrice != null ? String(c.finalPrice) : '')
  const part = data.parts.find((p) => p.code === c.partCode)
  const overdue = c.status === 'sent' && c.deadline < todayISO()
  const set = (fn: (x: Challenge) => void, msg: string) => update((d) => { const x = d.challenges.find((y) => y.id === c.id)!; fn(x); log(d, user, 'Challenge', `${c.partCode}: ${msg}`) })
  return (
    <tr>
      <td><b>{c.partCode}</b><div className="small muted">{part?.name}</div></td>
      <td>{vName(c.currentVendorId)}{c.rfqVendorIds.length > 0 && <div className="small muted">RFQ: {c.rfqVendorIds.length} ราย</div>}</td>
      <td className="num">{fmt(c.currentPrice, 2)}</td>
      <td className="num">{fmt(c.targetPrice, 2)}</td>
      <td className="nowrap">{thDate(c.deadline)}{overdue && <div><Tag tone="danger">เลย deadline</Tag></div>}</td>
      <td>
        <select className="input" style={{ padding: '4px 6px', fontSize: 13, width: 'auto' }} value={c.status} aria-label="สถานะ Challenge"
          onChange={(e) => set((x) => { x.status = e.target.value as ChallengeStatus; if (x.status === 'held' || x.status === 'no_reply') x.finalPrice = x.currentPrice }, `สถานะ → ${CH_LABEL[e.target.value as ChallengeStatus]}`)}>
          {Object.entries(CH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div style={{ marginTop: 4 }}><Tag tone={CH_TONE[c.status]}>{CH_LABEL[c.status]}</Tag></div>
      </td>
      <td className="num">
        {c.status === 'reduced' ? (
          <input className="input" style={{ width: 90, padding: '4px 6px', textAlign: 'right' }} inputMode="decimal" value={final} aria-label="ราคาสุดท้าย"
            onChange={(e) => setFinal(e.target.value)} onBlur={() => { const v = +final; if (v > 0 && v !== c.finalPrice) set((x) => { x.finalPrice = v }, `ราคาสุดท้าย ${v}`) }} />
        ) : c.finalPrice != null ? fmt(c.finalPrice, 2) : '–'}
      </td>
      <td className="num">{c.finalPrice != null ? <b style={{ color: 'var(--ok)' }}>{fmt(Math.max(0, c.currentPrice - c.finalPrice), 2)}</b> : '–'}</td>
    </tr>
  )
}

function ChallengeModal({ q, onClose, onCreated }: { q: QuoteDraft & { target: number }; onClose: () => void; onCreated: () => void }) {
  const { data, update, user, toast } = useStore()
  const part = data.parts.find((p) => p.code === q.partCode)!
  const vendor = data.vendors.find((v) => v.id === q.vendorId)!
  const [target, setTarget] = useState(String(q.target))
  const [deadline, setDeadline] = useState(addDays(todayISO(), 7))
  const [rfq, setRfq] = useState<string[]>([])
  const [msg, setMsg] = useState(() => challengeDraft({ part, vendor, currentPrice: q.unitPrice, targetPrice: q.target, qty: q.qty, deadline: addDays(todayISO(), 7) }))
  const others = data.vendors.filter((v) => v.id !== q.vendorId && (v.role === 'supplier' || v.role === 'contractor'))
  const leaks = data.vendors.filter((v) => v.id !== vendor.id && msg.includes(v.name.replace(/\s*\(ตัวอย่าง\)/, '')))

  function create(status: ChallengeStatus) {
    if (leaks.length) { toast('ข้อความมีชื่อ Vendor อื่น — ห้ามเปิดเผย', 'danger'); return }
    const ch: Challenge = { id: uid('c'), partCode: q.partCode, currentVendorId: q.vendorId, currentPrice: q.unitPrice, targetPrice: +target, rfqVendorIds: rfq, status, deadline, message: msg, createdAt: new Date().toISOString(), decidedBy: user }
    update((d) => { d.challenges.unshift(ch); log(d, user, 'สร้าง Challenge', `${q.partCode} ${vendor.name} ${q.unitPrice} → เป้าหมาย ${target}`) })
    toast(status === 'sent' ? 'บันทึกว่าส่ง Challenge แล้ว' : 'บันทึกร่าง Challenge แล้ว', 'ok')
    onCreated()
  }

  return (
    <Modal title={`Challenge · ${part.name}`} onClose={onClose} wide>
      <div className="stack">
        <div className="form-grid">
          <Field label="ราคาเป้าหมาย (บาท/หน่วย)"><input className="input" inputMode="decimal" value={target} onChange={(e) => { setTarget(e.target.value); setMsg(challengeDraft({ part, vendor, currentPrice: q.unitPrice, targetPrice: +e.target.value || 0, qty: q.qty, deadline })) }} /></Field>
          <Field label="Deadline"><input className="input" type="date" value={deadline} onChange={(e) => { setDeadline(e.target.value); setMsg(challengeDraft({ part, vendor, currentPrice: q.unitPrice, targetPrice: +target || 0, qty: q.qty, deadline: e.target.value })) }} /></Field>
        </div>
        <Field label="ข้อความถึง Vendor ปัจจุบัน" hint="ตรวจ/แก้ก่อนส่งทุกครั้ง · ระบุเฉพาะราคาเป้าหมาย ห้ามเปิดเผยชื่อหรือเอกสารของ Vendor อื่น">
          <div className="row" style={{ marginBottom: 4 }}><AIBadge label="AI ร่างข้อความ" /></div>
          <textarea className="input" style={{ minHeight: 240 }} value={msg} onChange={(e) => setMsg(e.target.value)} />
        </Field>
        {leaks.length > 0 && <div className="notice danger">ข้อความมีชื่อ Vendor อื่น ({leaks.map((v) => v.name).join(', ')}) — ลบออกก่อนส่ง</div>}
        <Field label="ขอใบเสนอราคาเพิ่ม (RFQ) 2–3 ราย">
          <div className="chips">
            {others.map((v) => <button key={v.id} className="chip" aria-pressed={rfq.includes(v.id)} onClick={() => setRfq((r) => (r.includes(v.id) ? r.filter((x) => x !== v.id) : r.length >= 3 ? r : [...r, v.id]))}>{v.name}</button>)}
          </div>
        </Field>
        <p className="small muted">เป็นไปตามระเบียบจัดซื้อของบริษัท — วงเงินที่ต้องอนุมัติให้ตรวจก่อนส่ง</p>
        <div className="row">
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(msg).then(() => toast('คัดลอกข้อความแล้ว'), () => toast('คัดลอกไม่สำเร็จ', 'warn')) }}><Copy size={15} />คัดลอกข้อความ</button>
          <button className="btn" onClick={() => create('draft')}>บันทึกร่าง</button>
          <button className="btn primary" onClick={() => create('sent')}>ส่งแล้ว (บันทึกสถานะ)</button>
        </div>
      </div>
    </Modal>
  )
}
