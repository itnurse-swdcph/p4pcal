import { Fragment, useMemo, useState } from 'react'
import { CheckCheck, CheckCircle2, ChevronRight, Clock3 } from 'lucide-react'
import { dateTime, money, num, type UnitStat } from './utils'

type Ready = 'all' | 'ready' | 'notready' | 'reviewed'

export default function UnitOverview({ units, onOpen, showReview = false }: { units: UnitStat[]; onOpen: (key: number) => void; showReview?: boolean }) {
  const [group, setGroup] = useState('')
  const [unit, setUnit] = useState('')
  const [ready, setReady] = useState<Ready>('all')

  const groups = useMemo(() => [...new Set(units.map(u => u.group))], [units])
  const unitOptions = useMemo(() => units.filter(u => !group || u.group === group), [units, group])
  const filtered = useMemo(() => units.filter(u =>
    (!group || u.group === group) && (!unit || String(u.key) === unit) &&
    (ready === 'all' || (ready === 'ready' ? u.ready : ready === 'reviewed' ? !!u.reviewed : !u.ready))), [units, group, unit, ready])
  const byGroup = useMemo(() => {
    const m = new Map<string, UnitStat[]>()
    for (const u of filtered) m.set(u.group, [...(m.get(u.group) || []), u])
    return [...m.entries()]
  }, [filtered])

  const readyCount = units.filter(u => u.ready).length
  const pendingTotal = units.reduce((s, u) => s + u.pending, 0)
  const chips: [Ready, string, number][] = [['all', 'ทั้งหมด', units.length], ['ready', 'พร้อมตรวจ 100%', readyCount], ['notready', 'ยังไม่พร้อม', units.length - readyCount],
    ...(showReview ? [['reviewed', 'ตรวจแล้ว', units.filter(u => u.reviewed).length] as [Ready, string, number]] : [])]

  return <div className="space-y-4">
    <section className="card space-y-3" aria-label="ตัวกรอง">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1"><span className="field-label">กลุ่มงาน</span>
          <select className="inp w-full" value={group} onChange={e => { setGroup(e.target.value); setUnit('') }}>
            <option value="">ทุกกลุ่มงาน</option>{groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select></label>
        <label className="block space-y-1"><span className="field-label">หน่วยงาน</span>
          <select className="inp w-full" value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="">ทุกหน่วยงาน{group ? 'ในกลุ่มงานนี้' : ''}</option>{unitOptions.map(u => <option key={u.key} value={u.key}>{u.name}</option>)}
          </select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามความพร้อม">{chips.map(([k, l, n]) =>
          <button key={k} type="button" onClick={() => setReady(k)} aria-pressed={ready === k}
            className={'rounded-full border px-3 py-1 text-sm font-semibold ' + (ready === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50')}>{l} <span className="tabular-nums">{n}</span></button>)}</div>
        <span className="text-xs text-stone-600">รอรับรองทั้งโรงพยาบาล <b className={pendingTotal ? 'text-amber-700' : 'text-emerald-700'}>{num(pendingTotal, 0)}</b> รายการ</span>
      </div>
    </section>

    {!byGroup.length && <div className="card py-8 text-center text-sm text-stone-500">ไม่พบหน่วยงานตามเงื่อนไขที่เลือก</div>}

    {byGroup.length > 0 && <div className="card w-full overflow-x-auto !p-0">
      <table className="text-sm" style={{ width: '100%', minWidth: 980, tableLayout: 'auto' }}>
        <thead><tr className="border-b border-stone-200 text-left text-xs text-stone-600">
          <th className="p-2.5 font-semibold">หน่วยงาน</th>
          <th className="p-2.5 text-right font-semibold">บุคลากร (มีสิทธิ์)</th>
          <th className="p-2.5 font-semibold">ความคืบหน้าการรับรอง</th>
          <th className="p-2.5 text-right font-semibold">ถึง / ต่ำกว่าแต้มประกัน</th>
          <th className="p-2.5 text-right font-semibold">ยอดจัดสรร (บาท)</th>
          <th className="p-2.5 font-semibold">สถานะส่งผลงาน</th>
          {showReview && <th className="p-2.5 font-semibold">การตรวจ</th>}
          <th className="w-8 p-2.5"><span className="sr-only">เปิดรายละเอียด</span></th>
        </tr></thead>
        <tbody>{byGroup.map(([g, list]) => <Fragment key={g}>
          <tr className="bg-stone-50"><td colSpan={showReview ? 8 : 7} className="px-2.5 py-1.5 text-sm font-bold text-stone-800">{g}
            <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-600">พร้อม {list.filter(u => u.ready).length}/{list.length}</span>
            {showReview && <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-stone-600">ตรวจแล้ว {list.filter(u => u.reviewed).length}/{list.length}</span>}</td></tr>
          {list.map(u => <tr key={u.key} onClick={() => onOpen(u.key)} className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-teal-50/40">
            <td className="p-2.5"><button type="button" className="text-left font-semibold text-stone-900 hover:underline" onClick={e => { e.stopPropagation(); onOpen(u.key) }}>{u.name}</button></td>
            <td className="whitespace-nowrap p-2.5 text-right tabular-nums">{num(u.lines.length, 0)} <span className="text-xs text-stone-500">({num(u.eligible, 0)})</span></td>
            <td className="p-2.5" aria-label={`ความคืบหน้าการรับรองกิจกรรม ${u.progress}%`}>
              <div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-stone-100"><div className={'h-full rounded-full ' + (u.ready ? 'bg-emerald-500' : 'bg-amber-400')} style={{ width: `${u.progress}%` }} /></div>
                <span className="whitespace-nowrap text-xs tabular-nums text-stone-600">{u.progress}% · {num(u.approved + u.rejected, 0)}/{num(u.approved + u.rejected + u.pending, 0)}</span></div></td>
            <td className="whitespace-nowrap p-2.5 text-right tabular-nums"><b className="text-emerald-700">{num(u.reached, 0)}</b> / <b className={u.below ? 'text-red-700' : 'text-stone-800'}>{num(u.below, 0)}</b></td>
            <td className="whitespace-nowrap p-2.5 text-right font-semibold tabular-nums">{money(u.total)}</td>
            <td className="p-2.5">{u.ready
              ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"><CheckCircle2 size={13} />พร้อมตรวจ 100%</span>
              : u.submissionStatus === 'returned'
                ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800"><Clock3 size={13} />ส่งกลับแก้ไข</span>
                : !u.submitted
                  ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-stone-200 bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700"><Clock3 size={13} />ยังไม่ส่งผลงาน</span>
                  : <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"><Clock3 size={13} />ค้าง {num(u.pending, 0)} รายการ</span>}</td>
            {showReview && <td className="p-2.5">{u.reviewed
              ? <div><span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"><CheckCheck size={13} />ตรวจแล้ว</span>
                <div className="mt-0.5 text-[11px] text-stone-600">โดย {u.reviewedByName || 'กรรมการ'}{u.reviewedAt ? ` · ${dateTime(u.reviewedAt)}` : ''}</div></div>
              : u.ready ? <span className="text-xs font-semibold text-teal-800">รอตรวจ</span> : <span className="text-xs text-stone-400">—</span>}</td>}
            <td className="p-2.5 text-right"><ChevronRight size={15} className="text-teal-700" /></td>
          </tr>)}
        </Fragment>)}</tbody>
      </table>
    </div>}
  </div>
}
