import { useEffect, type ReactNode } from 'react'
import { Sparkles, X } from 'lucide-react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'ai' | 'neutral'

export function Card({ title, right, children, className = '', ai }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; ai?: boolean }) {
  return (
    <section className={`card ${ai ? 'ai-card' : ''} ${className}`}>
      {(title || right) && (
        <div className="card-title">
          {title && <h2>{title}</h2>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Tag({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span className={`tag ${tone}`} title={title}>{children}</span>
}

export function AIBadge({ label = 'AI แนะนำ' }: { label?: string }) {
  return <Tag tone="ai"><Sparkles size={12} />{label}</Tag>
}

export function Stat({ icon, tone, small = 'ทั้งหมด', label, value, href }: { icon: ReactNode; tone: string; small?: string; label: string; value: ReactNode; href?: string }) {
  const body = (
    <>
      <div className={`ico ${tone}`}>{icon}</div>
      <div>
        <small>{small}</small>
        <div className="label">{label}</div>
      </div>
      <b>{value}</b>
    </>
  )
  return href ? <a className="stat" href={href}>{body}</a> : <div className="stat">{body}</div>
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(100%, 760px)' } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, hint, error, full }: { label: string; children: ReactNode; hint?: ReactNode; error?: string; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Bars({ rows, max }: { rows: [string, number][]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r[1]))
  if (!rows.length) return <Empty>ไม่มีข้อมูล</Empty>
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>{k}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(v / m) * 100}%` }} /></div>
          <span className="num small">{v}</span>
        </div>
      ))}
    </div>
  )
}
