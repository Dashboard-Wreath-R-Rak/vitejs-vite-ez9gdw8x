import { useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store'
import { AIBadge, Card, PageHead } from '../components/ui'
import { AI_ENGINE, askAI, type AskAnswer } from '../lib/ai'

const EXAMPLES = ['เครื่องไหนใช้สายพาน B-76', 'ปีนี้ AHU ชั้น 15 ใช้เงินเท่าไร', 'เครื่องไหนควรเปลี่ยน', 'อะไหล่อะไรต้องสั่ง', 'PM เลยกำหนดมีอะไรบ้าง', 'งานค้างมีอะไรบ้าง']

export default function AskAI() {
  const { data } = useStore()
  const [q, setQ] = useState('')
  const [chat, setChat] = useState<{ q: string; a: AskAnswer }[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  function ask(text: string) {
    if (!text.trim()) return
    setChat((c) => [...c, { q: text, a: askAI(text, data) }])
    setQ('')
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  return (
    <>
      <PageHead title="ถาม AI" sub="ถามเป็นภาษาคนเกี่ยวกับเครื่องจักร ค่าใช้จ่าย สต็อก และ PM" />
      <Card ai title="ผู้ช่วย" right={<AIBadge label={AI_ENGINE} />}>
        <div className="stack">
          {chat.length === 0 && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="muted small">ลองถาม:</p>
              <div className="chips">{EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => ask(e)}>{e}</button>)}</div>
            </div>
          )}
          {chat.map((c, i) => (
            <div key={i} className="stack" style={{ gap: 8 }}>
              <div className="chat-bubble me">{c.q}</div>
              <div className="chat-bubble bot">
                <div className="row" style={{ marginBottom: 6 }}><Sparkles size={15} color="var(--ai)" /><b>{c.a.text}</b></div>
                {c.a.rows && c.a.rows.length > 0 && (
                  <div className="table-wrap" style={{ margin: 0, padding: 0 }}><table>
                    <thead><tr>{c.a.head!.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{c.a.rows.slice(0, 30).map((r, j) => <tr key={j}>{r.map((x, k) => <td key={k} className={k === 0 ? 'code' : ''}>{x}</td>)}</tr>)}</tbody>
                  </table></div>
                )}
                {c.a.link && <a className="small" href={c.a.link}>เปิดหน้ารายการ →</a>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); ask(q) }}>
            <input className="input" placeholder="พิมพ์คำถาม…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="คำถาม" />
            <button className="btn primary" type="submit" disabled={!q.trim()}><Send size={16} />ถาม</button>
          </form>
          <p className="small muted">คำตอบคำนวณจากข้อมูลในระบบ · เวอร์ชันนี้ไม่ส่งข้อมูลออกภายนอก (รอการอนุมัติ LLM จากบริษัท)</p>
        </div>
      </Card>
    </>
  )
}
