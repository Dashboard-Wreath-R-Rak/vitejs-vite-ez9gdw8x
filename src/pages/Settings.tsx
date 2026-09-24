import { useMemo, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { log, resetData, useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { Card, Empty, Field, PageHead, Tag } from '../components/ui'
import { dataIssues, normalizeJobNo, normalizePartCode } from '../lib/rules'
import { thDateTime } from '../lib/format'
import type { AppData } from '../lib/types'

const TABS = [
  ['quality', 'ตรวจคุณภาพข้อมูล'], ['parts', 'Parts'], ['locations', 'Locations'], ['staff', 'Staff'], ['categories', 'Categories'],
  ['vendors', 'Vendors'], ['rules', 'เกณฑ์ระบบ'], ['log', 'Log การแก้ไข'],
] as const

type ListKey = 'parts' | 'locations' | 'staff' | 'categories' | 'vendors'
interface Col { key: string; label: string; type?: 'num' | 'list' | 'select' | 'bool'; options?: string[]; readOnly?: boolean }

const COLS: Record<ListKey, Col[]> = {
  parts: [
    { key: 'code', label: 'รหัสกลาง', readOnly: true }, { key: 'hqCode', label: 'HQ' }, { key: 'cscCode', label: 'CSC' }, { key: 'name', label: 'ชื่อ' },
    { key: 'category', label: 'หมวด' }, { key: 'unit', label: 'หน่วย' }, { key: 'min', label: 'MIN', type: 'num' }, { key: 'max', label: 'MAX', type: 'num' },
    { key: 'boxNo', label: 'Box' }, { key: 'active', label: 'ใช้งาน', type: 'bool' },
  ],
  locations: [{ key: 'id', label: 'ID', readOnly: true }, { key: 'building', label: 'อาคาร', type: 'select', options: ['HQ', 'CSC'] }, { key: 'floor', label: 'ชั้น' }, { key: 'zone', label: 'โซน' }, { key: 'name', label: 'ชื่อพื้นที่' }],
  staff: [
    { key: 'id', label: 'ID', readOnly: true }, { key: 'name', label: 'ชื่อ' }, { key: 'aliases', label: 'ชื่ออื่นที่พบ (คั่นด้วย ,)', type: 'list' },
    { key: 'role', label: 'บทบาท', type: 'select', options: ['technician', 'requester', 'manager'] }, { key: 'active', label: 'ใช้งาน', type: 'bool' },
  ],
  categories: [{ key: 'id', label: 'ID', readOnly: true }, { key: 'nameTh', label: 'ชื่อไทย' }, { key: 'nameEn', label: 'ชื่ออังกฤษ' }],
  vendors: [
    { key: 'id', label: 'ID', readOnly: true }, { key: 'name', label: 'ชื่อ' }, { key: 'role', label: 'บทบาท', type: 'select', options: ['dealer', 'installer', 'contractor', 'supplier'] },
    { key: 'contact', label: 'ผู้ติดต่อ' }, { key: 'phone', label: 'โทร' }, { key: 'email', label: 'อีเมล' },
  ],
}

export default function Settings({ route }: { route: Route }) {
  const [tab, setTab] = useState(route.query.get('tab') ?? 'quality')
  return (
    <>
      <PageHead title="Master Data & ตั้งค่า" sub="ข้อมูลหลักที่ใช้ร่วมกันทั้งระบบ · ทุกการแก้ไขมี log" />
      <div className="chips">{TABS.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'quality' && <Quality />}
      {tab in COLS && <MasterTable key={tab} list={tab as ListKey} />}
      {tab === 'rules' && <Rules />}
      {tab === 'log' && <LogView />}
    </>
  )
}

function Quality() {
  const { data, update, user, toast } = useStore()
  const issues = useMemo(() => dataIssues(data), [data])
  const fixable = data.workOrders.some((w) => w.jobNo !== normalizeJobNo(w.jobNo) || w.parts.some((p) => p.partCode !== normalizePartCode(p.partCode)))
  return (
    <Card title={`พบ ${issues.length} ประเด็น`} right={fixable && (
      <button className="btn" onClick={() => {
        if (!confirm('ปรับรูปแบบ Job No. และรหัสอะไหล่ให้เป็นมาตรฐาน? (ไม่ลบข้อมูล ค่าเดิมเก็บใน log)')) return
        update((d) => d.workOrders.forEach((w) => {
          const nj = normalizeJobNo(w.jobNo)
          if (nj !== w.jobNo) { log(d, user, 'Normalize Job No.', `${w.jobNo} → ${nj}`); w.jobNo = nj }
          w.parts.forEach((p) => { const np = normalizePartCode(p.partCode); if (np !== p.partCode) { log(d, user, 'Normalize รหัสอะไหล่', `${w.jobNo}: ${p.partCode} → ${np}`); p.partCode = np } })
        }))
        toast('ปรับรูปแบบแล้ว — ดูค่าเดิมได้ใน Log', 'ok')
      }}>ปรับรูปแบบให้เป็นมาตรฐาน</button>
    )}>
      <p className="small muted" style={{ marginBottom: 10 }}>ระบบรายงานให้คนตรวจก่อน ไม่ลบข้อมูลเอง — รายการซ้ำให้ตรวจแล้วลบที่หน้า Work Order</p>
      {issues.length === 0 ? <Empty>ข้อมูลเรียบร้อย</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>ประเภท</th><th>อ้างอิง</th><th>รายละเอียด</th></tr></thead>
          <tbody>{issues.map((i, k) => (
            <tr key={k}><td><Tag tone={i.tone}>{i.kind}</Tag></td>
              <td className="code">{/^\d/.test(i.ref) ? <a href={`#/work-orders?`} onClick={(e) => { e.preventDefault(); window.location.hash = `/work-orders/edit/${encodeURIComponent(i.ref)}` }}>{i.ref}</a> : i.ref}</td>
              <td>{i.detail}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Card>
  )
}

function MasterTable({ list }: { list: ListKey }) {
  const { data, update, user, toast } = useStore()
  const cols = COLS[list]
  const rows = data[list] as unknown as Record<string, unknown>[]
  const [newId, setNewId] = useState('')

  function set(i: number, col: Col, raw: string | boolean) {
    const v = col.type === 'num' ? Number(raw) || 0 : col.type === 'list' ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : raw
    update((d) => {
      const row = (d[list] as unknown as Record<string, unknown>[])[i]
      log(d, user, `แก้ ${list}`, `${row[cols[0].key]}.${col.key}: ${JSON.stringify(row[col.key] ?? '')} → ${JSON.stringify(v)}`)
      row[col.key] = v
    })
  }

  function add() {
    const id = list === 'parts' ? normalizePartCode(newId) : newId.trim()
    if (!id) return
    if (rows.some((r) => r[cols[0].key] === id)) { toast('มีรหัสนี้แล้ว', 'warn'); return }
    const blank: Record<ListKey, Record<string, unknown>> = {
      parts: { code: id, name: id, category: '', unit: 'ชิ้น', min: 0, max: 0, active: true },
      locations: { id, building: 'HQ', floor: '', name: id },
      staff: { id, name: id, aliases: [], role: 'technician', active: true },
      categories: { id, nameTh: id, nameEn: id },
      vendors: { id, name: id, role: 'supplier' },
    }
    update((d) => { (d[list] as unknown as Record<string, unknown>[]).push(blank[list]); log(d, user, `เพิ่ม ${list}`, id) })
    setNewId('')
  }

  return (
    <Card title={`${list} (${rows.length})`} right={
      <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); add() }}>
        <input className="input" style={{ width: 150 }} placeholder={cols[0].label + ' ใหม่'} value={newId} onChange={(e) => setNewId(e.target.value)} />
        <button className="btn sm" type="submit" disabled={!newId.trim()}><Plus size={14} />เพิ่ม</button>
      </form>}>
      <div className="table-wrap"><table>
        <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r[cols[0].key])}>
              {cols.map((c) => {
                const v = r[c.key]
                if (c.readOnly) return <td key={c.key} className="code">{String(v)}</td>
                if (c.type === 'bool') return <td key={c.key}><input type="checkbox" checked={!!v} onChange={(e) => set(i, c, e.target.checked)} aria-label={c.label} /></td>
                if (c.type === 'select') return <td key={c.key}><select className="input" style={{ padding: '4px 6px', fontSize: 13 }} value={String(v ?? '')} onChange={(e) => set(i, c, e.target.value)} aria-label={c.label}>{c.options!.map((o) => <option key={o}>{o}</option>)}</select></td>
                const shown = Array.isArray(v) ? v.join(', ') : String(v ?? '')
                const bad = list === 'parts' && (c.key === 'min' || c.key === 'max') && Number(r.min) > Number(r.max)
                return (
                  <td key={c.key}>
                    <input className={`input ${bad ? 'invalid' : ''}`} style={{ padding: '4px 8px', fontSize: 13, minWidth: c.type === 'num' ? 60 : 110 }} defaultValue={shown} aria-label={c.label}
                      onBlur={(e) => { if (e.target.value !== shown) set(i, c, e.target.value) }} />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table></div>
    </Card>
  )
}

function Rules() {
  const { data, update, user, toast } = useStore()
  const s = data.settings
  const num = (k: keyof AppData['settings'], label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <input className="input" inputMode="numeric" defaultValue={s[k]} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== s[k]) update((d) => { log(d, user, 'แก้เกณฑ์', `${k}: ${d.settings[k]} → ${v}`); d.settings[k] = v }) }} />
    </Field>
  )
  return (
    <>
      <Card title="เกณฑ์ระบบ">
        <div className="form-grid">
          {num('offerThresholdPct', 'Offer: ราคาต่ำกว่า ≥ (%)', 'แสดงการ์ด Offer เมื่อพบราคาต่ำกว่าเกณฑ์นี้')}
          {num('priceWindowMonths', 'อายุราคาอ้างอิง (เดือน)', 'ใช้ราคาในช่วงนี้เป็นราคาอ้างอิง')}
          {num('replaceCostPct', 'Repair-or-Replace: ค่าซ่อม 3 ปี > (% ราคาใหม่)', 'ค่า X ที่ทีมกำหนด')}
          {num('pmWarnDays', 'เตือน PM ล่วงหน้า (วัน)', 'สีเหลืองใน PM Calendar')}
        </div>
      </Card>
      <Card title="ข้อมูลตัวอย่าง">
        <p className="small muted" style={{ marginBottom: 10 }}>ต้นแบบนี้เก็บข้อมูลใน localStorage ของเบราว์เซอร์ · ข้อมูลตัวอย่างสร้างขึ้นเพื่อทดลองเท่านั้น</p>
        <button className="btn danger" onClick={() => {
          if (!confirm('ล้างข้อมูลทั้งหมดและโหลดข้อมูลตัวอย่างใหม่?')) return
          const fresh = resetData()
          update((d) => { Object.assign(d, fresh) })
          toast('โหลดข้อมูลตัวอย่างใหม่แล้ว')
        }}><RotateCcw size={15} />รีเซ็ตเป็นข้อมูลตัวอย่าง</button>
      </Card>
    </>
  )
}

function LogView() {
  const { data } = useStore()
  return (
    <Card title="Log การแก้ไข">
      {data.log.length === 0 ? <Empty>ยังไม่มีการแก้ไข</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th></tr></thead>
          <tbody>{data.log.map((l) => <tr key={l.id}><td className="nowrap small">{thDateTime(l.at)}</td><td>{l.who}</td><td>{l.action}</td><td className="small">{l.detail}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}
