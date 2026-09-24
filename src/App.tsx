import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, BatteryFull, Signal, Wifi, Bell, Boxes, CalendarDays, ClipboardList, Cog, FileBarChart, LayoutDashboard, Menu, MessageSquareText, Moon,
  Scale, Sparkles, Sun, Tags, Wrench, Factory,
} from 'lucide-react'
import { loadData, saveData, StoreContext, type StoreValue } from './lib/store'
import type { AppData } from './lib/types'
import { useRoute } from './lib/router'
import { lowStock } from './lib/rules'
import { pmDue } from './lib/ai'
import { thDateTime } from './lib/format'
import { QR } from './components/QR'
import Dashboard from './pages/Dashboard'
import WorkOrders from './pages/WorkOrders'
import WorkOrderForm from './pages/WorkOrderForm'
import Assets from './pages/Assets'
import PMCalendar from './pages/PMCalendar'
import Inventory from './pages/Inventory'
import Prices from './pages/Prices'
import Compare from './pages/Compare'
import Reports from './pages/Reports'
import AskAI from './pages/AskAI'
import Settings from './pages/Settings'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/work-orders', label: 'Work Orders', icon: ClipboardList },
  { to: '/assets', label: 'เครื่องจักร (Assets)', icon: Factory },
  { to: '/pm', label: 'PM Calendar', icon: CalendarDays },
  { to: '/inventory', label: 'สต็อกอะไหล่', icon: Boxes },
  { to: '/compare', label: 'เปรียบเทียบราคา', icon: Scale },
  { to: '/prices', label: 'ราคา & Vendor', icon: Tags },
  { to: '/reports', label: 'รายงาน', icon: FileBarChart },
  { to: '/ask', label: 'ถาม AI', icon: Sparkles, ai: true },
  { to: '/settings', label: 'Master Data', icon: Cog },
]

type Theme = 'auto' | 'light' | 'dark'
const getTheme = (): Theme => { try { return (localStorage.getItem('theme') as Theme) || 'auto' } catch { return 'auto' } }

