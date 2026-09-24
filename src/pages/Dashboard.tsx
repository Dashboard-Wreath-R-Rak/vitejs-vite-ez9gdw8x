import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, BadgeDollarSign, CalendarClock, CheckCircle2, ClipboardList, Hourglass, PackageX, PauseCircle, QrCode } from 'lucide-react'
import { useStore } from '../lib/store'
import { AIBadge, Card, Empty, Stat, Tag } from '../components/ui'
import { STATUS_LABEL, STATUS_TONE, isThisMonth, lowStock } from '../lib/rules'
import { metrics } from '../lib/equipment'
import { AI_ENGINE, pmDue, weeklySummary } from '../lib/ai'
import { addDays, fmt, greeting, thDate, todayISO } from '../lib/format'
import type { WOStatus } from '../lib/types'

const CAT_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']
const STATUS_COLORS: Record<WOStatus, string> = { open: 'var(--info)', in_process: 'var(--c2)', completed: 'var(--ok)', suspended: 'var(--danger)' }

export default function Dashboard() {
  const { data, user } = useStore()
  const t = todayISO()
  const wos = data.workOrders

  const s = useMemo(() => {
    const assets = Object.values(data.assets)
    const pm = pmDue(data)
    const saving = data.challenges
      .filter((c) => c.finalPrice != null && isThisMonth(c.createdAt.slice(0, 10)))
      .reduce((sum, c) => sum + Math.max(0, c.currentPrice - (c.finalPrice ?? c.currentPrice)), 0)
    return {
      open: wos.filter((w) => w.status === 'open').length,
      inproc: wos.filter((w) => w.status === 'in_process').length,
      doneMonth: wos.filter((w) => w.status === 'completed' && isThisMonth(w.workDate)).length,
      susp: wos.filter((w) => w.status === 'suspended').length,
      low: lowStock(data),
      pmOver: pm.filter((x) => x.overdue).length,
      pmNext: pm.filter((x) => x.m.next! >= t && x.m.next! <= addDays(t, 7)).concat(pm.filter((x) => x.overdue)),
      overLife: assets.filter((a) => metrics(a).status === 'เกินอายุ').length,
      saving,
    }
  }, [data, wos, t])

  const daily = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13))
    return days.map((d) => {
      const row: Record<string, string | number> = { day: thDate(d).split(' ').slice(0, 2).join(' ') }
      data.categories.forEach((c) => { row[c.id] = wos.filter((w) => w.workDate === d && w.categoryId === c.id).length })
      return row
    })
  }, [data.categories, wos, t])

  const byStatus = (['open', 'in_process', 'completed', 'suspended'] as WOStatus[]).map((st) => ({ st, name: STATUS_LABEL[st], value: wos.filter((w) => w.status === st).length }))
  const total = wos.length || 1
  const summary = useMemo(() => weeklySummary(data), [data])
  const recent = [...wos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 10)
  const loc = (id: string) => data.locations.find((l) => l.id === id)?.name ?? id
  const doneAll = wos.filter((w) => w.status === 'completed').length

  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid g-hero">
        <Card className="hero-card">
          <h1>{greeting()}, คุณ{user}</h1>
          <p className="muted">วันนี้ {thDate(t)} · งานที่ยังไม่เสร็จ {s.open + s.inproc} งาน · อะไหล่ที่ต้องสั่ง {s.low.length} รายการ</p>
          <div className="row" style={{ marginTop: 'auto' }}>
            <a className="btn primary lg" href="#/work-orders/new"><ClipboardList size={18} />บันทึกงานใหม่</a>
            <a className="btn lg" href="#/assets"><QrCode size={18} />QR เครื่องจักร</a>
          </div>
        </Card>
        <div className="stats">
          <Stat icon={<ClipboardList size={18} />} tone="primary" label="งานเปิดอยู่" value={s.open} href="#/work-orders?status=open" />
          <Stat icon={<Hourglass size={18} />} tone="info" label="กำลังทำ" value={s.inproc} href="#/work-orders?status=in_process" />
          <Stat icon={<CheckCircle2 size={18} />} tone="ok" small="เดือนนี้" label="เสร็จแล้ว" value={s.doneMonth} href="#/work-orders?status=completed" />
          <Stat icon={<PauseCircle size={18} />} tone="danger" label="ระงับ" value={s.susp} href="#/work-orders?status=suspended" />
          <Stat icon={<PackageX size={18} />} tone="danger" small="HQ + CSC" label="อะไหล่ต่ำกว่า MIN" value={s.low.length} href="#/inventory?filter=low" />
          <Stat icon={<CalendarClock size={18} />} tone="warn" small="ไส้กรอง/PM" label="PM เลยกำหนด" value={s.pmOver} href="#/pm" />
          <Stat icon={<AlertTriangle size={18} />} tone="warn" small="ทะเบียนเครื่อง" label="เครื่องเกินอายุ" value={s.overLife} href="#/assets?status=เกินอายุ" />
          <Stat icon={<BadgeDollarSign size={18} />} tone="ai" small="เดือนนี้ (บาท/หน่วย)" label="ประหยัดจาก Challenge" value={fmt(s.saving)} href="#/prices" />
        </div>
      </div>

      <Card ai title="AI สรุปสัปดาห์นี้" right={<AIBadge label={AI_ENGINE} />}>
        <ul className="ai-lines">
          {summary.map((l, i) => (
            <li key={i} className={l.tone}>
              <span>{l.text}{l.link && <> · <a href={l.link}>ดูรายการ</a></>}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid g2">
        <Card title="สัดส่วนงานตามสถานะ">
          <div className="row" style={{ alignItems: 'center', gap: 24 }}>
            <div className="legend" style={{ flex: '1 1 140px' }}>
              {byStatus.map((b) => (
                <div key={b.st}>
                  <b>{((b.value / total) * 100).toFixed(1)}%</b>
                  <span><i style={{ background: STATUS_COLORS[b.st] }} />{b.name} · {b.value} งาน</span>
                </div>
              ))}
            </div>
            <div style={{ flex: '1 1 200px', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" stroke="var(--panel)" strokeWidth={2} isAnimationActive={false}>
                    {byStatus.map((b) => <Cell key={b.st} fill={STATUS_COLORS[b.st]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)' }} formatter={(v) => [`${v} งาน`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}><b style={{ color: 'var(--ink)' }}>{doneAll}</b> งานเสร็จแล้วจากทั้งหมด {wos.length} งาน</p>
        </Card>
        <Card title="จำนวนงานรายวัน (14 วัน) แยกประเภท">
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--panel-2)' }} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.categories.map((c, i) => (
                  <Bar key={c.id} dataKey={c.id} name={c.nameTh} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]} stroke="var(--panel)" strokeWidth={1} maxBarSize={28} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid g3">
        <Card title="งานล่าสุด" right={<a className="small" href="#/work-orders">ทั้งหมด</a>}>
          <div className="table-wrap">
            <table>
              <tbody>
                {recent.map((w) => (
                  <tr key={w.jobNo + w.createdAt} className="click" onClick={() => (window.location.hash = `/work-orders/edit/${encodeURIComponent(w.jobNo)}`)}>
                    <td className="code">{w.jobNo}</td>
                    <td><div style={{ maxWidth: 220 }}>{w.description}</div><div className="small muted">{loc(w.locationId)}</div></td>
                    <td><Tag tone={STATUS_TONE[w.status]}>{STATUS_LABEL[w.status]}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="อะไหล่ที่ต้องสั่ง" right={<a className="small" href="#/inventory?filter=low">สต็อก</a>}>
          {s.low.length === 0 ? <Empty>สต็อกปกติทุกรายการ</Empty> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>อะไหล่</th><th>อาคาร</th><th className="num">คงเหลือ</th><th className="num">สั่ง</th></tr></thead>
                <tbody>
                  {s.low.slice(0, 10).map((l) => (
                    <tr key={l.building + l.part.code}>
                      <td><div className="code">{l.part.code}</div><div className="small muted">{l.part.name}</div></td>
                      <td>{l.building}</td>
                      <td className="num"><Tag tone={l.onHand === 0 ? 'danger' : 'warn'}>{l.onHand} / {l.part.min}</Tag></td>
                      <td className="num">{l.orderQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="PM 7 วันข้างหน้า / เลยกำหนด" right={<a className="small" href="#/pm">ปฏิทิน</a>}>
          {s.pmNext.length === 0 ? <Empty>ไม่มี PM ในช่วงนี้</Empty> : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {s.pmNext.map((x) => (
                    <tr key={x.a.id} className="click" onClick={() => (window.location.hash = `/assets/${encodeURIComponent(x.a.id)}`)}>
                      <td className="code">{x.a.code}</td>
                      <td className="small">เปลี่ยนไส้กรอง<div className="muted">{x.a.location}</div></td>
                      <td className="nowrap">{thDate(x.m.next)}<br />{x.overdue ? <Tag tone="danger">เลยกำหนด</Tag> : <Tag tone="warn">ใกล้ถึง</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
