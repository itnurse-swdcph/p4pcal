import { useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, LockKeyhole, Megaphone, Play, ThumbsDown, ThumbsUp, Users } from 'lucide-react'
import { dateTime, money, num, type UnitStat } from './utils'

type Props = {
  review: any
  votes: any[]
  roster: any[]
  currentUserId: string
  isMember: boolean
  activeCount: number
  units: UnitStat[]
  groups: any[]
  totals: any
  busy: boolean
  reviewGate?: boolean
  onStart: () => void
  onVote: (decision: 'approved' | 'rejected', comment: string) => Promise<boolean>
  onOpenUnit: (key: number) => void
}

const Step = ({ n, state, title, children }: { n: number; state: 'done' | 'active' | 'todo'; title: string; children?: ReactNode }) =>
  <li className="flex gap-3">
    <div className="flex flex-col items-center">
      <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ' + (state === 'done' ? 'bg-emerald-600 text-white' : state === 'active' ? 'bg-teal-700 text-white ring-4 ring-teal-100' : 'bg-stone-200 text-stone-600')}>
        {state === 'done' ? <CheckCircle2 size={18} /> : n}</span>
      <span className="mt-1 w-px flex-1 bg-stone-200" />
    </div>
    <div className="min-w-0 flex-1 pb-6"><h3 className={'font-semibold ' + (state === 'todo' ? 'text-stone-500' : 'text-stone-900')}>{title}</h3><div className="mt-2 space-y-2 text-sm">{children}</div></div>
  </li>

