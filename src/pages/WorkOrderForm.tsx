import { useMemo, useState } from 'react'
import { Minus, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import { saveWorkOrder, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { go } from '../lib/router'
import { AIBadge, Card, Field, PageHead, Tag } from '../components/ui'
import { STATUS_LABEL, balances, findPart, isValidJobNo, nextJobNo, normalizeJobNo, normalizePartCode } from '../lib/rules'
import { suggestWorkOrder } from '../lib/ai'
import { todayISO } from '../lib/format'
import type { Building, WOPart, WOStatus, WorkOrder } from '../lib/types'

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
  const [partPick, setPartPick] = useState('')
  const [tried, setTried] = useState(false)
  const [dismissAI, setDismissAI] = useState(false)

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

  const errors: Record<string, string> = {}
  if (!isValidJobNo(normJob)) errors.jobNo = 'รูปแบบต้องเป็น YY/NNN เช่น 26/450'
  else if (dupJob) errors.jobNo = `Job ${normJob} มีอยู่แล้ว — ตรวจว่าบันทึกซ้ำหรือไม่`
  if (!technicianId) errors.tech = 'เลือกช่างผู้รับผิดชอบ'
  if (!requesterId) errors.req = 'เลือกผู้แจ้งซ่อม'
  if (!locationId) errors.loc = 'เลือกสถานที่'
  if (!categoryId) errors.cat = 'เลือกประเภทงาน'
  if (description.trim().length < 3) errors.desc = 'กรอกรายละเอียดงาน'
  if (!noParts && parts.length === 0) errors.parts = 'เพิ่มอะไหล่ หรือติ๊ก "ไม่มีการใช้อะไหล่"'
  parts.forEach((p) => { if (!findPart(data.parts, p.partCode)) errors.parts = `ไม่พบรหัส ${p.partCode} ใน Parts master` })

  function addPart(code: string, qty = 1) {
    const c = normalizePartCode(code)
    const part = findPart(data.parts, c)
    if (!part) { toast(`ไม่พบรหัส ${c}`, 'warn'); return }
    setNoParts(false)
    setParts((ps) => ps.find((p) => p.partCode === part.code) ? ps.map((p) => (p.partCode === part.code ? { ...p, qty: p.qty + qty } : p)) : [...ps, { partCode: part.code, qty }])
    setPartPick('')
  }

  function applyAI() {
    if (sugg.categoryId) setCategoryId(sugg.categoryId)
    if (sugg.locationId) { setLocationId(sugg.locationId); setBuilding(data.locations.find((l) => l.id === sugg.locationId)!.building) }
    if (sugg.assetCode) setAssetCode(sugg.assetCode)
    setRoutine(sugg.routine)
    sugg.partCodes.forEach((p) => { if (!parts.find((x) => x.partCode === p)) addPart(p) })
  }

  function save() {
    setTried(true)
    if (Object.keys(errors).length) { toast('กรุณาตรวจข้อมูลที่ไฮไลต์', 'warn'); return }
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
    toast(`บันทึก ${wo.jobNo} แล้ว · ส่งการ์ดเข้า Google Chat`, 'ok')
    go('/work-orders')
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

  const err = (k: string) => (tried ? errors[k] : undefined)
  const requesters = data.staff.filter((s) => s.active)
  const techs = data.staff.filter((s) => s.active && s.role === 'technician')

  return (
    <>
      <PageHead title={existing ? `แก้ไข ${existing.jobNo}` : 'บันทึกงาน (HQ / CSC WORK ORDER)'} sub={assetFromQR ? `เปิดจาก QR ของเครื่อง ${assetFromQR.code}` : 'กรอกหลังทำงานเสร็จ ระบบจะตัดสต็อกและเพิ่มประวัติเครื่องให้อัตโนมัติ'} />
      <Card>
        <div className="form-grid">
          <Field label="อาคาร" full>
            <div className="seg" role="group" aria-label="อาคาร">
              {(['HQ', 'CSC'] as Building[]).map((b) => (
                <button key={b} type="button" aria-pressed={building === b} onClick={() => { setBuilding(b); if (loc && loc.building !== b) setLocationId('') }}>{b}</button>
              ))}
            </div>
          </Field>
          <Field label="Job No." error={err('jobNo') ?? (dupJob ? errors.jobNo : undefined)} hint={jobNo !== normJob && isValidJobNo(normJob) ? `จะบันทึกเป็น ${normJob}` : 'รูปแบบ YY/NNN'}>
            <input className={`input ${(tried && errors.jobNo) || dupJob ? 'invalid' : ''}`} value={jobNo} onChange={(e) => setJobNo(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="วันที่ทำงาน">
            <input className="input" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </Field>
          <Field label="ช่าง / ผู้รับผิดชอบ" error={err('tech')}>
            <select className="input" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">— เลือก —</option>
              {techs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="ผู้แจ้งซ่อม" error={err('req')}>
            <select className="input" value={requesterId} onChange={(e) => setRequesterId(e.target.value)}>
              <option value="">— เลือก —</option>
              {requesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="สถานที่ / จุดบริการ" error={err('loc')}>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— เลือก —</option>
              {data.locations.filter((l) => l.building === building).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="รหัสเครื่อง (ถ้ามี)" hint="ไม่บังคับ — ใช้เมื่องานเกี่ยวกับเครื่องจักร เพื่อบันทึกเข้าใบประวัติ">
            <select className="input" value={assetCode} onChange={(e) => setAssetCode(e.target.value)}>
              <option value="">— ไม่เกี่ยวกับเครื่อง —</option>
              {(assetsHere.length ? assetsHere : Object.values(data.assets)).map((a) => <option key={a.id} value={a.code}>{a.code} · {a.type} · {a.location}</option>)}
            </select>
          </Field>
          <Field label="ประเภทงาน" full error={err('cat')}>
            <div className="chips">
              {data.categories.map((c) => (
                <button key={c.id} type="button" className="chip" style={{ padding: '8px 14px', fontSize: 14 }} aria-pressed={categoryId === c.id} onClick={() => { setCategoryId(c.id); setRoutine(c.id === 'OTH' ? routine : false) }}>{c.nameEn}</button>
              ))}
            </div>
            {categoryId === 'OTH' && <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={routine} onChange={(e) => setRoutine(e.target.checked)} />เป็นงานประจำ (เช่น วัด PM2.5/อุณหภูมิ) — ไม่นับเป็นงานซ่อม</label>}
          </Field>
          <Field label="รายละเอียดการซ่อม" full error={err('desc')}>
            <textarea className="input" value={description} onChange={(e) => { setDescription(e.target.value); setDismissAI(false) }} placeholder="เช่น แอร์ชั้น 5 ไม่เย็น ล้างคอยล์และเปลี่ยนฟิลเตอร์" />
          </Field>
          {hasSugg && (
            <div className="suggest full">
              <div className="row between"><AIBadge /><button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setDismissAI(true)} aria-label="ปิดคำแนะนำ"><X size={15} /></button></div>
              <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{sugg.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <div className="row"><button className="btn ai sm" onClick={applyAI}><Sparkles size={14} />ใช้คำแนะนำ</button><span className="small muted">ตรวจสอบก่อนบันทึกทุกครั้ง</span></div>
            </div>
          )}
          <Field label="อะไหล่ที่ใช้" full error={err('parts')}>
            <label className="check"><input type="checkbox" checked={noParts} onChange={(e) => { setNoParts(e.target.checked); if (e.target.checked) setParts([]) }} />ไม่มีการใช้อะไหล่</label>
            {!noParts && (
              <div className="stack" style={{ gap: 8, marginTop: 6 }}>
                {parts.map((p) => {
                  const part = findPart(data.parts, p.partCode)
                  const onHand = part ? bal[building][part.code] ?? 0 : 0
                  return (
                    <div key={p.partCode} className="row" style={{ background: 'var(--panel-2)', borderRadius: 10, padding: '8px 10px', flexWrap: 'nowrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="code">{p.partCode}</div>
                        <div className="small muted">{part?.name ?? 'ไม่พบใน master'} · คงเหลือ {building} {onHand} {part?.unit}</div>
                        {part && p.qty > onHand && <Tag tone="danger">เบิกเกินยอดคงเหลือ</Tag>}
                      </div>
                      <button className="icon-btn" onClick={() => setParts((ps) => ps.map((x) => (x.partCode === p.partCode ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))} aria-label="ลด"><Minus size={16} /></button>
                      <input className="input" style={{ width: 56, textAlign: 'center' }} inputMode="numeric" value={p.qty} aria-label={`จำนวน ${p.partCode}`}
                        onChange={(e) => { const n = Math.max(1, parseInt(e.target.value) || 1); setParts((ps) => ps.map((x) => (x.partCode === p.partCode ? { ...x, qty: n } : x))) }} />
                      <button className="icon-btn" onClick={() => setParts((ps) => ps.map((x) => (x.partCode === p.partCode ? { ...x, qty: x.qty + 1 } : x)))} aria-label="เพิ่ม"><Plus size={16} /></button>
                      <button className="icon-btn" onClick={() => setParts((ps) => ps.filter((x) => x.partCode !== p.partCode))} aria-label="ลบ"><Trash2 size={16} /></button>
                    </div>
                  )
                })}
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" list="part-list" placeholder="พิมพ์รหัสหรือชื่ออะไหล่ เช่น EE-55" value={partPick} onChange={(e) => setPartPick(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && partPick) { e.preventDefault(); addPart(partPick.split(' ')[0]) } }} />
                  <datalist id="part-list">{data.parts.filter((p) => p.active).map((p) => <option key={p.code} value={`${p.code} ${p.name}`} />)}</datalist>
                  <button className="btn" disabled={!partPick} onClick={() => addPart(partPick.split(' ')[0])}><Plus size={16} />เพิ่ม</button>
                </div>
              </div>
            )}
          </Field>
          <Field label="สถานะงาน" full>
            <div className="status-pick" role="group">
              {(['open', 'in_process', 'completed', 'suspended'] as WOStatus[]).map((s) => (
                <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            {assetCode && status !== 'completed' && <span className="hint">เมื่อเปลี่ยนเป็น "เสร็จแล้ว" ระบบจะเพิ่มงานนี้ในประวัติเครื่อง {assetCode}</span>}
          </Field>
        </div>
        <div className="sticky-actions">
          <button className="btn primary lg" style={{ flex: 1 }} onClick={save}><Save size={18} />บันทึก</button>
          {existing && <button className="btn danger lg" onClick={remove} aria-label="ลบงาน"><Trash2 size={18} /></button>}
          <a className="btn lg" href="#/work-orders">ยกเลิก</a>
        </div>
      </Card>
    </>
  )
}
