import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Award, Download, Gavel, PiggyBank, Scale, Store } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Route } from '../lib/router'
import { go } from '../lib/router'
import { Card, Empty, Field, PageHead, Stat, Tag } from '../components/ui'
import { effectiveUnit } from '../lib/rules'
import { addDays, fmt, thDate, todayISO } from '../lib/format'
import type { AppData, Part, PriceRecord } from '../lib/types'

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)']
const WINDOWS: [number, string][] = [[6, '6 เดือน'], [12, '12 เดือน'], [24, '24 เดือน'], [0, 'ทั้งหมด']]

interface VendorQuote {
  vendorId: string
  latest: PriceRecord
  unit: number // ราคาเทียบได้/หน่วย ของใบล่าสุด
  min: number
  max: number
  count: number
}

/** ใบเสนอราคาล่าสุดของแต่ละ Vendor ในช่วงเวลา → เรียงจากถูกไปแพง */
function vendorQuotes(data: AppData, partCode: string, since: string, qty?: number, withDelivery = true): VendorQuote[] {
  const recs = data.prices.filter((p) => p.partCode === partCode && p.date >= since)
  const by: Record<string, PriceRecord[]> = {}
  recs.forEach((r) => (by[r.vendorId] ||= []).push(r))
  return Object.entries(by).map(([vendorId, list]) => {
    const sorted = list.sort((a, b) => (a.date < b.date ? 1 : -1))
    const units = list.map((r) => effectiveUnit(r, qty ?? r.qty, withDelivery))
    return { vendorId, latest: sorted[0], unit: effectiveUnit(sorted[0], qty ?? sorted[0].qty, withDelivery), min: Math.min(...units), max: Math.max(...units), count: list.length }
  }).sort((a, b) => a.unit - b.unit)
}

/** ราคาที่ซื้อจริงครั้งล่าสุด (PO / ประวัติ) */
function lastPurchase(data: AppData, partCode: string) {
  return data.prices.filter((p) => p.partCode === partCode && p.source !== 'quote').sort((a, b) => (a.date < b.date ? 1 : -1))[0]
}

export default function Compare({ route }: { route: Route }) {
  const part = route.parts[1]
  return part ? <CompareDetail code={part} /> : <CompareList />
}

function useWindow() {
  const { data } = useStore()
  const [months, setMonths] = useState(data.settings.priceWindowMonths)
  const since = months ? addDays(todayISO(), -Math.round(months * 30.4)) : '0000'
  return { months, setMonths, since }
}

function WindowPicker({ months, setMonths }: { months: number; setMonths: (n: number) => void }) {
  return (
    <div className="seg" role="group" aria-label="ช่วงเวลาของราคา">
      {WINDOWS.map(([n, l]) => <button key={n} aria-pressed={months === n} onClick={() => setMonths(n)}>{l}</button>)}
    </div>
  )
}