export default function ClosePanel({ review, votes, roster, currentUserId, isMember, activeCount, units, groups, totals, busy, reviewGate = false, onStart, onVote, onOpenUnit }: Props) {
  const [comment, setComment] = useState('')
  const status: string = review?.status || 'none'
  const closed = status === 'closed'
  const reviewing = status === 'reviewing'
  const expected: string[] = review?.expected_members || []
  const nameOf = (id: string) => roster.find(r => r.user_id === id)?.full_name?.trim() || 'ไม่พบชื่อในทะเบียน'
  const voteOf = (id: string) => votes.find(v => v.user_id === id)
  const approved = votes.filter(v => v.decision === 'approved').length
  const rejectedVote = votes.find(v => v.decision === 'rejected')
  const myVote = voteOf(currentUserId)
  const iAmExpected = expected.includes(currentUserId)
  const notReady = units.filter(u => !u.ready)
  const allReady = units.length > 0 && notReady.length === 0
  const unchecked = reviewGate ? units.filter(u => u.ready && !u.reviewed) : []
  const allChecked = reviewGate && units.length > 0 && unchecked.length === 0
  const pending = units.reduce((s, u) => s + u.pending, 0)
  const canRestart = isMember && !closed && !reviewing

  const s1: 'done' | 'active' = allReady || reviewing || closed ? 'done' : 'active'
  const s2: 'done' | 'active' | 'todo' = reviewing || closed ? 'done' : allReady && allChecked ? 'active' : 'todo'
  const s3: 'done' | 'active' | 'todo' = closed ? 'done' : reviewing ? 'active' : 'todo'
  const s4: 'done' | 'todo' = closed ? 'done' : 'todo'

  const vote = async (d: 'approved' | 'rejected') => { if (await onVote(d, comment)) setComment('') }

  return <div className="space-y-4">
    {closed && <div className="card flex items-start gap-3 border-emerald-200 bg-emerald-50"><Megaphone className="mt-0.5 shrink-0 text-emerald-700" size={22} />
      <div><div className="font-bold text-emerald-900">ปิดงวดและประกาศผลเรียบร้อยแล้ว</div>
        <p className="text-sm text-emerald-900">กรรมการอนุมัติครบ {num(expected.length, 0)} คน ระบบปิดยอดและเผยแพร่ผลให้บุคลากรเห็นแล้ว{review?.approved_at ? ` เมื่อ ${dateTime(review.approved_at)}` : ''}</p></div></div>}

    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-bold">ขั้นตอนรับรองผลและปิดงวด</h2><p className="text-xs text-stone-600">กรรมการคนใดก็เริ่มกระบวนการได้ ไม่ต้องมีประธาน · เมื่ออนุมัติครบทุกคน ระบบปิดยอดและประกาศผลให้อัตโนมัติ</p></div>
        {!isMember && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">ดูได้อย่างเดียว (ไม่ใช่กรรมการที่ปฏิบัติหน้าที่)</span>}
      </div>
      <ol>
        <Step n={1} state={s1} title="ตรวจความพร้อมทุกหน่วยงาน">
          {allReady || reviewing || closed
            ? <p className="text-emerald-800">ทุกหน่วยงานพร้อมตรวจ 100% ({num(units.length, 0)} หน่วยงาน) ไม่มีรายการรอรับรอง</p>
            : <>
              <p className="text-stone-700">ยังมี <b className="text-amber-700">{num(notReady.length, 0)}</b> หน่วยงานที่ยังไม่พร้อม รวมค้างรับรอง <b className="text-amber-700">{num(pending, 0)}</b> รายการ ต้องให้หัวหน้างานรับรองให้ครบก่อนจึงเริ่มขั้นตอนต่อไปได้</p>
              <ul className="max-h-56 divide-y overflow-auto rounded-lg border border-stone-200">{notReady.map(u => <li key={u.key} className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0"><div className="truncate font-medium">{u.name}</div><div className="truncate text-xs text-stone-500">{u.group}</div></div>
                <div className="flex shrink-0 items-center gap-2"><span className="text-xs font-semibold text-amber-700">ค้าง {num(u.pending, 0)}</span><button type="button" className="btn sec !py-1" onClick={() => onOpenUnit(u.key)}>ดูหน่วยงาน</button></div></li>)}</ul></>}
        </Step>

        <Step n={2} state={s2} title="เริ่มกระบวนการรับรอง">
          {reviewing || closed
            ? <p className="text-stone-700">เริ่มแล้ว{review?.started_by ? ` โดย ${nameOf(review.started_by)}` : ''}{review?.started_at ? ` · ${dateTime(review.started_at)}` : ''}<br /><span className="text-xs text-stone-500">ระบบเก็บผลคำนวณ ณ ตอนเริ่มไว้ให้กรรมการทุกคนอนุมัติจากตัวเลขชุดเดียวกัน</span></p>
            : <>
              {status === 'rejected' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"><b>รอบก่อนมีกรรมการไม่เห็นชอบ</b>{rejectedVote && <> — {nameOf(rejectedVote.user_id)}: "{rejectedVote.comment}"</>}<br />แก้ไขข้อมูลตามเหตุผลแล้วเริ่มรับรองใหม่ได้ (มติเดิมจะถูกล้าง)</div>}
              {status === 'stale' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">ข้อมูลคะแนนหรือรายชื่อกรรมการเปลี่ยนหลังเริ่มรับรอง จึงต้องเริ่มรับรองใหม่</div>}
              <button type="button" className="btn" disabled={busy || !canRestart || !allReady || !allChecked || activeCount === 0} onClick={onStart}><Play size={16} />{status === 'rejected' || status === 'stale' ? 'เริ่มรับรองใหม่' : 'เริ่มกระบวนการรับรอง'}</button>
              {!allReady && <p className="text-xs text-stone-500">ปุ่มจะใช้ได้เมื่อทุกหน่วยงานพร้อม 100%</p>}
              {allReady && !allChecked && <div className="space-y-1"><p className="text-xs text-amber-800">ต้องกดตรวจแล้วให้ครบทุกหน่วยงานก่อน (เหลือ {num(unchecked.length, 0)} หน่วยงาน)</p>
                <ul className="max-h-40 divide-y overflow-auto rounded-lg border border-stone-200">{unchecked.map(u => <li key={u.key} className="flex items-center justify-between gap-2 p-2"><span className="truncate">{u.name}<span className="text-xs text-stone-500"> · {u.group}</span></span><button type="button" className="btn sec !py-1" onClick={() => onOpenUnit(u.key)}>ไปตรวจ</button></li>)}</ul></div>}
              {allReady && !isMember && <p className="text-xs text-stone-500">เฉพาะกรรมการที่ปฏิบัติหน้าที่เท่านั้นที่เริ่มได้</p>}</>}
        </Step>

        <Step n={3} state={s3} title={`กรรมการลงมติ${reviewing || closed ? ` (อนุมัติ ${approved}/${expected.length} คน)` : ''}`}>
          {reviewing || closed ? <>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${expected.length ? (approved / expected.length) * 100 : 0}%` }} /></div>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{expected.map(id => { const v = voteOf(id); return <li key={id} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-2">
              <span className="truncate">{nameOf(id)}{id === currentUserId && <span className="text-xs text-teal-700"> (คุณ)</span>}</span>
              {v ? <span className={'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ' + (v.decision === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>{v.decision === 'approved' ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}{v.decision === 'approved' ? 'อนุมัติ' : 'ไม่เห็นชอบ'}</span>
                : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600"><CircleDashed size={12} />รอลงมติ</span>}</li> })}</ul>
            {reviewing && iAmExpected && !myVote && <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
              <p className="font-semibold">ตรวจสอบข้อมูลแล้ว ลงมติของคุณ</p>
              <textarea className="inp min-h-16 w-full !cursor-text" value={comment} onChange={e => setComment(e.target.value)} placeholder="หมายเหตุ (จำเป็นเมื่อไม่เห็นชอบ อย่างน้อย 5 ตัวอักษร)" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" disabled={busy} onClick={() => vote('approved')}><ThumbsUp size={15} />อนุมัติผลการจัดสรร</button>
                <button type="button" className="btn sec !border-red-200 !text-red-700" disabled={busy || comment.trim().length < 5} onClick={() => vote('rejected')}><ThumbsDown size={15} />ไม่เห็นชอบ (ยกเลิกรอบนี้)</button></div>
              <p className="text-xs text-stone-500">ถ้าไม่เห็นชอบ รอบนี้จะถูกยกเลิก เมื่อแก้ไขข้อมูลแล้วกรรมการคนใดก็เริ่มรับรองใหม่ได้</p></div>}
            {reviewing && myVote && <p className="text-xs text-stone-600">คุณลงมติแล้ว ({myVote.decision === 'approved' ? 'อนุมัติ' : 'ไม่เห็นชอบ'}) · รอกรรมการท่านอื่น</p>}
            {reviewing && !iAmExpected && <p className="text-xs text-stone-500">บัญชีนี้ไม่อยู่ในรายชื่อกรรมการของรอบนี้</p>}
            {reviewing && <p className="flex items-start gap-1 text-xs text-stone-500"><AlertTriangle size={13} className="mt-0.5 shrink-0" />ระหว่างลงมติ จะแก้ผลกิจกรรมรายบุคคลไม่ได้ หากพบข้อผิดพลาดให้ลงมติไม่เห็นชอบเพื่อยกเลิกรอบนี้ก่อน</p>}
          </> : <p className="text-stone-500">เริ่มหลังจากขั้นตอนที่ 2</p>}
        </Step>

        <Step n={4} state={s4} title="ปิดงวดและประกาศผล (อัตโนมัติ)">
          {closed ? <p className="flex items-center gap-1 text-emerald-800"><LockKeyhole size={15} />ปิดงวดแล้ว ผลการจัดสรรเผยแพร่ให้บุคลากรเรียบร้อย</p>
            : <p className="text-stone-500">เมื่อกรรมการอนุมัติครบทุกคน ({num(expected.length || activeCount, 0)} คน) ระบบจะปิดยอด บันทึกยอดยกไป และเผยแพร่ผลทันที ไม่ต้องกดยืนยันซ้ำ</p>}
        </Step>
      </ol>
    </section>

    <details className="card group">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Users size={18} />ข้อมูลภาพรวมที่กรรมการกำลังรับรอง <span className="text-xs font-normal text-stone-500">(ทั้งโรงพยาบาล แยกตามกลุ่มวิชาชีพ)</span></summary>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">{([['ยอดจัดสรรเดือนนี้', totals.allocation, 'บาท'], ['เงินกัน 3%', totals.reserve, 'บาท'], ['เงินสะสมงวดก่อน', totals.carry, 'บาท'], ['เงินส่วนต่างผู้ต่ำกว่าเกณฑ์', totals.below, 'บาท'], ['เงินรอจัดสรรจากแต้มส่วนเกิน', totals.pool, 'บาท'], ['แต้มส่วนเกินรวม', totals.excess, 'แต้ม']] as [string, number, string][]).map(([l, v, u]) =>
        <div key={l} className="rounded-lg border border-stone-200 p-2"><div className="text-xs text-stone-600">{l}</div><div className="font-bold tabular-nums">{num(v)} <span className="text-xs font-normal text-stone-500">{u}</span></div></div>)}</div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b text-left"><th className="p-2">กลุ่มวิชาชีพ</th><th className="p-2 text-right">บุคลากร</th><th className="p-2 text-right">ต่ำกว่าเกณฑ์</th><th className="p-2 text-right">เงินกัน 3%</th><th className="p-2 text-right">ยอดยกมา</th><th className="p-2 text-right">เงินส่วนต่าง</th><th className="p-2 text-right">แต้มส่วนเกิน</th><th className="p-2 text-right">เงินส่วนเพิ่ม</th><th className="p-2 text-right">บาท/แต้ม</th></tr></thead>
        <tbody>{groups.map(g => <tr key={g.pay_group} className="border-b last:border-0"><td className="p-2 font-medium">{g.name}</td><td className="p-2 text-right tabular-nums">{num(Number(g.n_eligible || 0) + Number(g.n_ineligible || 0), 0)}</td><td className="p-2 text-right tabular-nums">{num(g.n_below, 0)}</td><td className="p-2 text-right tabular-nums">{money(Number(g.reserve || 0) * Number(g.n_eligible || 0))}</td><td className="p-2 text-right tabular-nums">{money(g.carry_extra_in)}</td><td className="p-2 text-right tabular-nums">{money(g.below_threshold_difference)}</td><td className="p-2 text-right tabular-nums">{num(g.sum_excess)}</td><td className="p-2 text-right tabular-nums">{money(g.pool_extra)}</td><td className="p-2 text-right tabular-nums">{money(g.rate_per_point)}</td></tr>)}
          {!groups.length && <tr><td colSpan={9} className="p-4 text-center text-stone-500">ไม่พบข้อมูลกลุ่มวิชาชีพ</td></tr>}</tbody></table></div>
    </details>
  </div>
}
