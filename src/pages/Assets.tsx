import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Download, Factory, ListChecks, Printer, Sparkles, Trash2, Upload, Wallet } from 'lucide-react'
import { log, upsertAssets, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { assetFormUrl, go } from '../lib/router'
import { AIBadge, Card, Empty, Field, PageHead, Stat, Tag } from '../components/ui'
import { QR } from '../components/QR'
import {
  EV_CATS, batchCountsOf, batchKeys, costTotals, evKey, metrics, parseWorkbooks, replaceSignal, type AssetMetrics,
} from '../lib/equipment'
import { suggestEventCategory } from '../lib/ai'
import { balances } from '../lib/rules'
import { fmt, thDate, todayISO } from '../lib/format'
import type { Asset } from '../lib/types'

export default function Assets({ route }: { route: Route }) {
  const id = route.parts[1]
  return id ? <AssetDetail id={id} /> : <AssetList route={route} />
}

function AssetList({ route }: { route: Route }) {
  const { data, update, user, toast } = useStore()
  const [type, setType] = useState('')
  const [status, setStatus] = useState(route.query.get('status') ?? '')
  const [sort, setSort] = useState('code')
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<{ assets: Asset[]; problems: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => Object.values(data.assets), [data.assets])
  const bk = useMemo(() => batchKeys(all), [all])
  const bc = useMemo(() => batchCountsOf(all), [all])
  const rows = useMemo(() => all.map((a) => ({ a, m: metrics(a, bk, bc) })), [all, bk, bc])
  const totals = useMemo(() => costTotals(all, bk), [all, bk])
  const types = [...new Set(all.map((a) => a.type))].sort()
  const t = todayISO()

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const cmp: Record<string, (x: { a: Asset; m: AssetMetrics }, y: { a: Asset; m: AssetMetrics }) => number> = {
      code: (x, y) => x.a.code.localeCompare(y.a.code, undefined, { numeric: true }),
      cost: (x, y) => y.m.cost - x.m.cost,
      age: (x, y) => (y.m.age ?? -1) - (x.m.age ?? -1),
      count: (x, y) => y.m.count - x.m.count,
    }
    return rows
      .filter((x) => !type || x.a.type === type)
      .filter((x) => !status || x.m.status === status)
      .filter(({ a }) => !ql || `${a.code} ${a.name} ${a.location} ${a.belt} ${a.bearing} ${a.events.map((e) => e.item).join(' ')}`.toLowerCase().includes(ql))
      .sort(cmp[sort])
  }, [rows, type, status, q, sort])

  async function handleFiles(files: File[]) {
    const xl = files.filter((f) => /\.xls[xm]?$/i.test(f.name))
    if (!xl.length) { toast('รองรับเฉพาะไฟล์ Excel (.xlsx, .xls)', 'warn'); return }
    setBusy(true)
    const res = await parseWorkbooks(xl)
    setBusy(false)
    if (!res.assets.length) { toast('ไม่พบใบประวัติเครื่องจักร — แต่ละชีตต้องมีหัวตาราง "ครั้งที่"', 'warn'); return }
    setPending(res)
  }

  function savePending() {
    if (!pending) return
    update((d) => upsertAssets(d, pending.assets, user))
    toast(`บันทึก ${pending.assets.length} เครื่องเข้าทะเบียนแล้ว`, 'ok')
    setPending(null)
  }

  async function exportXlsx() {
    const XLSX = await import('xlsx')
    const assets = rows.map(({ a, m }) => ({
      'รหัส': a.code, 'ชื่อเครื่อง': a.name, 'ประเภท': a.type, 'สถานที่': a.location, 'ปีติดตั้ง': a.installedYear, 'งานใหญ่ล่าสุด': m.base,
      'อายุ (ปี)': m.age, 'อายุใช้งานต่ำสุด': a.lifeMin, 'อายุใช้งานสูงสุด': a.lifeMax, 'สถานะ': m.status, 'จำนวนครั้ง': m.count, 'ค่าใช้จ่ายรวม': m.cost,
      'ค่าซ่อม 3 ปี (แบ่งราคาล็อต)': Math.round(m.cost3y), 'ครั้งล่าสุด': m.last, 'เปลี่ยนไส้กรองครั้งถัดไป': m.next, 'สายพาน': a.belt, 'ลูกปืน': a.bearing,
      'ตัวแทนจำหน่าย': a.vendor, 'ผู้ติดตั้ง': a.installer, 'แหล่งข้อมูล': a.source,
    }))
    const events: Record<string, unknown>[] = []
    all.forEach((a) => a.events.forEach((e) => events.push({
      'รหัสเครื่อง': a.code, 'ครั้งที่': e.no, 'วันที่': e.date, 'แก้ปีจากไฟล์เดิม': e.fixed ? 'ใช่' : '', 'วันที่ในไฟล์เดิม': e.originalDate ?? '', 'รายการ': e.item,
      'หมวด': e.category, 'ราคา': e.price, 'อาจเป็นราคาล็อต': bk.has(evKey(e)) ? 'ใช่' : '', 'ซ่อมโดย': e.by, 'Job No.': e.jobNo ?? '',
      'รับประกันเริ่ม': e.wStart, 'รับประกันสิ้นสุด': e.wEnd,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assets), 'Assets')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(events), 'Maintenance_Events')
    XLSX.writeFile(wb, `equipment-register-${t}.xlsx`)
  }

  const pv = pending && {
    ev: pending.assets.reduce((s, a) => s + a.events.length, 0),
    fixed: pending.assets.reduce((s, a) => s + a.events.filter((e) => e.fixed).length, 0),
    other: pending.assets.reduce((s, a) => s + a.events.filter((e) => e.category === 'อื่นๆ').length, 0),
    dup: pending.assets.filter((a) => data.assets[a.id]).length,
    types: Object.entries(pending.assets.reduce<Record<string, number>>((m, a) => ((m[a.type] = (m[a.type] || 0) + 1), m), {})),
  }

  return (
    <>
      <PageHead title="ทะเบียนเครื่องจักร" sub="อัปโหลดใบประวัติ (Excel) ระบบจะแยกเครื่อง จัดหมวด และแก้ปีที่ผิดให้อัตโนมัติ"
        actions={<>
          <button className="btn" onClick={exportXlsx} disabled={!all.length}><Download size={16} />ดาวน์โหลด Excel</button>
          <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload size={16} />อัปโหลดใบประวัติ</button>
        </>} />
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" multiple hidden onChange={(e) => { if (e.target.files?.length) handleFiles([...e.target.files]); e.target.value = '' }} />
      <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0} onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles([...e.dataTransfer.files]) }}>
        <b style={{ color: 'var(--ink)' }}>{busy ? 'กำลังอ่านไฟล์…' : 'ลากไฟล์ Excel มาวางที่นี่'}</b> หรือคลิกเพื่อเลือก<br />
        <span className="small">รองรับใบประวัติแบบ 1 ชีตต่อ 1 เครื่อง อัปโหลดได้หลายไฟล์พร้อมกัน</span>
      </div>

      {pending && pv && (
        <Card title={`พบ ${pending.assets.length} เครื่อง รวม ${fmt(pv.ev)} รายการ`}>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
            <li>ประเภท: {pv.types.map(([k, n]) => `${k} ${n} เครื่อง`).join(', ')}</li>
            <li>แก้ปีที่บันทึกผิด (ปฏิทินพุทธศักราช) อัตโนมัติ {fmt(pv.fixed)} รายการ — เก็บค่าเดิมไว้ตรวจย้อนหลังได้</li>
            <li>รายการที่ยังจัดหมวดไม่ได้ {fmt(pv.other)} รายการ {pv.other ? '(ใช้ปุ่ม AI หรือเลือกหมวดเองได้หลังบันทึก)' : ''}</li>
            {pv.dup > 0 && <li>มี {pv.dup} เครื่องที่อยู่ในทะเบียนแล้ว ข้อมูลใบประวัติจะถูกแทนที่ (งานจาก Work Order ยังอยู่)</li>}
            {pending.problems.length > 0 && <li className="muted">ข้ามชีตที่ไม่ใช่ใบประวัติ {pending.problems.length} ชีต: {pending.problems.slice(0, 6).join(', ')}{pending.problems.length > 6 ? ' …' : ''}</li>}
          </ul>
          <div className="row"><button className="btn primary" onClick={savePending}>บันทึกเข้าทะเบียน</button><button className="btn" onClick={() => setPending(null)}>ยกเลิก</button></div>
        </Card>
      )}

      <div className="stats">
        <Stat icon={<Factory size={18} />} tone="primary" label="เครื่องในทะเบียน" value={fmt(all.length)} />
        <Stat icon={<AlertTriangle size={18} />} tone="danger" label="เกินอายุใช้งาน" value={fmt(rows.filter((r) => r.m.status === 'เกินอายุ').length)} href="#/assets?status=เกินอายุ" />
        <Stat icon={<ListChecks size={18} />} tone="info" label="รายการซ่อม/เปลี่ยนอะไหล่" value={fmt(all.reduce((s, a) => s + a.events.length, 0))} />
        <Stat icon={<Wallet size={18} />} tone="warn" small={`ตามบันทึก ${fmt(totals.total)} บาท`} label="ค่าใช้จ่ายหลังตัดราคาล็อตซ้ำ" value={fmt(totals.dedup)} />
      </div>

      <Card>
        <div className="stack">
          <div className="chips" role="group" aria-label="ประเภทเครื่อง">
            {[['', 'ทั้งหมด'], ...types.map((x) => [x, x])].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={type === v} onClick={() => setType(v)}>{l}{v ? ` (${all.filter((a) => a.type === v).length})` : ''}</button>
            ))}
          </div>
          <div className="toolbar">
            <input className="input search" type="search" placeholder="ค้นหารหัส สถานที่ อะไหล่ หรือรายการซ่อม" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะอายุ">
              <option value="">ทุกสถานะอายุ</option><option>เกินอายุ</option><option>ใกล้ครบอายุ</option><option>ปกติ</option><option>ไม่ทราบ</option>
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="เรียงลำดับ">
              <option value="code">เรียงตามรหัส</option><option value="cost">ค่าใช้จ่ายสูงสุด</option><option value="age">อายุมากสุด</option><option value="count">ซ่อมบ่อยสุด</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>รหัส</th><th>ประเภท</th><th>สถานที่</th><th className="num">อายุ (นับจากงานใหญ่)</th><th>สถานะ</th>
              <th className="num">ครั้ง</th><th className="num">ค่าใช้จ่ายรวม</th><th>ครั้งล่าสุด</th><th>เปลี่ยนไส้กรองถัดไป</th>
            </tr></thead>
            <tbody>
              {list.map(({ a, m }) => {
                const sig = replaceSignal(a, m, data.settings.replaceCostPct)
                return (
                  <tr key={a.id} className="click" tabIndex={0} onClick={() => go(`/assets/${encodeURIComponent(a.id)}`)} onKeyDown={(e) => { if (e.key === 'Enter') go(`/assets/${encodeURIComponent(a.id)}`) }}>
                    <td className="code">{a.code}</td>
                    <td>{a.type}</td>
                    <td>{a.location || '–'}</td>
                    <td className="num">{m.age != null ? `${m.age} ปี` : '–'}{m.base && <span className="muted small"> ({m.base})</span>}</td>
                    <td><Tag tone={m.tone}>{m.status}</Tag>{sig?.level === 'replace' && <div style={{ marginTop: 4 }}><Tag tone="danger">ควรพิจารณาเปลี่ยน</Tag></div>}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{fmt(m.cost)}</td>
                    <td className="nowrap">{thDate(m.last)}</td>
                    <td className="nowrap">{m.next ? <>{thDate(m.next)} {m.next < t && <Tag tone="danger">เลยกำหนด</Tag>}</> : <span className="muted">–</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!all.length && <Empty>ยังไม่มีเครื่องในทะเบียน อัปโหลดไฟล์ใบประวัติเพื่อเริ่มต้น</Empty>}
          {all.length > 0 && !list.length && <Empty>ไม่พบเครื่องที่ตรงกับเงื่อนไข</Empty>}
        </div>
      </Card>
    </>
  )
}

function AssetDetail({ id }: { id: string }) {
  const { data, update, user, toast } = useStore()
  const a = data.assets[id]
  const all = useMemo(() => Object.values(data.assets), [data.assets])
  const bk = useMemo(() => batchKeys(all), [all])
  const bc = useMemo(() => batchCountsOf(all), [all])
  const bal = useMemo(() => balances(data.parts, data.movements), [data.parts, data.movements])
  if (!a) return <Card><Empty>ไม่พบเครื่อง {id} · <a href="#/assets">กลับทะเบียน</a></Empty></Card>
  const m = metrics(a, bk, bc)
  const sig = replaceSignal(a, m, data.settings.replaceCostPct)
  const byCat: Record<string, number> = {}
  a.events.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + (e.price || 0) })
  const otherIdx = a.events.map((e, i) => ({ e, i, s: e.category === 'อื่นๆ' ? suggestEventCategory(e.item) : null })).filter((x) => x.s)
  const woHistory = data.workOrders.filter((w) => w.assetCode === a.code)

  const bom: { role: string; label: string; spec: string }[] = [
    { role: 'belt', label: 'สายพาน', spec: a.belt },
    { role: 'bearing', label: 'ลูกปืน', spec: a.bearing },
    { role: 'filter', label: 'ไส้กรอง', spec: '' },
  ].filter((b) => b.spec || a.bomLinks?.[b.role])

  const edit = (fn: (x: Asset) => void, msg?: string) => update((d) => { fn(d.assets[id]); d.assets[id].updatedAt = new Date().toISOString(); if (msg) log(d, user, 'แก้ไขเครื่อง', `${a.code}: ${msg}`) })

  return (
    <>
      <div className="row"><a className="btn ghost" href="#/assets"><ArrowLeft size={16} />ทะเบียนเครื่องจักร</a></div>
      <Card>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h1>{a.code} <span className="muted" style={{ fontWeight: 400, fontSize: 16 }}>{a.name}</span></h1>
            <div className="row"><Tag tone={m.tone}>{m.status}</Tag>{m.age != null && <span className="small muted">อายุ {m.age} ปี นับจาก {m.base}</span>}</div>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            <QR text={assetFormUrl(a.code)} />
            <div className="stack" style={{ gap: 6 }}>
              <a className="btn primary sm" href={`#/work-orders/new?asset=${encodeURIComponent(a.code)}`}>บันทึกงานของเครื่องนี้</a>
              <button className="btn sm" onClick={() => window.print()}><Printer size={14} />พิมพ์ QR</button>
            </div>
          </div>
        </div>
        <div className="kv" style={{ marginTop: 16 }}>
          <div><span>สถานที่</span>{a.location || '–'}</div>
          <div><span>ปีติดตั้ง / งานใหญ่ล่าสุด</span>{a.installedYear || '–'} / {m.base && m.base !== a.installedYear ? m.base : '–'}</div>
          <div><span>อายุใช้งานที่กำหนด</span>{a.lifeMin ? `${a.lifeMin}${a.lifeMax !== a.lifeMin ? '–' + a.lifeMax : ''} ปี` : '–'}</div>
          <div><span>ตัวแทนจำหน่าย</span>{a.vendor || '–'}</div>
          <div><span>ผู้ติดตั้ง</span>{a.installer || '–'}</div>
          <div><span>รอบเปลี่ยนไส้กรองโดยเฉลี่ย</span>{m.interval ? `${Math.round(m.interval / 30)} เดือน` : '–'} {m.next && <>· ถัดไป {thDate(m.next)}</>}</div>
          <div><span>ค่าใช้จ่ายรวม (ตามบันทึก)</span>{fmt(m.cost)} บาท</div>
          <div><span>ค่าซ่อม 3 ปีล่าสุด (แบ่งราคาล็อต)</span>{fmt(m.cost3y)} บาท</div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>ค่าใช้จ่ายตามหมวด: {Object.entries(byCat).filter(([, v]) => v).map(([k, v]) => `${k} ${fmt(v)}`).join(' | ') || 'ไม่มีข้อมูลราคา'}</p>
        {a.specs.length > 0 && <details style={{ marginTop: 10 }}><summary className="small">สเปกเครื่อง ({a.specs.length} รายการ)</summary><div className="small muted" style={{ columns: '2 240px', marginTop: 8 }}>{a.specs.map((s) => <div key={s}>{s}</div>)}</div></details>}
      </Card>

      <div className="grid g2">
        <Card title="อะไหล่ประจำเครื่อง (BOM) · เช็กสต็อก">
          {bom.length === 0 ? <Empty>ใบประวัติไม่ได้ระบุ Belt / Bearing</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>ส่วน</th><th>สเปก</th><th>รหัสสต็อก</th><th className="num">HQ</th><th className="num">CSC</th></tr></thead>
              <tbody>
                {bom.map((b) => {
                  const code = a.bomLinks?.[b.role] ?? ''
                  const part = data.parts.find((p) => p.code === code)
                  const guess = !code && b.spec ? data.parts.find((p) => p.name.toUpperCase().includes(b.spec.toUpperCase())) : undefined
                  return (
                    <tr key={b.role}>
                      <td>{b.label}</td>
                      <td>{b.spec || '–'}</td>
                      <td>
                        <select className="input" style={{ padding: '4px 6px', fontSize: 13 }} value={code} aria-label={`รหัสสต็อก ${b.label}`}
                          onChange={(e) => edit((x) => { x.bomLinks = { ...(x.bomLinks ?? {}), [b.role]: e.target.value } }, `ผูก BOM ${b.label} → ${e.target.value}`)}>
                          <option value="">— ยังไม่ผูก —</option>
                          {data.parts.map((p) => <option key={p.code} value={p.code}>{p.code} {p.name}</option>)}
                        </select>
                        {guess && <div className="row" style={{ marginTop: 4, gap: 6 }}><AIBadge /><button className="btn ai sm" onClick={() => edit((x) => { x.bomLinks = { ...(x.bomLinks ?? {}), [b.role]: guess.code } }, `ผูก BOM ${b.label} → ${guess.code}`)}>ผูกกับ {guess.code}</button></div>}
                      </td>
                      <td className="num">{part ? <Tag tone={bal.HQ[part.code] <= part.min ? (bal.HQ[part.code] === 0 ? 'danger' : 'warn') : 'ok'}>{bal.HQ[part.code]}</Tag> : '–'}</td>
                      <td className="num">{part ? bal.CSC[part.code] : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </Card>
        <Card title="Repair or Replace">
          <div className="stack">
            <Field label="ราคาเครื่องใหม่โดยประมาณ (บาท)" hint={`เกณฑ์: เกินอายุ และค่าซ่อม 3 ปีล่าสุด > ${data.settings.replaceCostPct}% ของราคาเครื่องใหม่ (ปรับได้ที่ Master Data)`}>
              <input className="input" inputMode="numeric" defaultValue={a.newPrice ?? ''} onBlur={(e) => { const v = +e.target.value.replace(/[^\d.]/g, '') || undefined; if (v !== a.newPrice) edit((x) => { x.newPrice = v }, `ราคาเครื่องใหม่ ${v ?? '-'}`) }} />
            </Field>
            {!sig && <div className="notice ok">ยังไม่เกินอายุใช้งาน — ซ่อมบำรุงตามปกติ</div>}
            {sig?.level === 'check' && <div className="notice warn">เกินอายุแล้ว — ระบุราคาเครื่องใหม่เพื่อคำนวณความคุ้มค่า</div>}
            {sig?.level === 'watch' && <div className="notice warn">เกินอายุ แต่ค่าซ่อม 3 ปี = {sig.ratio!.toFixed(1)}% ของราคาใหม่ — เฝ้าระวัง</div>}
            {sig?.level === 'replace' && <div className="notice danger">ควรพิจารณาเปลี่ยนเครื่อง: เกินอายุ {m.age! - (a.lifeMax ?? 0)} ปี และค่าซ่อม 3 ปี {fmt(m.cost3y)} บาท = {sig.ratio!.toFixed(1)}% ของราคาเครื่องใหม่</div>}
          </div>
        </Card>
      </div>

      <Card title={`ประวัติซ่อมบำรุง (${a.events.length} รายการ)`} right={otherIdx.length > 0 && (
        <button className="btn ai sm" onClick={() => { edit((x) => otherIdx.forEach(({ i, s }) => { x.events[i].category = s!; x.events[i].categoryByAI = true }), `AI จัดหมวด ${otherIdx.length} รายการ`); toast(`AI จัดหมวดให้ ${otherIdx.length} รายการ — ตรวจสอบได้ในตาราง`) }}>
          <Sparkles size={14} />ให้ AI จัดหมวด {otherIdx.length} รายการ
        </button>
      )}>
        <div className="table-wrap"><table>
          <thead><tr><th>ครั้งที่</th><th>วันที่</th><th>รายการ</th><th>หมวด</th><th className="num">ราคา (บาท)</th><th>ซ่อมโดย</th><th>รับประกันถึง</th></tr></thead>
          <tbody>
            {[...a.events].map((e, i) => ({ e, i })).sort((x, y) => ((x.e.date ?? '') < (y.e.date ?? '') ? 1 : -1)).map(({ e, i }) => (
              <tr key={i}>
                <td>{e.no ?? ''}</td>
                <td className="nowrap">{thDate(e.date)}{e.fixed && <div><Tag tone="info" title={`ในไฟล์เดิม: ${e.originalDate ?? '?'} — ระบบแก้ปีให้แล้ว`}>แก้ปี</Tag></div>}</td>
                <td>{e.item}{e.jobNo && <div className="small"><a href={`#/work-orders/edit/${encodeURIComponent(e.jobNo)}`}>จาก Work Order {e.jobNo}</a></div>}</td>
                <td>
                  <select className="input" style={{ padding: '4px 6px', fontSize: 13, width: 'auto' }} value={e.category} aria-label="หมวดของรายการ"
                    onChange={(ev) => edit((x) => { x.events[i].category = ev.target.value; x.events[i].categoryByAI = false }, `หมวด "${e.item}" → ${ev.target.value}`)}>
                    {EV_CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {e.categoryByAI && <div className="row" style={{ gap: 4, marginTop: 4 }}><AIBadge /><button className="btn sm" onClick={() => edit((x) => { x.events[i].categoryByAI = false }, `ยืนยันหมวด "${e.item}"`)}>ยืนยัน</button></div>}
                </td>
                <td className="num">{e.price ? fmt(e.price) : '–'}{bk.has(evKey(e)) && <div><Tag tone="warn" title={`ราคาเดียวกัน วันเดียวกัน พบใน ${bc[evKey(e)]} เครื่อง อาจเป็นราคารวมทั้งล็อต`}>ราคาล็อต? ÷{bc[evKey(e)]}</Tag></div>}</td>
                <td>{e.by || '–'}</td>
                <td className="nowrap">{thDate(e.wEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {woHistory.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Work Order ที่อ้างถึงเครื่องนี้: {woHistory.map((w) => w.jobNo).join(', ')}</p>}
        <p className="small muted" style={{ marginTop: 6 }}>แหล่งข้อมูล: {a.source} · อัปเดต {thDate(a.updatedAt.slice(0, 10))}</p>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn danger" onClick={() => {
            if (!confirm(`ลบ ${a.code} และประวัติทั้งหมดออกจากทะเบียน?`)) return
            update((d) => { delete d.assets[id]; log(d, user, 'ลบเครื่อง', a.code) })
            go('/assets')
          }}><Trash2 size={15} />ลบเครื่องนี้ออกจากทะเบียน</button>
        </div>
      </Card>
    </>
  )
}