export default function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [user, setUserState] = useState(() => { try { return localStorage.getItem('user') || 'กิตติ' } catch { return 'กิตติ' } })
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone?: string }[]>([])
  const [navOpen, setNavOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme)
  const route = useRoute()
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveData(data) }, [data])
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* ignore */ }
  }, [theme])
  const [lastPath, setLastPath] = useState(route.path)
  if (lastPath !== route.path) { setLastPath(route.path); setNavOpen(false); setBellOpen(false) }
  useEffect(() => {
    const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const update = useCallback((fn: (d: AppData) => void) => {
    setData((prev) => { const next = structuredClone(prev); fn(next); return next })
  }, [])
  const toast = useCallback((msg: string, tone?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])
  const setUser = (u: string) => { setUserState(u); try { localStorage.setItem('user', u) } catch { /* ignore */ } }

  const store: StoreValue = useMemo(() => ({ data, update, user, setUser, toast }), [data, update, user, toast])

  const counts = useMemo(() => ({
    '/work-orders': data.workOrders.filter((w) => w.status === 'open').length,
    '/inventory': lowStock(data).length,
    '/pm': pmDue(data).filter((x) => x.overdue).length,
  }) as Record<string, number>, [data])
  const unread = data.notifications.filter((n) => !n.read).length

  const [section, sub] = route.parts
  let page
  switch (section) {
    case 'work-orders': page = sub === 'new' || sub === 'edit' ? <WorkOrderForm key={route.path + route.query} route={route} /> : <WorkOrders route={route} />; break
    case 'assets': page = <Assets route={route} />; break
    case 'pm': page = <PMCalendar />; break
    case 'inventory': page = <Inventory route={route} />; break
    case 'compare': page = <Compare route={route} />; break
    case 'prices': page = <Prices route={route} />; break
    case 'reports': page = <Reports />; break
    case 'ask': page = <AskAI />; break
    case 'settings': page = <Settings route={route} />; break
    default: page = <Dashboard />
  }
  const phoneMode = section === 'work-orders' && (sub === 'new' || sub === 'edit')
  const staffNames = data.staff.filter((s) => s.active && s.role !== 'requester').map((s) => s.name)

  return (
    <StoreContext.Provider value={store}>
      {phoneMode ? (
        <div className="m-stage">
          <aside className="m-stage-side">
            <a className="btn" href="#/dashboard"><ArrowLeft size={16} />กลับหน้าหลัก</a>
            <h2>ฟอร์มบันทึกงานของช่าง</h2>
            <p className="muted small">หน้าจอนี้ออกแบบสำหรับมือถือ ใช้มือเดียวได้ · บนคอมพิวเตอร์จะแสดงเป็นจำลองโทรศัพท์</p>
            <QR text={window.location.href} size={120} />
            <p className="muted small">สแกนเพื่อเปิดหน้านี้บนมือถือ (เมื่อระบบอยู่บนเซิร์ฟเวอร์จริง)</p>
          </aside>
          <div className="m-phone">
            <div className="m-statusbar" aria-hidden="true"><b>{new Date().toTimeString().slice(0, 5)}</b><span className="m-notch" /><span><Signal size={14} /><Wifi size={14} /><BatteryFull size={16} /></span></div>
            {page}
          </div>
        </div>
      ) : (
      <div className="app">
        <div className={`backdrop ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />
        <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="เมนูหลัก">
          <div className="brand">
            <div className="brand-mark"><Wrench size={20} /></div>
            <div><b>FM Assist</b><span>Building Facilities</span></div>
          </div>
          <nav className="nav">
            {NAV.map((n) => {
              const active = '/' + (section || 'dashboard') === n.to
              const c = counts[n.to]
              return (
                <a key={n.to} href={'#' + n.to} className={`${active ? 'active' : ''} ${n.ai ? 'ai-link' : ''}`} aria-current={active ? 'page' : undefined}>
                  <span className="ic"><n.icon size={17} /></span>
                  {n.label}
                  {c ? <span className="badge-count">{c}</span> : null}
                </a>
              )
            })}
          </nav>
          <div className="sidebar-foot">ต้นแบบ (Prototype) · ข้อมูลเก็บในเบราว์เซอร์นี้</div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setNavOpen(true)} aria-label="เปิดเมนู"><Menu size={20} /></button>
            <div className="avatar">{user.slice(0, 1)}</div>
            <select className="input" style={{ width: 'auto', border: 0, padding: '6px 4px' }} value={user} onChange={(e) => setUser(e.target.value)} aria-label="ผู้ใช้งาน">
              {staffNames.map((n) => <option key={n}>{n}</option>)}
            </select>
            <div className="spacer" />
            <a className="btn primary sm hide-sm" href="#/work-orders/new"><ClipboardList size={15} />บันทึกงาน</a>
            <div style={{ position: 'relative' }} ref={bellRef}>
              <button className="icon-btn" aria-label="การแจ้งเตือน Google Chat" onClick={() => {
                setBellOpen((o) => !o)
                if (!bellOpen && unread) update((d) => d.notifications.forEach((n) => (n.read = true)))
              }}>
                <Bell size={19} />
                {unread ? <span className="dot">{unread}</span> : null}
              </button>
              {bellOpen && (
                <div className="popover">
                  <div className="row between" style={{ padding: '6px 8px 10px' }}>
                    <b>Google Chat · Work Order & Spare Parts</b>
                  </div>
                  {data.notifications.length === 0 && <div className="empty small">ยังไม่มีการแจ้งเตือน<br />บันทึกงานหรือรับเข้า/เบิกอะไหล่ ระบบจะส่งการ์ดมาที่นี่</div>}
                  {data.notifications.slice(0, 30).map((n) => (
                    <div className="notif" key={n.id}>
                      <div className="chat-ic"><MessageSquareText size={16} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                        <div className="small">{n.body}</div>
                        <div className="small muted">{thDateTime(n.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="icon-btn" aria-label="สลับโหมดสี" title={theme === 'auto' ? 'ตามระบบ' : theme === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง'}
              onClick={() => setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')}>
              {theme === 'dark' ? <Moon size={19} /> : theme === 'light' ? <Sun size={19} /> : <Sun size={19} style={{ opacity: .6 }} />}
            </button>
          </header>
          <main className="content">{page}</main>
        </div>
      </div>
      )}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`}>{t.msg}</div>)}
      </div>
    </StoreContext.Provider>
  )
}
