// ฟอร์มบันทึกงาน (HQ / CSC WORK ORDER) — หน้าจอแบบแอปมือถือสำหรับช่าง
import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft, Building2, Check, CheckCircle2, ChevronRight, Droplets, MapPin, Minus, MoreHorizontal, Package, Plus, QrCode,
  Search, Snowflake, Sparkles, Trash2, User, X, Zap,
} from 'lucide-react'
import { saveWorkOrder, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { go } from '../lib/router'
import { STATUS_LABEL, balances, findPart, isValidJobNo, nextJobNo, normalizeJobNo, normalizePartCode } from '../lib/rules'
import { suggestWorkOrder } from '../lib/ai'
import { thDate, todayISO } from '../lib/format'
import type { Building, WOPart, WOStatus, WorkOrder } from '../lib/types'

const CAT_ICON: Record<string, ReactNode> = {
  EE: <Zap size={22} />, SAN: <Droplets size={22} />, AC: <Snowflake size={22} />, BLD: <Building2 size={22} />, OTH: <MoreHorizontal size={22} />,
}
const STATUSES: WOStatus[] = ['open', 'in_process', 'completed', 'suspended']

export default function WorkOrderForm({ route }: { route: Route }) {
  const { data, update, user, toast } = useStore()
  const editJob = route.parts[1] === 'edit' ? route.parts[2] : undefined
  const existing = editJob ? data.workOrders.find((w) => w.jobNo === editJob) : undefined
  const qAsset = route.query.get('asset') ?? undefined
  const assetFromQR = qAsset ? Object.values(data.assets).find((a) => a.code === qAsset) : undefined
  const me = data.staff.find((s) => s.name === user)

  const [jobNo, setJobNo] = useState(existing?.jobNo ?? nextJobNo(data.workOrders))
  const [workDate, setWorkDate] = useState(existing?.workDate ?? todayISO())
  const [building, setBuilding] = useState<Building>(existing?.building ?? (assetFromQR?.location.startsWith('CSC') ? 'CSC' : 'HQ'))
  const [requesterId, setRequesterId] = useState(existing?.requesterId ?? '')
  const [technicianId, setTechnicianId] = useState(existing?.technicianId ?? (me?.role === 'technician' ? me.id : ''))
  const [locationId, setLocationId] = useState(existing?.locationId ?? guessLocation())
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? route.query.get('cat') ?? (assetFromQR ? 'AC' : ''))
  const [assetCode, setAssetCode] = useState(existing?.assetCode ?? assetFromQR?.code ?? '')
  const [description, setDescription] = useState(existing?.description ?? route.query.get('desc') ?? '')
  const [status, setStatus] = useState<WOStatus>(existing?.status ?? 'completed')
  const [routine, setRoutine] = useState(existing?.routine ?? route.query.get('cat') === 'OTH')
  const [parts, setParts] = useState<WOPart[]>(existing?.parts ?? [])
  const [noParts, setNoParts] = useState(existing ? existing.parts.length === 0 : false)
  const [tried, setTried] = useState(false)
  const [dismissAI, setDismissAI] = useState(false)
  const [sheet, setSheet] = useState<'' | 'part' | 'asset' | 'requester' | 'job'>('')
  const [saved, setSaved] = useState<WorkOrder | null>(null)

  function guessLocation() {
    if (!assetFromQR) return ''
    const l = data.locations.find((l) => assetFromQR.location.includes(l.building) && assetFromQR.location.includes(l.floor))
    return l?.id ?? ''
  }

  const normJob = normalizeJobNo(jobNo)
  const dupJob = data.workOrders.some((w) => w.jobNo === normJob && w.jobNo !== existing?.jobNo)
  const bal = useMemo(() => balances(data.parts, data.movements), [data.parts, data.movements])
  const loc = data.locations.find((l) => l.id === locationId)
  const assetsHere = Object.values(data.assets).filter((a) => !loc || (a.location.includes(loc.building) && (loc.floor === 'Common' || a.location.includes(loc.floor))))
  const sugg = useMemo(() => suggestWorkOrder(description, data), [description, data])
  const hasSugg = !dismissAI && ((sugg.categoryId && sugg.categoryId !== categoryId) || (sugg.locationId && sugg.locationId !== locationId) || (sugg.assetCode && sugg.assetCode !== assetCode) || sugg.partCodes.some((p) => !parts.find((x) => x.partCode === p)))
  const asset = Object.values(data.assets).find((a) => a.code === assetCode)
  const requester = data.staff.find((s) => s.id === requesterId)

  const errors: Record<string, string> = {}
  if (!isValidJobNo(normJob)) errors.jobNo = 'รูปแบบต้องเป็น YY/NNN เช่น 26/450'
  else if (dupJob) errors.jobNo = `Job ${normJob} มีอยู่แล้ว — ตรวจว่าบันทึกซ้ำหรือไม่`
  if (!technicianId) errors.tech = 'เลือกช่างผู้รับผิดชอบ'
  if (!requesterId) errors.req = 'เลือกผู้แจ้งซ่อม'
  if (!locationId) errors.loc = 'เลือกสถานที่'
  if (!categoryId) errors.cat = 'เลือกประเภทงาน'
  if (description.trim().length < 3) errors.desc = 'กรอกรายละเอียดงาน'
  if (!noParts && parts.length === 0) errors.parts = 'เพิ่มอะไหล่ หรือเลือก "ไม่มีการใช้อะไหล่"'
  parts.forEach((p) => { if (!findPart(data.parts, p.partCode)) errors.parts = `ไม่พบรหัส ${p.partCode} ใน Parts master` })
  const err = (k: string) => (tried ? errors[k] : undefined)

  // ความคืบหน้า: ขั้นที่กรอกครบแล้ว
  const steps = [!!locationId, !!categoryId && description.trim().length >= 3, noParts || parts.length > 0, !!technicianId && !!requesterId]
  const done = steps.filter(Boolean).length

  function addPart(code: string, qty = 1) {
    const part = findPart(data.parts, normalizePartCode(code))
    if (!part) { toast(`ไม่พบรหัส ${code}`, 'warn'); return }
    setNoParts(false)
    setParts((ps) => ps.find((p) => p.partCode === part.code) ? ps.map((p) => (p.partCode === part.code ? { ...p, qty: p.qty + qty } : p)) : [...ps, { partCode: part.code, qty }])
  }
  const setQty = (code: string, fn: (q: number) => number) => setParts((ps) => ps.map((x) => (x.partCode === code ? { ...x, qty: Math.max(1, fn(x.qty)) } : x)))

  function applyAI() {
    if (sugg.categoryId) setCategoryId(sugg.categoryId)
    if (sugg.locationId) { setLocationId(sugg.locationId); setBuilding(data.locations.find((l) => l.id === sugg.locationId)!.building) }
    if (sugg.assetCode) setAssetCode(sugg.assetCode)
    setRoutine(sugg.routine)
    sugg.partCodes.forEach((p) => { if (!parts.find((x) => x.partCode === p)) addPart(p) })
  }

  function save() {
    setTried(true)
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0], 'warn')
      const first = document.querySelector('.m-body .m-card.bad')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const wo: WorkOrder = {
      jobNo: normJob, building, createdAt: existing?.createdAt ?? new Date().toISOString(), workDate, requesterId, technicianId, locationId, categoryId,
      assetCode: assetCode || undefined, description: description.trim(), status, routine, parts: noParts ? [] : parts,
    }
    update((d) => {
      if (existing && existing.jobNo !== wo.jobNo) {
        d.workOrders = d.workOrders.filter((w) => w.jobNo !== existing.jobNo)
        d.movements = d.movements.filter((m) => m.refJobNo !== existing.jobNo)
      }
      saveWorkOrder(d, wo, user, building, !existing)
    })
    setSaved(wo)
  }

  function remove() {
    if (!existing || !confirm(`ลบ ${existing.jobNo}? ระบบจะคืนสต็อกที่เบิกไว้`)) return
    update((d) => {
      d.workOrders = d.workOrders.filter((w) => w.jobNo !== existing.jobNo)
      d.movements = d.movements.filter((m) => m.refJobNo !== existing.jobNo)
      Object.values(d.assets).forEach((a) => { a.events = a.events.filter((e) => e.jobNo !== existing.jobNo) })
    })
    toast(`ลบ ${existing.jobNo} แล้ว`)
    go('/work-orders')
  }

  const techs = data.staff.filter((s) => s.active && s.role === 'technician')

  if (saved) return <SavedScreen wo={saved} isNew={!existing} />

  return (
    <div className="m-screen">
      <header className="m-header">
        <button className="m-icon" onClick={() => (history.length > 1 ? history.back() : go('/work-orders'))} aria-label="ย้อนกลับ"><ArrowLeft size={22} /></button>
        <div className="m-title">
          <b>{existing ? 'แก้ไขงาน' : 'บันทึกงานซ่อม'}</b>
          <span>{building} WORK ORDER</span>
        </div>
        <button className={`m-job ${errors.jobNo && (tried || dupJob) ? 'bad' : ''}`} onClick={() => setSheet('job')}>{normJob}</button>
      </header>
      <div className="m-progress" aria-label={`กรอกแล้ว ${done} จาก 4 ขั้น`}>
        {steps.map((ok, i) => <i key={i} className={ok ? 'on' : ''} />)}
      </div>

      <div className="m-body">
        {assetFromQR && (
          <div className="m-banner"><QrCode size={18} /><span>เปิดจาก QR ของเครื่อง <b>{assetFromQR.code}</b> · {assetFromQR.location}</span></div>
        )}
        {dupJob && <div className="m-banner bad">Job {normJob} มีอยู่แล้ว — แตะที่เลข Job มุมขวาบนเพื่อแก้</div>}

        {/* 1. ที่ไหน */}
        <section className={`m-card ${err('loc') ? 'bad' : ''}`}>
          <h3><span className="m-step">1</span>ที่ไหน</h3>
          <div className="m-seg">
            {(['HQ', 'CSC'] as Building[]).map((b) => (
              <button key={b} aria-pressed={building === b} onClick={() => { setBuilding(b); if (loc && loc.building !== b) setLocationId('') }}>{b}</button>
            ))}
          </div>
          <div className="m-grid3">
            {data.locations.filter((l) => l.building === building).map((l) => (
              <button key={l.id} className="m-tile sm" aria-pressed={locationId === l.id} onClick={() => setLocationId(l.id)}>
                {l.floor === 'Common' ? 'ส่วนกลาง' : l.floor === 'Roof' ? 'ดาดฟ้า' : `ชั้น ${l.floor.replace('FL', '')}`}
              </button>
            ))}
          </div>
          {err('loc') && <p className="m-err">{err('loc')}</p>}
          <button className="m-row" onClick={() => setSheet('asset')}>
            <span className="m-row-ic"><QrCode size={18} /></span>
            <span className="m-row-main"><small>รหัสเครื่อง (ถ้ามี)</small>{asset ? <b>{asset.code} · {asset.type}</b> : <span className="muted">ไม่เกี่ยวกับเครื่อง · แตะเพื่อเลือก/สแกน</span>}</span>
            {asset ? <span className="m-x" role="button" aria-label="ล้างรหัสเครื่อง" onClick={(e) => { e.stopPropagation(); setAssetCode('') }}><X size={16} /></span> : <ChevronRight size={18} className="muted" />}
          </button>
        </section>

        {/* 2. งานอะไร */}
        <section className={`m-card ${err('cat') || err('desc') ? 'bad' : ''}`}>
          <h3><span className="m-step">2</span>งานอะไร</h3>
          <div className="m-grid-cat">
            {data.categories.map((c) => (
              <button key={c.id} className="m-tile" aria-pressed={categoryId === c.id} onClick={() => { setCategoryId(c.id); if (c.id !== 'OTH') setRoutine(false) }}>
                {CAT_ICON[c.id] ?? <MoreHorizontal size={22} />}<span>{c.nameTh}</span>
              </button>
            ))}
          </div>
          {err('cat') && <p className="m-err">{err('cat')}</p>}
          {categoryId === 'OTH' && (
            <label className="m-check"><input type="checkbox" checked={routine} onChange={(e) => setRoutine(e.target.checked)} />งานประจำ (วัด PM2.5 / อุณหภูมิ) ไม่นับเป็นงานซ่อม</label>
          )}
          <textarea className="m-input" rows={3} value={description} placeholder="เล่าสั้น ๆ ว่าทำอะไร เช่น แอร์ชั้น 5 ไม่เย็น ล้างคอยล์และเปลี่ยนฟิลเตอร์"
            onChange={(e) => { setDescription(e.target.value); setDismissAI(false) }} aria-label="รายละเอียดการซ่อม" />
          {err('desc') && <p className="m-err">{err('desc')}</p>}
          {hasSugg && (
            <div className="m-ai">
              <div className="m-ai-head"><Sparkles size={15} /><b>AI แนะนำ</b><button className="m-x" onClick={() => setDismissAI(true)} aria-label="ปิดคำแนะนำ"><X size={15} /></button></div>
              <ul>{sugg.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <button className="m-btn ai" onClick={applyAI}><Check size={16} />ใช้คำแนะนำ</button>
            </div>
          )}
        </section>

        {/* 3. อะไหล่ */}
        <section className={`m-card ${err('parts') ? 'bad' : ''}`}>
          <h3><span className="m-step">3</span>อะไหล่ที่เบิก</h3>
          <div className="m-seg">
            <button aria-pressed={!noParts} onClick={() => setNoParts(false)}>มีการใช้อะไหล่</button>
            <button aria-pressed={noParts} onClick={() => { setNoParts(true); setParts([]) }}>ไม่มีการใช้อะไหล่</button>
          </div>
          {!noParts && <>
            {parts.map((p) => {
              const part = findPart(data.parts, p.partCode)
              const onHand = part ? bal[building][part.code] ?? 0 : 0
              return (
                <div key={p.partCode} className="m-part">
                  <div className="m-part-main">
                    <b>{part?.name ?? p.partCode}</b>
                    <small>{p.partCode} · คงเหลือ {building} {onHand} {part?.unit}</small>
                    {part && p.qty > onHand && <small className="m-warn">เบิกเกินยอดคงเหลือ</small>}
                  </div>
                  <div className="m-stepper">
                    <button onClick={() => (p.qty === 1 ? setParts((ps) => ps.filter((x) => x.partCode !== p.partCode)) : setQty(p.partCode, (q) => q - 1))} aria-label={p.qty === 1 ? 'ลบ' : 'ลด'}>
                      {p.qty === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                    </button>
                    <span>{p.qty}</span>
                    <button onClick={() => setQty(p.partCode, (q) => q + 1)} aria-label="เพิ่ม"><Plus size={16} /></button>
                  </div>
                </div>
              )
            })}
            <button className="m-btn dashed" onClick={() => setSheet('part')}><Plus size={18} />เพิ่มอะไหล่</button>
          </>}
          {err('parts') && <p className="m-err">{err('parts')}</p>}
        </section>

        {/* 4. ใคร / สถานะ */}
        <section className={`m-card ${err('tech') || err('req') ? 'bad' : ''}`}>
          <h3><span className="m-step">4</span>ผู้รับผิดชอบ & สถานะ</h3>
          <small className="m-label">ช่าง</small>
          <div className="m-people">
            {techs.map((s) => (
              <button key={s.id} aria-pressed={technicianId === s.id} onClick={() => setTechnicianId(s.id)}>
                <span className="m-avatar">{s.name.slice(0, 1)}</span>{s.name}
              </button>
            ))}
          </div>
          {err('tech') && <p className="m-err">{err('tech')}</p>}
          <button className="m-row" onClick={() => setSheet('requester')}>
            <span className="m-row-ic"><User size={18} /></span>
            <span className="m-row-main"><small>ผู้แจ้งซ่อม</small>{requester ? <b>{requester.name}</b> : <span className="muted">แตะเพื่อเลือก</span>}</span>
            <ChevronRight size={18} className="muted" />
          </button>
          {err('req') && <p className="m-err">{err('req')}</p>}
          <label className="m-row">
            <span className="m-row-ic"><MapPin size={18} /></span>
            <span className="m-row-main"><small>วันที่ทำงาน</small><b>{thDate(workDate)}</b></span>
            <input type="date" className="m-date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} aria-label="วันที่ทำงาน" />
          </label>
          <small className="m-label">สถานะงาน</small>
          <div className="m-status">
            {STATUSES.map((s) => <button key={s} className={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>)}
          </div>
          {assetCode && status !== 'completed' && <p className="m-hint">เมื่อเป็น "เสร็จแล้ว" ระบบจะเพิ่มงานนี้ในประวัติเครื่อง {assetCode}</p>}
        </section>

        {existing && <button className="m-btn danger" onClick={remove}><Trash2 size={16} />ลบงานนี้</button>}
        <div style={{ height: 8 }} />
      </div>

      <footer className="m-footer">
        <button className="m-btn primary big" onClick={save}>
          <CheckCircle2 size={20} />{existing ? 'บันทึกการแก้ไข' : 'บันทึกงาน'}
        </button>
      </footer>

      {sheet === 'part' && (
        <PartSheet building={building} bal={bal} picked={parts.map((p) => p.partCode)} suggested={sugg.partCodes}
          onPick={(c) => { addPart(c); setSheet('') }} onClose={() => setSheet('')} />
      )}
      {sheet === 'asset' && (
        <Sheet title="เลือกเครื่อง" onClose={() => setSheet('')}>
          <div className="m-banner"><QrCode size={18} /><span>ในการใช้งานจริง สแกน QR ที่ติดตัวเครื่องได้เลย — ต้นแบบนี้ให้เลือกจากรายการ</span></div>
          <button className="m-list-item" onClick={() => { setAssetCode(''); setSheet('') }}><span className="m-row-main"><b>ไม่เกี่ยวกับเครื่อง</b></span></button>
          {(assetsHere.length ? assetsHere : Object.values(data.assets)).map((a) => (
            <button key={a.id} className="m-list-item" aria-pressed={assetCode === a.code} onClick={() => { setAssetCode(a.code); setSheet('') }}>
              <span className="m-row-main"><b>{a.code}</b><small>{a.type} · {a.location}</small></span>
              {assetCode === a.code && <Check size={18} />}
            </button>
          ))}
          {loc && assetsHere.length === 0 && <p className="m-hint">ไม่มีเครื่องที่ {loc.name} — แสดงทุกเครื่อง</p>}
        </Sheet>
      )}
      {sheet === 'requester' && (
        <Sheet title="ผู้แจ้งซ่อม" onClose={() => setSheet('')}>
          {data.staff.filter((s) => s.active).map((s) => (
            <button key={s.id} className="m-list-item" aria-pressed={requesterId === s.id} onClick={() => { setRequesterId(s.id); setSheet('') }}>
              <span className="m-avatar">{s.name.slice(0, 1)}</span>
              <span className="m-row-main"><b>{s.name}</b>{s.aliases.length > 0 && <small>{s.aliases.join(', ')}</small>}</span>
              {requesterId === s.id && <Check size={18} />}
            </button>
          ))}
        </Sheet>
      )}
      {sheet === 'job' && (
        <Sheet title="Job No." onClose={() => setSheet('')}>
          <input className="m-input big" inputMode="numeric" value={jobNo} onChange={(e) => setJobNo(e.target.value)} autoFocus aria-label="Job No." />
          <p className={errors.jobNo ? 'm-err' : 'm-hint'}>{errors.jobNo ?? (jobNo !== normJob ? `จะบันทึกเป็น ${normJob}` : 'รูปแบบ YY/NNN — พิมพ์แค่เลข เช่น 450 ได้')}</p>
          <button className="m-btn primary" onClick={() => setSheet('')}>ตกลง</button>
        </Sheet>
      )}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="m-sheet-back" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-grab" />
        <div className="m-sheet-head"><b>{title}</b><button className="m-icon" onClick={onClose} aria-label="ปิด"><X size={20} /></button></div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  )
}

function PartSheet({ building, bal, picked, suggested, onPick, onClose }: {
  building: Building; bal: ReturnType<typeof balances>; picked: string[]; suggested: string[]; onPick: (code: string) => void; onClose: () => void
}) {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const list = data.parts
    .filter((p) => p.active && (!ql || `${p.code} ${p.hqCode ?? ''} ${p.cscCode ?? ''} ${p.name}`.toLowerCase().includes(ql)))
    .sort((a, b) => Number(suggested.includes(b.code)) - Number(suggested.includes(a.code)))
  return (
    <Sheet title="เพิ่มอะไหล่" onClose={onClose}>
      <div className="m-search"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัสหรือชื่อ เช่น EE-55, หลอด" autoFocus aria-label="ค้นหาอะไหล่" /></div>
      {list.map((p) => {
        const onHand = bal[building][p.code] ?? 0
        return (
          <button key={p.code} className="m-list-item" onClick={() => onPick(p.code)}>
            <span className="m-row-ic"><Package size={18} /></span>
            <span className="m-row-main">
              <b>{p.name}</b>
              <small>{p.code} · Box {p.boxNo ?? '–'}{suggested.includes(p.code) ? ' · ' : ''}{suggested.includes(p.code) && <span className="m-ai-tag">AI แนะนำ</span>}</small>
            </span>
            <span className={`m-stock ${onHand === 0 ? 'zero' : onHand <= p.min ? 'low' : ''}`}>{onHand}<small>{p.unit}</small></span>
            {picked.includes(p.code) && <Check size={16} />}
          </button>
        )
      })}
      {!list.length && <p className="m-hint">ไม่พบอะไหล่ "{q}" ในรายการอะไหล่หลัก</p>}
    </Sheet>
  )
}

function SavedScreen({ wo, isNew }: { wo: WorkOrder; isNew: boolean }) {
  const { data } = useStore()
  const loc = data.locations.find((l) => l.id === wo.locationId)
  const items = [
    wo.parts.length ? `ตัดสต็อก ${wo.building}: ${wo.parts.map((p) => `${p.partCode} × ${p.qty}`).join(', ')}` : 'ไม่มีการเบิกอะไหล่',
    wo.assetCode && wo.status === 'completed' ? `เพิ่มในประวัติเครื่อง ${wo.assetCode}` : null,
    'ส่งการ์ดแจ้งเตือนเข้า Google Chat แล้ว',
  ].filter(Boolean) as string[]
  return (
    <div className="m-screen">
      <div className="m-body m-done">
        <div className="m-done-ic"><CheckCircle2 size={56} /></div>
        <h2>{isNew ? 'บันทึกงานแล้ว' : 'บันทึกการแก้ไขแล้ว'}</h2>
        <p className="m-done-job">{wo.jobNo}</p>
        <p className="muted">{wo.description}<br />{loc?.name} · {STATUS_LABEL[wo.status]}</p>
        <ul className="m-done-list">{items.map((t) => <li key={t}><Check size={16} />{t}</li>)}</ul>
      </div>
      <footer className="m-footer col">
        <button className="m-btn primary big" onClick={() => go(`/work-orders/new?n=${Date.now()}`)}><Plus size={20} />บันทึกงานถัดไป</button>
        <button className="m-btn" onClick={() => go('/work-orders')}>ดูรายการงาน</button>
      </footer>
    </div>
  )
}