function CompareList() {
  const { data } = useStore()
  const { months, setMonths, since } = useWindow()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [sort, setSort] = useState<'saving' | 'pct' | 'code'>('saving')
  const vName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? id

  const rows = useMemo(() => data.parts.map((p) => {
    const quotes = vendorQuotes(data, p.code, since)
    const best = quotes[0]
    const lp = lastPurchase(data, p.code)
    const lastUnit = lp ? effectiveUnit(lp) : null
    const perUnit = best && lastUnit != null ? Math.max(0, lastUnit - best.unit) : 0
    const orderQty = lp?.qty ?? p.max
    return { p, quotes, best, lp, lastUnit, perUnit, pct: lastUnit ? (perUnit / lastUnit) * 100 : 0, saving: perUnit * orderQty, orderQty }
  }), [data, since])

  const list = rows
    .filter((r) => !cat || r.p.category === cat)
    .filter((r) => !q || `${r.p.code} ${r.p.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (!a.best !== !b.best ? (a.best ? -1 : 1) : sort === 'code' ? a.p.code.localeCompare(b.p.code) : sort === 'pct' ? b.pct - a.pct : b.saving - a.saving))

  const priced = rows.filter((r) => r.best)
  const totalSaving = priced.reduce((s, r) => s + r.saving, 0)
  const cheaperCount = priced.filter((r) => r.perUnit > 0).length
  const winCount: Record<string, number> = {}
  priced.forEach((r) => { winCount[r.best!.vendorId] = (winCount[r.best!.vendorId] || 0) + 1 })
  const topVendor = Object.entries(winCount).sort((a, b) => b[1] - a[1])[0]
  const cats = [...new Set(data.parts.map((p) => p.category))]

  async function exportXlsx() {
    const XLSX = await import('xlsx')
    const out = list.filter((r) => r.best).map((r) => ({
      'รหัส': r.p.code, 'อะไหล่': r.p.name, 'หน่วย': r.p.unit, 'จำนวน Vendor': r.quotes.length,
      'ราคาต่ำสุด/หน่วย (รวม VAT+ขนส่ง)': +r.best!.unit.toFixed(2), 'Vendor ราคาต่ำสุด': vName(r.best!.vendorId), 'วันที่ราคา': r.best!.latest.date,
      'ซื้อล่าสุด/หน่วย': r.lastUnit != null ? +r.lastUnit.toFixed(2) : '', 'Vendor ที่ซื้อล่าสุด': r.lp ? vName(r.lp.vendorId) : '',
      'ถูกกว่า (%)': +r.pct.toFixed(1), 'ประหยัดได้ต่อล็อต (บาท)': Math.round(r.saving),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Price_Compare')
    XLSX.writeFile(wb, `price-compare-${todayISO()}.xlsx`)
  }

  return (
    <>
      <PageHead title="เปรียบเทียบราคา" sub="หาราคาต่ำสุดของอะไหล่แต่ละรายการจากทุก Vendor · ราคาปรับให้เทียบกันได้ (รวม VAT 7% + ค่าขนส่งเฉลี่ยต่อหน่วย)"
        actions={<><WindowPicker months={months} setMonths={setMonths} /><button className="btn" onClick={exportXlsx}><Download size={16} />Excel</button></>} />

      <div className="stats">
        <Stat icon={<Scale size={18} />} tone="primary" small={`ช่วง ${months ? months + ' เดือน' : 'ทั้งหมด'}`} label="อะไหล่ที่มีราคาเทียบ" value={`${priced.length}/${data.parts.length}`} />
        <Stat icon={<Award size={18} />} tone="ok" small="เทียบกับราคาที่ซื้อล่าสุด" label="มีราคาถูกกว่า" value={`${cheaperCount} รายการ`} />
        <Stat icon={<PiggyBank size={18} />} tone="ai" small="ถ้าสั่งล็อตถัดไปจากราคาต่ำสุด" label="ประหยัดได้ (บาท)" value={fmt(totalSaving)} />
        <Stat icon={<Store size={18} />} tone="info" small={topVendor ? `ถูกที่สุด ${topVendor[1]} รายการ` : ''} label="Vendor ราคาดีที่สุด" value={<span style={{ fontSize: 16 }}>{topVendor ? vName(topVendor[0]) : '–'}</span>} />
      </div>

      <Card>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input className="input search" type="search" placeholder="ค้นหารหัสหรือชื่ออะไหล่" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="หมวด">
            <option value="">ทุกหมวด</option>{cats.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="เรียงลำดับ">
            <option value="saving">ประหยัดได้มากสุด (บาท)</option><option value="pct">ถูกกว่ามากสุด (%)</option><option value="code">เรียงตามรหัส</option>
          </select>
        </div>
        <div className="table-wrap"><table>
          <thead><tr>
            <th>อะไหล่</th><th className="num">Vendor</th><th className="num">ราคาต่ำสุด/หน่วย</th><th>Vendor ราคาต่ำสุด</th>
            <th className="num hide-sm">ซื้อล่าสุด/หน่วย</th><th className="num">ถูกกว่า</th><th className="num hide-sm">ประหยัด/ล็อต</th>
          </tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.p.code} className={r.best ? 'click' : ''} tabIndex={r.best ? 0 : -1}
                onClick={() => r.best && go(`/compare/${encodeURIComponent(r.p.code)}`)} onKeyDown={(e) => { if (e.key === 'Enter' && r.best) go(`/compare/${encodeURIComponent(r.p.code)}`) }}>
                <td><div className="code">{r.p.code}</div><div className="small muted">{r.p.name}</div></td>
                <td className="num">{r.quotes.length || '–'}</td>
                {r.best ? <>
                  <td className="num"><b>{fmt(r.best.unit, 2)}</b><div className="small muted">/{r.p.unit}</div></td>
                  <td>{vName(r.best.vendorId)}<div className="small muted">{thDate(r.best.latest.date)} · {r.best.latest.source === 'quote' ? 'ใบเสนอราคา' : r.best.latest.source}</div></td>
                  <td className="num hide-sm">{r.lastUnit != null ? fmt(r.lastUnit, 2) : '–'}{r.lp && <div className="small muted">{thDate(r.lp.date)}</div>}</td>
                  <td className="num">{r.perUnit > 0 ? <Tag tone="ok">−{r.pct.toFixed(1)}%</Tag> : r.lp ? <Tag tone="neutral">ราคาดีแล้ว</Tag> : '–'}</td>
                  <td className="num hide-sm">{r.saving > 0 ? <b style={{ color: 'var(--ok)' }}>{fmt(r.saving)}</b> : '–'}{r.saving > 0 && <div className="small muted">{r.orderQty} {r.p.unit}</div>}</td>
                </> : <td colSpan={5} className="muted small">ยังไม่มีราคาในช่วงนี้</td>}
              </tr>
            ))}
          </tbody>
        </table></div>
        {!list.length && <Empty>ไม่พบอะไหล่</Empty>}
        <p className="small muted" style={{ marginTop: 10 }}>"ประหยัด/ล็อต" = (ราคาซื้อล่าสุด − ราคาต่ำสุด) × จำนวนที่ซื้อครั้งล่าสุด · กดที่แถวเพื่อเทียบรายละเอียดแต่ละ Vendor</p>
      </Card>
    </>
  )
}

function CompareDetail({ code }: { code: string }) {
  const { data } = useStore()
  const { months, setMonths, since } = useWindow()
  const part = data.parts.find((p) => p.code === code)
  const lp = lastPurchase(data, code)
  const [qty, setQty] = useState(String(lp?.qty ?? part?.max ?? 1))
  const [withDelivery, setWithDelivery] = useState(true)
  const n = Math.max(1, parseInt(qty) || 1)
  const quotes = useMemo(() => vendorQuotes(data, code, since, n, withDelivery), [data, code, since, n, withDelivery])
  const vName = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? id

  const chart = useMemo(() => {
    const recs = data.prices.filter((p) => p.partCode === code && p.date >= since).sort((a, b) => (a.date < b.date ? -1 : 1))
    const vendors = [...new Set(recs.map((r) => r.vendorId))].slice(0, SERIES.length)
    const points = recs.filter((r) => vendors.includes(r.vendorId)).map((r) => ({ t: new Date(r.date + 'T00:00:00').getTime(), [r.vendorId]: +effectiveUnit(r, n, withDelivery).toFixed(2) }))
    return { vendors, points }
  }, [data.prices, code, since, n, withDelivery])

  if (!part) return <Card><Empty>ไม่พบอะไหล่ {code} · <a href="#/compare">กลับ</a></Empty></Card>
  const best = quotes[0]
  const worst = quotes[quotes.length - 1]
  const lastUnit = lp ? effectiveUnit(lp, n, withDelivery) : null
  const maxWarranty = Math.max(0, ...quotes.map((x) => x.latest.warrantyMonths ?? 0))

  return (
    <>
      <div className="row"><a className="btn ghost" href="#/compare"><ArrowLeft size={16} />เปรียบเทียบราคาทั้งหมด</a></div>
      <PageHead title={`${part.code} · ${part.name}`} sub={`หน่วย: ${part.unit} · หมวด ${part.category} · เทียบ ${quotes.length} Vendor`} actions={<WindowPicker months={months} setMonths={setMonths} />} />

      <Card>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <Field label={`จำนวนที่จะสั่ง (${part.unit})`} hint="ค่าขนส่งจะเฉลี่ยตามจำนวนนี้">
            <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <label className="check" style={{ paddingBottom: 10 }}><input type="checkbox" checked={withDelivery} onChange={(e) => setWithDelivery(e.target.checked)} />รวมค่าขนส่งในการเทียบ</label>
        </div>
      </Card>

      {!best ? <Card><Empty>ยังไม่มีราคาในช่วงเวลานี้ — ลองเลือกช่วงที่ยาวขึ้น</Empty></Card> : <>
        <div className="grid g3">
          <Card>
            <div className="small muted">ราคาต่ำสุด / {part.unit}</div>
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>{fmt(best.unit, 2)} <span className="small muted">บาท</span></div>
            <div style={{ marginTop: 4 }}><Tag tone="ok"><Award size={12} />{vName(best.vendorId)}</Tag></div>
            <div className="small muted" style={{ marginTop: 4 }}>ราคาวันที่ {thDate(best.latest.date)}</div>
          </Card>
          <Card>
            <div className="small muted">รวม {n} {part.unit} ที่ราคาต่ำสุด</div>
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>{fmt(best.unit * n)} <span className="small muted">บาท</span></div>
            {worst !== best && <div className="small" style={{ marginTop: 6 }}>ถูกกว่าราคาสูงสุด <b style={{ color: 'var(--ok)' }}>{fmt((worst.unit - best.unit) * n)}</b> บาท</div>}
          </Card>
          <Card>
            <div className="small muted">เทียบกับที่ซื้อล่าสุด</div>
            {lastUnit != null && lp ? <>
              <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.2 }}>{fmt(lastUnit, 2)} <span className="small muted">บาท/{part.unit}</span></div>
              <div className="small muted">{vName(lp.vendorId)} · {thDate(lp.date)}</div>
              {lastUnit > best.unit
                ? <div className="small" style={{ marginTop: 6 }}>ถ้าเปลี่ยนเป็นราคาต่ำสุด ประหยัด <b style={{ color: 'var(--ok)' }}>{fmt((lastUnit - best.unit) * n)}</b> บาท ({(((lastUnit - best.unit) / lastUnit) * 100).toFixed(1)}%)</div>
                : <div className="small" style={{ marginTop: 6 }}><Tag tone="ok">ซื้อราคาต่ำสุดอยู่แล้ว</Tag></div>}
            </> : <div className="muted" style={{ marginTop: 8 }}>ยังไม่มีประวัติการซื้อ</div>}
          </Card>
        </div>

        <Card title="เปรียบเทียบแต่ละ Vendor (ใบล่าสุด)">
          <div className="table-wrap"><table>
            <thead><tr>
              <th>อันดับ</th><th>Vendor</th><th style={{ minWidth: 160 }}>ราคาเทียบได้/หน่วย</th><th className="num hide-sm">ราคาในใบ</th><th className="hide-sm">VAT / ขนส่ง</th>
              <th>รับประกัน</th><th className="num">รวม {n} {part.unit}</th><th className="num">แพงกว่าต่ำสุด</th><th className="hide-sm">วันที่</th>
            </tr></thead>
            <tbody>
              {quotes.map((x, i) => {
                const diff = x.unit - best.unit
                const w = x.latest.warrantyMonths ?? 0
                return (
                  <tr key={x.vendorId} className={i === 0 ? 'sel' : ''}>
                    <td className="num">{i === 0 ? <Tag tone="ok"><Award size={12} />ต่ำสุด</Tag> : i + 1}</td>
                    <td>{vName(x.vendorId)}{x.count > 1 && <div className="small muted">{x.count} ใบ · ช่วง {fmt(x.min, 2)}–{fmt(x.max, 2)}</div>}</td>
                    <td>
                      <b>{fmt(x.unit, 2)}</b>
                      <div className="bar-track" style={{ marginTop: 4 }}><div className="bar-fill" style={{ width: `${(x.unit / worst.unit) * 100}%`, background: i === 0 ? 'var(--ok)' : 'var(--primary)' }} /></div>
                    </td>
                    <td className="num hide-sm">{fmt(x.latest.unitPrice, 2)}</td>
                    <td className="small hide-sm">{x.latest.vatIncluded ? 'รวม VAT' : <Tag tone="warn">+VAT 7%</Tag>}{x.latest.deliveryCost ? <div>ส่ง {fmt(x.latest.deliveryCost)} บาท</div> : <div className="muted">ส่งฟรี</div>}</td>
                    <td className="nowrap">{w ? `${w} เดือน` : <span className="muted">–</span>}{i === 0 && w < maxWarranty && <div><Tag tone="warn" title="เทียบแบบเดียวกันจริง: ตรวจเงื่อนไขรับประกันก่อนตัดสินใจ">สั้นกว่า {maxWarranty - w} ด.</Tag></div>}</td>
                    <td className="num">{fmt(x.unit * n)}</td>
                    <td className="num">{diff > 0.005 ? <span style={{ color: 'var(--danger)' }}>+{fmt(diff * n)}<div className="small">+{((diff / best.unit) * 100).toFixed(1)}%</div></span> : '–'}</td>
                    <td className="nowrap small hide-sm">{thDate(x.latest.date)}<div className="muted">{x.latest.source === 'quote' ? 'ใบเสนอราคา' : x.latest.source}</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <p className="small muted" style={{ marginTop: 10 }}>ราคาเทียบได้ = ราคาในใบ (+VAT 7% ถ้ายังไม่รวม){withDelivery ? ' + ค่าขนส่ง ÷ จำนวนที่สั่ง' : ''} · ตรวจสเปก จำนวนขั้นต่ำ และเงื่อนไขรับประกันให้ตรงกันก่อนเปลี่ยน Vendor</p>
          <div className="row" style={{ marginTop: 12 }}>
            <a className="btn ai" href={`#/prices?part=${encodeURIComponent(code)}`}><Gavel size={15} />ขอ Challenge / บันทึกใบเสนอราคา</a>
          </div>
        </Card>

        {chart.points.length > 1 && (
          <Card title="แนวโน้มราคา (ราคาเทียบได้/หน่วย)">
            <div style={{ height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={chart.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => thDate(new Date(v).toISOString().slice(0, 10))}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} width={56} domain={['auto', 'auto']} />
                  <Tooltip labelFormatter={(v) => thDate(new Date(v as number).toISOString().slice(0, 10))} formatter={(v, name) => [`${fmt(v as number, 2)} บาท`, vName(String(name))]}
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', fontSize: 13 }} />
                  <Legend formatter={(v) => vName(String(v))} wrapperStyle={{ fontSize: 12 }} />
                  {chart.vendors.map((v, i) => (
                    <Line key={v} dataKey={v} name={v} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 4, fill: SERIES[i], stroke: 'var(--panel)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <Card title="ใบเสนอราคา / ประวัติทั้งหมด">
          <PriceTable data={data} part={part} since={since} n={n} withDelivery={withDelivery} vName={vName} />
        </Card>
      </>}
    </>
  )
}

function PriceTable({ data, part, since, n, withDelivery, vName }: { data: AppData; part: Part; since: string; n: number; withDelivery: boolean; vName: (id: string) => string }) {
  const recs = data.prices.filter((p) => p.partCode === part.code && p.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>วันที่</th><th>Vendor</th><th className="num">ราคาในใบ</th><th className="num">เทียบได้/หน่วย</th><th className="num">จำนวน</th><th>ที่มา</th></tr></thead>
      <tbody>{recs.map((r) => (
        <tr key={r.id}>
          <td className="nowrap">{thDate(r.date)}</td>
          <td>{vName(r.vendorId)}{r.decision && <div className="small muted">{r.decision}</div>}</td>
          <td className="num">{fmt(r.unitPrice, 2)}{!r.vatIncluded && <div className="small muted">ไม่รวม VAT</div>}</td>
          <td className="num">{fmt(effectiveUnit(r, n, withDelivery), 2)}</td>
          <td className="num">{r.qty}</td>
          <td><Tag>{r.source}</Tag></td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}
