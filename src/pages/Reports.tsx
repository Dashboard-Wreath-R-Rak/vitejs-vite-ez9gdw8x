import { useMemo, useState } from 'react'
import { Copy, Download, Send } from 'lucide-react'
import { notify, useStore } from '../lib/store'
import { AIBadge, Bars, Card, Empty, PageHead } from '../components/ui'
import { AI_ENGINE, monthReport } from '../lib/ai'
import { TH_MONTHS_FULL, thDate, todayISO } from '../lib/format'
import { balances, STATUS_LABEL } from '../lib/rules'
import { metrics } from '../lib/equipment'

export default function Reports() {
  const { data, update, toast } = useStore()
  const months = useMemo(() => [...new Set(data.workOrders.map((w) => w.workDate.slice(0, 7)))].sort().reverse(), [data.workOrders])
  const [month, setMonth] = useState(months[0] ?? todayISO().slice(0, 7))
  const r = useMemo(() => monthReport(data, month), [data, month])
  const [y, m] = month.split('-').map(Number)
  const title = `สรุปงานซ่อมบำรุง ${TH_MONTHS_FULL[m - 1]} ${y}`
  const chatText = `*${title}*\n` + r.lines.map((l) => '• ' + l).join('\n')

  async function exportAll() {
    const XLSX = await import('xlsx')
    const staff = (id: string) => data.staff.find((s) => s.id === id)?.name ?? id
    const wb = XLSX.utils.book_new()
    // 1 แถวต่อ 1 รายการอะไหล่ (รูปแบบเดียวกับ Work Order Log เดิม)
    const woRows = r.wos.flatMap((w) => {
      const base = {
        'DATE': w.createdAt, 'วันที่': w.workDate, 'JOB NO.': w.jobNo, 'ผู้เบิก': staff(w.technicianId),
        'ประเภทงาน': data.categories.find((c) => c.id === w.categoryId)?.nameEn, 'ชั้น': data.locations.find((l) => l.id === w.locationId)?.floor,
        'รหัสเครื่อง': w.assetCode ?? '', 'รายละเอียดการซ่อม': w.description, 'ผู้แจ้งซ่อม': staff(w.requesterId), 'สถานะ': STATUS_LABEL[w.status], 'อาคาร': w.building,
      }
      return w.parts.length
        ? w.parts.map((p) => ({ ...base, 'รหัสอะไหล่': p.partCode, 'ชื่ออะไหล่': data.parts.find((x) => x.code === p.partCode)?.name ?? '', 'จำนวน': p.qty }))
        : [{ ...base, 'รหัสอะไหล่': '-', 'ชื่ออะไหล่': 'ไม่มีการใช้อะไหล่', 'จำนวน': 0 }]
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(woRows), 'WorkOrders')
    const bal = balances(data.parts, data.movements)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.parts.map((p) => ({ 'รหัส': p.code, 'HQ code': p.hqCode, 'CSC code': p.cscCode, 'ชื่อ': p.name, 'MIN': p.min, 'MAX': p.max, 'คงเหลือ HQ': bal.HQ[p.code], 'คงเหลือ CSC': bal.CSC[p.code] }))), 'Stock')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(data.assets).map((a) => { const mm = metrics(a); return { 'รหัส': a.code, 'ประเภท': a.type, 'สถานที่': a.location, 'อายุ': mm.age, 'สถานะ': mm.status, 'ค่าใช้จ่ายรวม': mm.cost, 'PM ถัดไป': mm.next } })), 'Assets')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.lines.map((l) => ({ 'สรุป': l }))), 'Summary')
    XLSX.writeFile(wb, `report-${month}.xlsx`)
  }

  return (
    <>
      <PageHead title="รายงานรายเดือน" sub="ตัวเลขทั้งหมดคำนวณจากข้อมูล · AI ทำหน้าที่เขียนสรุปเท่านั้น"
        actions={<>
          <select className="input" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="เดือน">
            {months.map((mo) => { const [yy, mm] = mo.split('-').map(Number); return <option key={mo} value={mo}>{TH_MONTHS_FULL[mm - 1]} {yy}</option> })}
          </select>
          <button className="btn" onClick={exportAll}><Download size={16} />ส่งออก Excel</button>
        </>} />

      <Card ai title={title} right={<AIBadge label={AI_ENGINE} />}>
        <ul className="ai-lines">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={() => { update((d) => notify(d, { kind: 'summary', title, body: r.lines.join(' · ') })); toast('ส่งสรุปเข้า Google Chat แล้ว (จำลอง)', 'ok') }}><Send size={15} />ส่งเข้า Google Chat</button>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(chatText).then(() => toast('คัดลอกแล้ว'), () => toast('คัดลอกไม่สำเร็จ', 'warn'))}><Copy size={15} />คัดลอกข้อความ</button>
        </div>
      </Card>

      <div className="grid g2">
        <Card title="งานซ่อมตามประเภท"><Bars rows={r.byCategory} /></Card>
        <Card title="งานซ่อมตามพื้นที่"><Bars rows={r.byFloor.slice(0, 8)} /></Card>
      </div>
      <div className="grid g3">
        <Card title="อะไหล่ที่ใช้มาก">
          {r.topParts.length === 0 ? <Empty>ไม่มีการเบิก</Empty> : (
            <table><tbody>{r.topParts.map((p) => <tr key={p.code}><td className="code">{p.code}</td><td>{p.part?.name}</td><td className="num">{p.qty} {p.part?.unit}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="เครื่องที่เสียซ้ำ (90 วัน)">
          {r.repeat.length === 0 ? <Empty>ไม่พบ</Empty> : (
            <table><tbody>{r.repeat.map((x) => <tr key={x.code}><td className="code"><a href={`#/assets/${encodeURIComponent(x.code)}`}>{x.code}</a></td><td className="num">{x.n} ครั้ง</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="สต็อกที่ต้องสั่ง">
          {r.reorder.length === 0 ? <Empty>ไม่มี</Empty> : (
            <table><tbody>{r.reorder.map((l) => <tr key={l.building + l.part.code}><td className="code">{l.part.code}</td><td>{l.building}</td><td className="num">สั่ง {l.orderQty}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      <Card title="PM ที่เลยกำหนด">
        {r.overduePM.length === 0 ? <Empty>ไม่มี</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>เครื่อง</th><th>สถานที่</th><th>กำหนด</th></tr></thead>
            <tbody>{r.overduePM.map((a) => <tr key={a.id}><td className="code">{a.code}</td><td>{a.location}</td><td>{thDate(metrics(a).next)}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </>
  )
}
