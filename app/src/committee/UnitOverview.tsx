import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, Clock3 } from 'lucide-react'
import { money, num, type UnitStat } from './utils'

type Ready = 'all' | 'ready' | 'notready'

export default function UnitOverview({ units, onOpen }: { units: UnitStat[]; onOpen: (key: number) => void }) {
  const [group, setGroup] = useState('')
  const [unit, setUnit] = useState('')
  const [ready, setReady] = useState<Ready>('all')

  const groups = useMemo(() => [...new Set(units.map(u => u.group))], [units])
  const unitOptions = useMemo(() => units.filter(u => !group || u.group === group), [units, group])
  const filtered = useMemo(() => units.filter(u =>
    (!group || u.group === group) && (!unit || String(u.key) === unit) &&
    (ready === 'all' || (ready === 'ready' ? u.ready : !u.ready))), [units, group, unit, ready])
  const byGroup = useMemo(() => {
    const m = new Map<string, UnitStat[]>()
    for (const u of filtered) m.set(u.group, [...(m.get(u.group) || []), u])
    return [...m.entries()]
  }, [filtered])

  const readyCount = units.filter(u => u.ready).length
  const pendingTotal = units.reduce((s, u) => s + u.pending, 0)
  const chips: [Ready, string, number][] = [['all', 'ทั้งหมด', units.length], ['ready', 'พร้อมตรวจ 100%', readyCount], ['notready', 'ยังไม่พร้อม', units.length - readyCount]]

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

    {byGroup.map(([g, list]) => <section key={g} className="space-y-2" aria-label={g}>
      <h3 className="flex flex-wrap items-center gap-2 px-1 text-sm font-bold text-stone-800">{g}
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">พร้อม {list.filter(u => u.ready).length}/{list.length}</span></h3>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">{list.map(u => <li key={u.key}>
        <button type="button" onClick={() => onOpen(u.key)} className="card w-full text-left transition hover:border-teal-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-stone-900">{u.name}</div>
              <div className="mt-0.5 text-xs text-stone-600">บุคลากร {num(u.lines.length, 0)} คน · มีสิทธิ์ {num(u.eligible, 0)} · ไม่มีสิทธิ์ {num(u.ineligible, 0)}</div>
            </div>
            {u.ready
              ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14} />พร้อมตรวจ 100%</span>
              : u.submissionStatus === 'returned'
                ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800"><Clock3 size={14} />ส่งกลับแก้ไข</span>
                : !u.submitted
                  ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-200 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700"><Clock3 size={14} />ยังไม่ส่งผลงาน</span>
                  : <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><Clock3 size={14} />ค้าง {num(u.pending, 0)} รายการ</span>}
          </div>
          <div className="mt-3" aria-label={`ความคืบหน้าการรับรองกิจกรรม ${u.progress}%`}>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={'h-full rounded-full ' + (u.ready ? 'bg-emerald-500' : 'bg-amber-400')} style={{ width: `${u.progress}%` }} /></div>
            <div className="mt-1 flex justify-between text-[11px] text-stone-500"><span>ความคืบหน้าการรับรอง {u.progress}%</span><span>{num(u.approved + u.rejected, 0)}/{num(u.approved + u.rejected + u.pending, 0)} รายการ</span></div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
            <span>ถึงแต้มประกัน <b className="text-emerald-700">{num(u.reached, 0)}</b> · ต่ำกว่า <b className={u.below ? 'text-red-700' : 'text-stone-800'}>{num(u.below, 0)}</b></span>
            <span className="inline-flex items-center gap-1">ยอดจัดสรร <b className="tabular-nums text-stone-900">{money(u.total)}</b> บาท <ChevronRight size={14} className="text-teal-700" /></span>
          </div>
        </button>
      </li>)}</ul>
    </section>)}
  </div>
}
