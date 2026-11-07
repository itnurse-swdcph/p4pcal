import { Fragment, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { money, num } from './utils'

type Props = {
  groups: any[]
  lines: any[]
  month: string
  monthText: string
  closed?: boolean
}

type Col = {
  key: string
  name: string
  nTotal: number; nEligible: number; nIneligible: number; nBelow: number; nAbove: number
  total100: number
  carryIn: number
  reserve: number
  ineligible: number
  belowDiff: number
  commonPool: number
  poolDistributable: number
  activityPaid: number
  extraPaid: number
  sumExcess: number
  rate: number
  carryOut: number
  balanceDiff: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export default function BudgetPanel({ groups, lines, month, monthText, closed }: Props) {
  const isOctober = month === '2026-10'

  const cols = useMemo<Col[]>(() => {
    const sorted = [...groups].sort((a, b) => Number(a.pay_group) - Number(b.pay_group))
    const perGroup: Col[] = sorted.map(g => {
      const el = Number(g.n_eligible || 0), inel = Number(g.n_ineligible || 0)
      const full = Number(g.full_amount || 0)
      const glines = lines.filter((l: any) => Number(l.pay_group) === Number(g.pay_group))
      const total100 = full * (el + inel)
      const carryIn = isOctober ? 0 : Number(g.carry_extra_in || 0)
      const reserve = Number(g.reserve || 0) * el
      const ineligible = full * inel
      const belowDiff = Number(g.below_threshold_difference || 0)
      const activityPaid = sum(glines.map((l: any) => Number(l.activity || 0)))
      const extraPaid = sum(glines.map((l: any) => Number(l.extra || 0)))
      const carryOut = Number(g.carry_extra_out || 0)
      return {
        key: String(g.pay_group), name: String(g.name || `กลุ่ม ${g.pay_group}`),
        nTotal: el + inel, nEligible: el, nIneligible: inel, nBelow: Number(g.n_below || 0), nAbove: Number(g.n_above || 0),
        total100, carryIn, reserve, ineligible, belowDiff,
        commonPool: reserve + ineligible + belowDiff,
        poolDistributable: Number(g.pool_extra || 0),
        activityPaid, extraPaid, sumExcess: Number(g.sum_excess || 0),
        rate: Number(g.rate_per_point || 0), carryOut,
        balanceDiff: total100 + carryIn - (activityPaid + extraPaid + carryOut),
      }
    })
    const all: Col = {
      key: 'all', name: 'ภาพรวมทั้งหมด',
      nTotal: sum(perGroup.map(c => c.nTotal)), nEligible: sum(perGroup.map(c => c.nEligible)), nIneligible: sum(perGroup.map(c => c.nIneligible)),
      nBelow: sum(perGroup.map(c => c.nBelow)), nAbove: sum(perGroup.map(c => c.nAbove)),
      total100: sum(perGroup.map(c => c.total100)), carryIn: sum(perGroup.map(c => c.carryIn)), reserve: sum(perGroup.map(c => c.reserve)),
      ineligible: sum(perGroup.map(c => c.ineligible)), belowDiff: sum(perGroup.map(c => c.belowDiff)),
      commonPool: sum(perGroup.map(c => c.commonPool)), poolDistributable: sum(perGroup.map(c => c.poolDistributable)),
      activityPaid: sum(perGroup.map(c => c.activityPaid)), extraPaid: sum(perGroup.map(c => c.extraPaid)),
      sumExcess: sum(perGroup.map(c => c.sumExcess)),
      // อัตราเฉลี่ยถ่วงน้ำหนัก = เงินกองกลางที่นำไปแบ่งของกลุ่มที่มีแต้มส่วนเกิน / แต้มส่วนเกินรวม
      rate: (() => { const ex = sum(perGroup.map(c => c.sumExcess)); return ex > 0 ? sum(perGroup.filter(c => c.sumExcess > 0).map(c => c.poolDistributable)) / ex : 0 })(),
      carryOut: sum(perGroup.map(c => c.carryOut)), balanceDiff: sum(perGroup.map(c => c.balanceDiff)),
    }
    return [all, ...perGroup]
  }, [groups, lines, isOctober])

  if (!groups.length) return <div className="card text-sm text-stone-500">ยังไม่มีข้อมูลการคำนวณวงเงินของเดือนนี้</div>

  const all = cols[0]
  const unbalanced = cols.some(c => Math.abs(c.balanceDiff) > 0.011)

  type Row = { label: string; hint?: string; indent?: 0 | 1; strong?: boolean; tone?: string; get: (c: Col) => string }
  const m = (f: (c: Col) => number) => (c: Col) => money(f(c))
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: '1. วงเงินที่ได้รับ',
      rows: [
        { label: 'จำนวนผู้ปฏิบัติงานทั้งหมด (คน)', hint: 'มีสิทธิ์ + ไม่มีสิทธิ์ในเดือนนี้', get: c => `${num(c.nTotal, 0)} (มีสิทธิ์ ${num(c.nEligible, 0)} / ไม่มีสิทธิ์ ${num(c.nIneligible, 0)})` },
        { label: 'วงเงินที่ได้รับทั้งหมดในเดือน (เงิน 100%)', strong: true, get: m(c => c.total100) },
        { label: 'เงินยกยอดจากเดือนก่อน', hint: isOctober ? 'เดือนตุลาคม 2569 ไม่นำยอดยกมารวมในกองกลาง' : undefined, get: m(c => c.carryIn) },
        { label: 'เงินกองกลาง', strong: true, hint: 'รวม 3 รายการด้านล่าง (ไม่รวมเงินยกยอด)', get: m(c => c.commonPool) },
        { label: 'เงินกัน 3%', indent: 1, hint: isOctober ? 'เดือนตุลาคม 2569 ไม่หักเงินกัน 3%' : 'คิดจากผู้มีสิทธิ์ทุกคน', get: m(c => c.reserve) },
        { label: 'เงินของผู้ที่ไม่มีสิทธิ์ในเดือน', indent: 1, get: m(c => c.ineligible) },
        { label: 'เงินเพิ่มจากผู้ที่คะแนนไม่ถึงเกณฑ์', indent: 1, hint: 'ส่วนต่างระหว่างเงินเต็มกับเงินที่จ่ายผู้ที่แต้มไม่ถึงเกณฑ์', get: c => `${money(c.belowDiff)}${c.nBelow ? ` (${num(c.nBelow, 0)} คน)` : ''}` },
        { label: 'เงินกองกลางรวมยอดยกมา ที่นำไปแบ่งเป็นเงินเพิ่ม', tone: 'text-teal-900', get: m(c => c.poolDistributable) },
      ],
    },
    {
      title: '2. ยอดจัดสรร',
      rows: [
        { label: 'เงินจ่ายตามผลการปฏิบัติงาน', strong: true, get: m(c => c.activityPaid) },
        { label: 'เงินเพิ่มจากแต้มส่วนเกิน', strong: true, hint: `ผู้ที่แต้มเกินเกณฑ์ ${num(all.nAbove, 0)} คน (ภาพรวม)`, get: c => `${money(c.extraPaid)}${c.nAbove ? ` (${num(c.nAbove, 0)} คน)` : ''}` },
        { label: 'แต้มส่วนเกินรวม', get: c => num(c.sumExcess, 2) },
        { label: isOctober ? 'อัตราเงินเพิ่มต่อแต้ม' : 'อัตราเงินเพิ่มต่อแต้ม (บาท/แต้ม)', hint: isOctober ? 'เดือนตุลาคม 2569 แบ่งเท่ากันต่อคน ไม่คิดตามแต้ม' : 'ภาพรวม = ค่าเฉลี่ยถ่วงน้ำหนักของทุกกลุ่ม', get: c => isOctober ? '—' : (c.rate > 0 ? num(c.rate, 4) : '—') },
        { label: 'เงินเหลือยกไปเดือนถัดไป', strong: true, tone: 'text-amber-800', get: m(c => c.carryOut) },
      ],
    },
  ]

  return <div className="space-y-4">
    <section className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">วงเงินและยอดจัดสรร ประจำเดือน{monthText}</h3>
          <p className="text-sm text-stone-600">สรุปจากผลคำนวณล่าสุดของงวดนี้{closed ? ' (งวดปิดแล้ว ใช้ผลที่บันทึกไว้)' : ' (เปลี่ยนตามผลการตรวจ รับรอง และส่งกลับกิจกรรม)'}</p>
        </div>
        {unbalanced
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800"><AlertTriangle size={15} />ยอดไม่สมดุล ต่างกัน {money(all.balanceDiff)} บาท</span>
          : <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800"><CheckCircle2 size={15} />วงเงิน + ยกยอด = จ่ายตามผลงาน + เงินเพิ่ม + เหลือยกไป</span>}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['วงเงินทั้งหมด (100%)', all.total100, 'bg-stone-50'],
          ['เงินกองกลาง', all.commonPool, 'bg-teal-50'],
          ['จ่ายตามผลการปฏิบัติงาน', all.activityPaid, 'bg-emerald-50'],
          ['เงินเพิ่มจากแต้มส่วนเกิน', all.extraPaid, 'bg-sky-50'],
        ].map(([label, v, bg]) => <div key={String(label)} className={'rounded-lg border border-stone-200 p-3 ' + bg}>
          <div className="text-xs text-stone-600">{label}</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{money(v)}</div>
          <div className="text-xs text-stone-500">บาท</div>
        </div>)}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[16rem] bg-stone-100 px-3 py-2">รายการ (บาท)</th>
              {cols.map(c => <th key={c.key} scope="col" className={'min-w-[9.5rem] px-3 py-2 text-right ' + (c.key === 'all' ? 'bg-teal-50 text-teal-900' : '')}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {sections.map(sec => <Fragment key={sec.title}>
              <tr><td colSpan={cols.length + 1} className="bg-stone-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{sec.title}</td></tr>
              {sec.rows.map(r => <tr key={r.label} className="border-t border-stone-100">
                <th scope="row" className={'sticky left-0 bg-white px-3 py-2 text-left font-normal ' + (r.strong ? 'font-semibold ' : '') + (r.indent ? 'pl-8 text-stone-700 ' : '') + (r.tone || '')}>
                  {r.label}{r.hint && <div className="text-xs font-normal text-stone-500">{r.hint}</div>}
                </th>
                {cols.map(c => <td key={c.key} className={'px-3 py-2 text-right tabular-nums ' + (r.strong ? 'font-semibold ' : '') + (c.key === 'all' ? 'bg-teal-50/40 ' : '') + (r.tone || '')}>{r.get(c)}</td>)}
              </tr>)}
            </Fragment>)}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-2 text-xs text-stone-500"><Info size={14} className="mt-0.5 shrink-0" />การคำนวณตัดทศนิยมลง ไม่ปัดขึ้น กลุ่มคือกลุ่มจ่ายเงิน (pay group) ของตำแหน่ง ตัวเลขเงินเพิ่มและเงินเหลือยกไปจะเปลี่ยนเมื่อกรรมการส่งกลับหรือไม่อนุมัติกิจกรรม</p>
    </section>
  </div>
}
