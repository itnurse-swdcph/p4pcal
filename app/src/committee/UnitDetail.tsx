import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowDownToLine, ArrowUpToLine, CheckCheck, CheckCircle2, Clock3, Dices, Wallet } from 'lucide-react'
import { dateTime, lineMatches, money, num, reasonLabel, type Filter, type UnitStat } from './utils'

type Props = {
  unit: UnitStat
  groups: any[]
  siblings: UnitStat[]
  onBack: () => void
  onSelectUnit: (key: number) => void
  onViewPerson: (line: any) => void
  onRandomAudit: () => void
  canAudit: boolean
  submission?: any
  returnedPeople?: any[]
  onReturnPerson?: (line: any, reason: string) => void
  reviewEnabled?: boolean
  canReview?: boolean
  onReviewUnit?: () => void
  onUnreviewUnit?: () => void
}

type Sort = 'name' | 'score' | 'pay'

export default function UnitDetail({ unit, groups, siblings, onBack, onSelectUnit, onViewPerson, onRandomAudit, canAudit, submission, returnedPeople = [], onReturnPerson, reviewEnabled = false, canReview = false, onReviewUnit, onUnreviewUnit }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [reason, setReason] = useState('')
  const [returnTarget, setReturnTarget] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')

  const groupName = (pg: any) => groups.find(g => Number(g.pay_group) === Number(pg))?.name || `กลุ่ม ${pg ?? '—'}`
  const cards: [Filter, string, number, string][] = [
    ['all', 'บุคลากรทั้งหมด', unit.lines.length, 'text-stone-900'],
    ['eligible', 'มีสิทธิ์', unit.eligible, 'text-emerald-700'],
    ['ineligible', 'ไม่มีสิทธิ์', unit.ineligible, 'text-red-700'],
    ['reached', 'ถึงแต้มประกัน', unit.reached, 'text-emerald-700'],
    ['below', 'ต่ำกว่าแต้มประกัน', unit.below, 'text-amber-700']
  ]
  const ineligibleReasons = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of unit.lines) if (!l.eligible) { const r = reasonLabel(l.eligibility_reason); m.set(r, (m.get(r) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [unit])

  const rows = useMemo(() => {
    let r = unit.lines.filter(l => lineMatches(l, filter))
    if (filter === 'ineligible' && reason) r = r.filter(l => reasonLabel(l.eligibility_reason) === reason)
    const by: Record<Sort, (a: any, b: any) => number> = {
      name: (a, b) => String(a.name).localeCompare(String(b.name), 'th'),
      score: (a, b) => Number(b.counted || 0) - Number(a.counted || 0),
      pay: (a, b) => Number(b.total || 0) - Number(a.total || 0)
    }
    return [...r].sort(by[sort])
  }, [unit, filter, sort, reason])

  const byProfession = useMemo(() => {
    const m = new Map<number, any>()
    for (const l of unit.lines) {
      const k = Number(l.pay_group ?? 0)
      const s = m.get(k) || { pg: k, people: 0, eligible: 0, ineligible: 0, reached: 0, below: 0, counted: 0, base: 0, extra: 0, total: 0 }
      s.people += 1
      if (l.eligible) { s.eligible += 1; if (l.below) s.below += 1; else s.reached += 1 } else s.ineligible += 1
      s.counted += Number(l.counted || 0); s.base += Number(l.activity || 0); s.extra += Number(l.extra || 0); s.total += Number(l.total || 0)
      m.set(k, s)
    }
    return [...m.values()].sort((a, b) => a.pg - b.pg)
  }, [unit])

  const person = (l: any) => l && <button type="button" className="text-left font-semibold text-teal-800 hover:underline" onClick={() => onViewPerson(l)}>{l.name}</button>
  const sameGroup = siblings.filter(s => s.group === unit.group)

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className="btn sec" onClick={onBack}><ArrowLeft size={16} />กลับไปภาพรวมหน่วยงาน</button>
      {sameGroup.length > 1 && <label className="flex items-center gap-2 text-sm font-semibold text-stone-700"><span className="whitespace-nowrap">สลับหน่วยงาน</span>
        <select className="inp min-w-[14rem]" value={unit.key} onChange={e => { onSelectUnit(Number(e.target.value)); setFilter('all'); setReason('') }}>
          {sameGroup.map(s => <option key={s.key} value={s.key}>{s.ready ? '✓ ' : '• '}{s.name}</option>)}
        </select></label>}
    </div>

    <section className="card space-y-2">
      <div className="text-xs font-semibold text-teal-800">{unit.group}</div>
      {submission && <p className={'text-xs font-semibold ' + (submission.status === 'returned' || returnedPeople.length ? 'text-red-800' : 'text-emerald-800')}>สถานะส่งผลงาน: {submission.status === 'returned' || returnedPeople.length ? 'รอแก้ไข' : submission.status === 'resubmitted' ? 'ส่งผลงานซ้ำแล้ว' : 'ส่งผลงานแล้ว'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-stone-900">{unit.name}</h2>
        {unit.ready
          ? <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800"><CheckCircle2 size={16} />พร้อมตรวจ 100%</span>
          : unit.returnCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-800"><Clock3 size={16} />รอแก้ไข {num(unit.returnCount, 0)} คน</span>
          : <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800"><Clock3 size={16} />ยังไม่พร้อม · ค้างรับรอง {num(unit.pending, 0)} รายการ ({num(unit.peoplePending, 0)} คน)</span>}
      </div>
      {!unit.ready && <p className="text-xs text-stone-600">หัวหน้างานต้องรับรองกิจกรรมที่ค้างให้ครบก่อน จึงจะเริ่มกระบวนการรับรองผลประจำเดือนได้ (กรองดูรายชื่อที่ค้างได้ที่ตัวกรอง "มีรายการรอรับรอง")</p>}
      {!reviewEnabled && <p className="border-t border-stone-100 pt-3 text-xs text-stone-500">ไม่สามารถอ่านสถานะตรวจจากฐานข้อมูลได้ จึงปิดการกดตรวจและเริ่มรับรองไว้ก่อน กรุณาแจ้งผู้ดูแลระบบ</p>}
      {reviewEnabled && <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        {unit.reviewed
          ? <>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800"><CheckCheck size={16} />ตรวจแล้ว</span>
            <span className="text-xs text-stone-600">โดย {unit.reviewedByName || 'กรรมการ'}{unit.reviewedAt ? ` · ${dateTime(unit.reviewedAt)}` : ''}</span>
            <button type="button" className="btn sec !py-1" disabled={!canReview} onClick={onUnreviewUnit}>ยกเลิกการตรวจ</button>
          </>
          : <>
            <button type="button" className="btn" disabled={!unit.ready || !canReview} onClick={onReviewUnit}><CheckCheck size={16} />ตรวจแล้ว</button>
            <span className="text-xs text-stone-600">{!unit.ready ? 'กดได้เมื่อหน่วยงานส่งผลงานและพร้อมตรวจ 100%' : !canReview ? 'เฉพาะกรรมการที่ปฏิบัติหน้าที่ก่อนเริ่มรับรองผลเท่านั้น' : 'กดเมื่อกรรมการตรวจหน่วยงานนี้เรียบร้อยแล้ว'}</span>
          </>}
      </div>}
    </section>

    {returnedPeople.length > 0 && <section className="card space-y-3 border-red-200" aria-label="บุคลากรรอแก้ไข">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-red-800">บุคลากรที่รอแก้ไขรายการจากคณะกรรมการ</h3><span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">{num(returnedPeople.length, 0)} คน</span></div>
      <div className="divide-y divide-red-100">{returnedPeople.map((p: any) => <div key={p.return_id || p.staff_directory_id} className="flex flex-wrap items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
        <div className="min-w-0 flex-1"><div className="font-semibold text-stone-900">{p.name || 'ไม่พบชื่อบุคลากร'}</div><div className="text-xs text-stone-600">{p.position || '—'} · รหัสทะเบียน {p.staff_directory_id}</div>
          <div className="mt-1 whitespace-pre-wrap rounded-lg bg-red-50 p-2 text-xs text-red-800"><b>เหตุผลที่ส่งกลับ:</b> {p.reason || 'ไม่ได้ระบุเหตุผล'}</div>
        </div>
        {p.id && <button type="button" className="btn sec !py-1" onClick={() => onViewPerson(p)}>เปิดกิจกรรมรายบุคคล</button>}
      </div>)}</div>
    </section>}

    <section aria-label="สรุปบุคลากร (กดเพื่อดูรายชื่อ)" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{cards.map(([k, label, n, color]) =>
        <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setReason('') }}
          className={'card !p-3 text-left transition hover:border-teal-300 ' + (filter === k ? '!border-teal-600 ring-2 ring-teal-100' : '')}>
          <div className="text-xs text-stone-600">{label}</div><div className={'mt-1 text-2xl font-bold tabular-nums ' + color}>{num(n, 0)}</div><div className="text-[11px] text-teal-700">กดดูรายชื่อ</div>
        </button>)}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="card !p-3"><div className="flex items-center gap-1 text-xs text-stone-600"><ArrowUpToLine size={14} />คะแนนสูงสุด (ผู้มีสิทธิ์)</div>
          {unit.highest ? <><div className="mt-1 text-xl font-bold tabular-nums">{num(unit.highest.counted)} <span className="text-xs font-normal text-stone-500">แต้ม</span></div><div className="text-sm">{person(unit.highest)}</div></> : <div className="mt-1 text-sm text-stone-500">ไม่มีข้อมูล</div>}</div>
        <div className="card !p-3"><div className="flex items-center gap-1 text-xs text-stone-600"><ArrowDownToLine size={14} />คะแนนต่ำสุด (ผู้มีสิทธิ์)</div>
          {unit.lowest ? <><div className="mt-1 text-xl font-bold tabular-nums">{num(unit.lowest.counted)} <span className="text-xs font-normal text-stone-500">แต้ม</span></div><div className="text-sm">{person(unit.lowest)}</div></> : <div className="mt-1 text-sm text-stone-500">ไม่มีข้อมูล</div>}</div>
        <div className="card !p-3"><div className="flex items-center gap-1 text-xs text-stone-600"><Wallet size={14} />เงินที่ได้รับจัดสรรในหน่วยงาน</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{money(unit.total)} <span className="text-xs font-normal text-stone-500">บาท</span></div>
          <div className="text-[11px] text-stone-500">ตามผลงาน {money(unit.base)} + ส่วนเพิ่ม {money(unit.extra)} (ประมาณการ)</div></div>
      </div>
    </section>

    <section className="card space-y-2">
      <h3 className="font-semibold">สรุปการจัดสรรแยกตามกลุ่มวิชาชีพ</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
        <thead><tr className="border-b text-left"><th className="p-2">กลุ่มวิชาชีพ</th><th className="p-2 text-right">คน</th><th className="p-2 text-right">มีสิทธิ์</th><th className="p-2 text-right">ไม่มีสิทธิ์</th><th className="p-2 text-right">ถึงประกัน</th><th className="p-2 text-right">ต่ำกว่า</th><th className="p-2 text-right">แต้มรวม</th><th className="p-2 text-right">ตามผลงาน</th><th className="p-2 text-right">ส่วนเพิ่ม</th><th className="p-2 text-right">รวม (บาท)</th></tr></thead>
        <tbody>{byProfession.map(s => <tr key={s.pg} className="border-b last:border-0">
          <td className="p-2 font-medium">{groupName(s.pg)}</td><td className="p-2 text-right tabular-nums">{num(s.people, 0)}</td><td className="p-2 text-right tabular-nums">{num(s.eligible, 0)}</td><td className="p-2 text-right tabular-nums">{num(s.ineligible, 0)}</td>
          <td className="p-2 text-right tabular-nums">{num(s.reached, 0)}</td><td className="p-2 text-right tabular-nums">{num(s.below, 0)}</td><td className="p-2 text-right tabular-nums">{num(s.counted)}</td>
          <td className="p-2 text-right tabular-nums">{money(s.base)}</td><td className="p-2 text-right tabular-nums">{money(s.extra)}</td><td className="p-2 text-right font-semibold tabular-nums">{money(s.total)}</td></tr>)}
          <tr className="border-t-2 bg-stone-50 font-bold"><td className="p-2">รวมหน่วยงาน</td><td className="p-2 text-right tabular-nums">{num(unit.lines.length, 0)}</td><td className="p-2 text-right tabular-nums">{num(unit.eligible, 0)}</td><td className="p-2 text-right tabular-nums">{num(unit.ineligible, 0)}</td><td className="p-2 text-right tabular-nums">{num(unit.reached, 0)}</td><td className="p-2 text-right tabular-nums">{num(unit.below, 0)}</td><td className="p-2 text-right tabular-nums">{num(byProfession.reduce((s, x) => s + x.counted, 0))}</td><td className="p-2 text-right tabular-nums">{money(unit.base)}</td><td className="p-2 text-right tabular-nums">{money(unit.extra)}</td><td className="p-2 text-right tabular-nums">{money(unit.total)}</td></tr>
        </tbody></table></div>
    </section>

    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">รายชื่อบุคลากร</h3><p className="text-xs text-stone-600">แสดง {num(rows.length, 0)} จาก {num(unit.lines.length, 0)} คน · กด "ตรวจกิจกรรม" เพื่อดูกิจกรรมรายบุคคล</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm"><span>เรียงตาม</span><select className="inp !w-auto" value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="name">ชื่อ</option><option value="score">คะแนน (มาก → น้อย)</option><option value="pay">เงินที่ได้รับ (มาก → น้อย)</option></select></label>
          <button type="button" className={'btn sec ' + (filter === 'pending' ? '!border-teal-600 !bg-teal-50' : '')} aria-pressed={filter === 'pending'} onClick={() => { setFilter(filter === 'pending' ? 'all' : 'pending'); setReason('') }}>มีรายการรอรับรอง ({num(unit.peoplePending, 0)})</button>
          <button type="button" className="btn sec" disabled={!canAudit} title={canAudit ? '' : 'ขณะนี้ไม่สามารถแก้ผลกิจกรรมได้'} onClick={onRandomAudit}><Dices size={15} />สุ่มตรวจ 5 รายการ</button>
        </div>
      </div>
      {filter === 'ineligible' && ineligibleReasons.length > 0 && <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-red-50/60 p-2 text-xs">
        <span className="font-semibold text-red-800">เหตุผลที่ไม่มีสิทธิ์:</span>
        <button type="button" onClick={() => setReason('')} className={'rounded-full border px-2.5 py-0.5 ' + (!reason ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-red-800')}>ทั้งหมด {unit.ineligible}</button>
        {ineligibleReasons.map(([r, n]) => <button key={r} type="button" onClick={() => setReason(r)} className={'rounded-full border px-2.5 py-0.5 ' + (reason === r ? 'border-red-600 bg-red-600 text-white' : 'border-red-200 bg-white text-red-800')}>{r} · {n} คน</button>)}
      </div>}
      <div className="max-h-[32rem] overflow-auto"><table className="w-full min-w-[860px] text-sm">
        <thead className="sticky top-0 bg-white"><tr className="border-b text-left"><th className="p-2">ชื่อ-สกุล</th><th className="p-2">ตำแหน่ง</th><th className="p-2 text-right">วันทำงาน</th><th className="p-2">สิทธิ์</th><th className="p-2 text-right">คะแนน</th><th className="p-2">แต้มประกัน</th><th className="p-2 text-right">รอรับรอง</th><th className="p-2 text-right">เงินที่ได้รับ</th><th className="p-2">หมายเหตุอื่นๆ</th><th className="p-2"><span className="sr-only">การดำเนินการ</span></th></tr></thead>
        <tbody>{rows.map((l, i) => <tr key={l.id || i} className="border-b last:border-0 align-top">
          <td className="p-2 font-medium">{l.name || '—'}</td><td className="p-2 text-xs text-stone-600">{l.position || '—'}<div>{groupName(l.pay_group)}</div></td>
          <td className="p-2 text-right tabular-nums">{num(l.work_days, 0)}</td>
          <td className="p-2">{l.eligible ? <span className="font-semibold text-emerald-700">มีสิทธิ์</span> : <><span className="font-semibold text-red-700">ไม่มีสิทธิ์</span><div className="max-w-[14rem] text-xs text-stone-600">{reasonLabel(l.eligibility_reason)}</div></>}</td>
          <td className="p-2 text-right tabular-nums">{num(l.counted)}</td>
          <td className="p-2">{!l.eligible ? <span className="text-stone-400">—</span> : l.below ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">ต่ำกว่า</span> : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">ถึงเกณฑ์</span>}</td>
          <td className="p-2 text-right tabular-nums">{Number(l.pending) > 0 ? <b className="text-amber-700">{num(l.pending, 0)}</b> : <span className="text-stone-400">0</span>}</td>
          <td className="p-2 text-right font-semibold tabular-nums">{money(l.total)}</td>
          <td className="p-2 max-w-[18rem] whitespace-pre-wrap break-words text-xs text-stone-700">{String(l.other_notes || '').trim() || <span className="text-stone-400">—</span>}</td>
          <td className="p-2 text-right space-y-1">
            <button type="button" className="btn sec !py-1" onClick={() => onViewPerson(l)}>ตรวจกิจกรรม</button>
            {submission && onReturnPerson && <div>
              {returnTarget === String(l.staff_directory_id ?? l.directory_source_row) ? <div className="w-56 space-y-1">
                <textarea className="inp min-h-16 w-full text-xs" value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="ระบุสิ่งที่ต้องแก้ไข อย่างน้อย 5 ตัวอักษร" />
                <div className="flex justify-end gap-1"><button type="button" className="btn sec !py-1" onClick={() => { setReturnTarget(null); setReturnReason('') }}>ยกเลิก</button><button type="button" className="btn !py-1" disabled={returnReason.trim().length < 5} onClick={() => { onReturnPerson(l, returnReason); setReturnTarget(null); setReturnReason('') }}>ยืนยันส่งกลับ</button></div>
              </div> : <button type="button" className="btn sec !py-1 !text-amber-800" onClick={() => { setReturnTarget(String(l.staff_directory_id ?? l.directory_source_row)); setReturnReason('') }}>ส่งกลับรายบุคคล</button>}
            </div>}
          </td>
        </tr>)}
          {!rows.length && <tr><td colSpan={10} className="p-6 text-center text-stone-500">ไม่พบรายชื่อตามเงื่อนไขที่เลือก</td></tr>}</tbody></table></div>
    </section>
  </div>
}
