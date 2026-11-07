import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Download, Info } from 'lucide-react'
import { money, num } from './utils'
import { downloadXlsx, type XCell } from './xlsxExport'

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

  type RowSpec = { label: string; hint?: string; indent?: boolean; strong?: boolean; kind: 'money' | 'int' | 'rate'; get: (c: Col) => number | null }
  type Section = { code: string; title: string; rows: RowSpec[] }
  const r2 = (n: number) => Math.round(n * 100) / 100
  const sections: Section[] = [
    { code: 'ก', title: 'วงเงินที่ได้รับ', rows: [
      { label: 'จำนวนผู้ปฏิบัติงานทั้งหมด (คน)', kind: 'int', get: c => c.nTotal },
      { label: 'ผู้มีสิทธิ์ในเดือน (คน)', kind: 'int', indent: true, get: c => c.nEligible },
      { label: 'ผู้ไม่มีสิทธิ์ในเดือน (คน)', kind: 'int', indent: true, get: c => c.nIneligible },
      { label: 'วงเงินที่ได้รับทั้งหมดในเดือน (เงิน 100%)', kind: 'money', strong: true, hint: 'วงเงินต่อคน x จำนวนผู้ปฏิบัติงานทั้งหมด', get: c => r2(c.total100) },
      { label: 'เงินยกยอดจากเดือนก่อน', kind: 'money', hint: isOctober ? 'เดือนตุลาคม 2569 ไม่นำยอดยกมารวมในกองกลาง' : undefined, get: c => r2(c.carryIn) },
    ] },
    { code: 'ข', title: 'เงินกองกลาง', rows: [
      { label: 'เงินกัน 3%', kind: 'money', hint: isOctober ? 'เดือนตุลาคม 2569 ไม่หักเงินกัน 3%' : 'คิดจากผู้มีสิทธิ์ทุกคน', get: c => r2(c.reserve) },
      { label: 'เงินของผู้ที่ไม่มีสิทธิ์ในเดือน', kind: 'money', hint: 'วงเงินเต็มของผู้ที่ไม่มีสิทธิ์', get: c => r2(c.ineligible) },
      { label: 'เงินเพิ่มจากผู้ที่คะแนนไม่ถึงเกณฑ์', kind: 'money', hint: 'ส่วนต่างระหว่างเงินเต็มกับเงินที่จ่ายผู้ที่แต้มไม่ถึงเกณฑ์', get: c => r2(c.belowDiff) },
      { label: 'รวมเงินกองกลาง', kind: 'money', strong: true, hint: 'ผลรวม 3 รายการข้างต้น (ไม่รวมเงินยกยอด)', get: c => r2(c.commonPool) },
      { label: 'เงินกองกลางรวมเงินยกยอด (นำไปแบ่งเป็นเงินเพิ่ม)', kind: 'money', strong: true, get: c => r2(c.poolDistributable) },
    ] },
    { code: 'ค', title: 'ยอดจัดสรร', rows: [
      { label: 'เงินจ่ายตามผลการปฏิบัติงาน', kind: 'money', get: c => r2(c.activityPaid) },
      { label: 'เงินเพิ่มจากแต้มส่วนเกิน', kind: 'money', get: c => r2(c.extraPaid) },
      { label: 'เงินเหลือยกไปเดือนถัดไป', kind: 'money', get: c => r2(c.carryOut) },
      { label: 'รวมจัดสรรและยกไป', kind: 'money', strong: true, hint: 'ควรเท่ากับ วงเงิน 100% + เงินยกยอด', get: c => r2(c.activityPaid + c.extraPaid + c.carryOut) },
    ] },
    { code: 'ง', title: 'เกณฑ์การแบ่งเงินเพิ่ม', rows: [
      { label: 'ผู้ที่คะแนนไม่ถึงเกณฑ์ (คน)', kind: 'int', get: c => c.nBelow },
      { label: 'ผู้ที่คะแนนเกินเกณฑ์ (คน)', kind: 'int', get: c => c.nAbove },
      { label: 'แต้มส่วนเกินรวม', kind: 'money', get: c => r2(c.sumExcess) },
      { label: 'อัตราเงินเพิ่มต่อแต้ม (บาท/แต้ม)', kind: 'rate', hint: isOctober ? 'เดือนตุลาคม 2569 แบ่งเท่ากันต่อคน ไม่คิดตามแต้ม' : 'ภาพรวม = ค่าเฉลี่ยถ่วงน้ำหนักของทุกกลุ่ม', get: c => (isOctober || c.rate <= 0) ? null : c.rate },
    ] },
    { code: 'จ', title: 'ตรวจสมดุล', rows: [
      { label: 'ผลต่าง (วงเงิน + ยกยอด - จัดสรร - เหลือยกไป)', kind: 'money', hint: 'ควรเป็น 0.00', get: c => r2(c.balanceDiff) },
    ] },
  ]

  const fmt = (r: RowSpec, c: Col) => { const v = r.get(c); return v === null ? '—' : r.kind === 'money' ? money(v) : r.kind === 'int' ? num(v, 0) : num(v, 4) }
  const splitName = (name: string) => { const m = name.match(/^(กลุ่ม\s*\d+)\s*(.*)$/); return m ? { short: m[1], rest: m[2] } : { short: name, rest: '' } }

  const exportExcel = () => {
    const nCol = cols.length + 2 // รายการ + คอลัมน์ข้อมูล + หมายเหตุ
    const lastCol = String.fromCharCode(64 + nCol)
    const blank = (n: number): XCell[] => Array.from({ length: n }, () => ({ v: null }))
    const rows: XCell[][] = []
    const merges: string[] = []
    const rowHeights: Record<number, number> = {}
    rows.push([{ v: `วงเงินและยอดจัดสรร P4P ประจำเดือน${monthText}`, s: 'title' }, ...blank(nCol - 1)]); merges.push(`A1:${lastCol}1`); rowHeights[1] = 26
    rows.push([{ v: `ภาพรวมทั้งหมดและจำแนกตามกลุ่มจ่ายเงิน · ${closed ? 'งวดปิดแล้ว (ผลที่บันทึกไว้)' : 'ผลคำนวณล่าสุด (ยังไม่ปิดงวด)'} · ส่งออกเมื่อ ${new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`, s: 'subtitle' }, ...blank(nCol - 1)]); merges.push(`A2:${lastCol}2`)
    rows.push(blank(nCol))
    const headerRow = rows.length + 1
    rows.push([{ v: 'รายการ (หน่วย: บาท)', s: 'header' }, ...cols.map(c => c.key === 'all'
      ? { v: c.name, s: 'headerAll' as const }
      : { v: (() => { const n = splitName(c.name); return n.rest ? `${n.short}\n${n.rest}` : n.short })(), s: 'header' as const }), { v: 'หมายเหตุ', s: 'header' }])
    rowHeights[headerRow] = 78
    for (const sec of sections) {
      const r = rows.length + 1
      rows.push([{ v: `${sec.code}. ${sec.title}`, s: 'section' }, ...blank(nCol - 1).map(() => ({ v: null, s: 'section' as const }))]); merges.push(`A${r}:${lastCol}${r}`)
      sec.rows.forEach((row, idx) => {
        rows.push([
          { v: `${sec.code}.${idx + 1} ${row.label}`, s: row.strong ? 'labelStrong' : row.indent ? 'labelIndent' : 'label' },
          ...cols.map((c): XCell => {
            const v = row.get(c)
            if (v === null) return { v: '—', s: 'center' }
            return { v, s: row.kind === 'money' ? (row.strong ? 'moneyStrong' : 'money') : row.kind === 'int' ? 'int' : 'rate' }
          }),
          { v: row.hint || '', s: 'note' },
        ])
      })
    }
    rows.push(blank(nCol))
    const noteRow = rows.length + 1
    rows.push([{ v: 'หมายเหตุ: การคำนวณตัดทศนิยมลง ไม่ปัดขึ้น กลุ่ม = กลุ่มจ่ายเงิน (pay group) ของตำแหน่ง ตัวเลขเปลี่ยนตามผลการตรวจ รับรอง และส่งกลับกิจกรรมของกรรมการ', s: 'subtitle' }, ...blank(nCol - 1)]); merges.push(`A${noteRow}:${lastCol}${noteRow}`)
    downloadXlsx({
      sheetName: 'วงเงินและยอดจัดสรร', rows, merges, rowHeights,
      colWidths: [52, 20, ...cols.slice(1).map(() => 20), 46],
      freeze: { row: headerRow, col: 1 },
    }, `วงเงินและยอดจัดสรร_P4P_${month}.xlsx`)
  }

  const Card = ({ title, value, tone = 'bg-white', children, className = '' }: { title: string; value: number; tone?: string; children?: any; className?: string }) =>
    <div className={`rounded-lg border border-stone-200 p-3 ${tone} ${className}`}>
      <div className="text-xs font-semibold text-stone-600">{title}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{money(value)} <span className="text-xs font-normal text-stone-500">บาท</span></div>
      {children}
    </div>
  const SubLine = ({ dot, label, value }: { dot: string; label: string; value: number }) =>
    <div className="flex items-center justify-between gap-2 border-t border-teal-100 py-1.5 text-sm">
      <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{label}</span>
      <b className="tabular-nums">{money(value)}</b>
    </div>

  return <div className="space-y-4">
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">วงเงินและยอดจัดสรร ประจำเดือน{monthText}</h3>
          <p className="text-sm text-stone-600">สรุปจากผลคำนวณล่าสุดของงวดนี้{closed ? ' (งวดปิดแล้ว ใช้ผลที่บันทึกไว้)' : ' (เปลี่ยนตามผลการตรวจ รับรอง และส่งกลับกิจกรรม)'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unbalanced
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800"><AlertTriangle size={15} />ยอดไม่สมดุล ต่างกัน {money(all.balanceDiff)} บาท</span>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800"><CheckCircle2 size={15} />ยอดสมดุล</span>}
          <button type="button" className="btn" onClick={exportExcel}><Download size={15} />ส่งออก Excel</button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-bold text-teal-900">ก. วงเงินที่ได้รับ (ภาพรวมทั้งหมด)</h4>
        <div className="grid gap-2 md:grid-cols-3">
          <Card title="วงเงินที่ได้รับทั้งหมดในเดือน (เงิน 100%)" value={all.total100} tone="bg-stone-50">
            <div className="mt-1 text-xs text-stone-500">ผู้ปฏิบัติงาน {num(all.nTotal, 0)} คน (มีสิทธิ์ {num(all.nEligible, 0)} / ไม่มีสิทธิ์ {num(all.nIneligible, 0)})</div>
          </Card>
          <Card title="เงินยกยอดจากเดือนก่อน" value={all.carryIn} tone="bg-stone-50">
            {isOctober && <div className="mt-1 text-xs text-stone-500">เดือนตุลาคม 2569 ไม่นำยอดยกมารวม</div>}
          </Card>
          <Card title="เงินกองกลาง" value={all.commonPool} tone="bg-teal-50 border-teal-200">
            <div className="mt-2">
              <SubLine dot="bg-teal-600" label={isOctober ? 'เงินกัน 3% (ไม่หักเดือนนี้)' : 'เงินกัน 3%'} value={all.reserve} />
              <SubLine dot="bg-stone-500" label="เงินของผู้ที่ไม่มีสิทธิ์ในเดือน" value={all.ineligible} />
              <SubLine dot="bg-amber-500" label="เงินเพิ่มจากผู้ที่คะแนนไม่ถึงเกณฑ์" value={all.belowDiff} />
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-bold text-teal-900">ค. ยอดจัดสรร (ภาพรวมทั้งหมด)</h4>
        <div className="grid gap-2 md:grid-cols-3">
          <Card title="เงินจ่ายตามผลการปฏิบัติงาน" value={all.activityPaid} tone="bg-emerald-50 border-emerald-200" />
          <Card title="เงินเพิ่มจากแต้มส่วนเกิน" value={all.extraPaid} tone="bg-sky-50 border-sky-200">
            <div className="mt-1 text-xs text-stone-600">แต้มส่วนเกินรวม {num(all.sumExcess, 2)} แต้ม · อัตราเงินเพิ่มต่อแต้ม {isOctober ? 'แบ่งเท่ากันต่อคน' : all.rate > 0 ? `${num(all.rate, 4)} บาท/แต้ม` : '—'}</div>
          </Card>
          <Card title="เงินเหลือยกไปเดือนถัดไป" value={all.carryOut} tone="bg-amber-50 border-amber-200" />
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-bold text-teal-900">ตารางสรุป ภาพรวมและจำแนกตามกลุ่ม</h4>
        <div className="overflow-x-auto rounded-lg border border-stone-300">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-teal-700 text-white">
                <th scope="col" className="sticky left-0 z-10 min-w-[18rem] bg-teal-700 px-3 py-2 text-left">รายการ (บาท)</th>
                {cols.map(c => { const n = splitName(c.name); return <th key={c.key} scope="col" className={'min-w-[10rem] px-3 py-2 text-right align-bottom ' + (c.key === 'all' ? 'bg-teal-900' : '')}>
                  <div className="font-bold">{c.key === 'all' ? c.name : n.short}</div>
                  {c.key !== 'all' && n.rest && <div className="text-[11px] font-normal leading-tight opacity-90">{n.rest}</div>}
                </th> })}
              </tr>
            </thead>
            {sections.map(sec => <tbody key={sec.code}>
              <tr><th colSpan={cols.length + 1} scope="colgroup" className="sticky left-0 bg-teal-100 px-3 py-1.5 text-left text-sm font-bold text-teal-950">{sec.code}. {sec.title}</th></tr>
              {sec.rows.map((r, idx) => <tr key={r.label} className={'border-t border-stone-200 ' + (r.strong ? 'bg-stone-50' : '')}>
                <th scope="row" className={'sticky left-0 px-3 py-2 text-left font-normal ' + (r.strong ? 'bg-stone-50 font-semibold ' : 'bg-white ') + (r.indent ? 'pl-9 text-stone-700' : '')}>
                  <span className="mr-1.5 text-xs text-stone-400">{sec.code}.{idx + 1}</span>{r.label}
                  {r.hint && <div className="text-xs font-normal text-stone-500">{r.hint}</div>}
                </th>
                {cols.map(c => <td key={c.key} className={'px-3 py-2 text-right tabular-nums ' + (r.strong ? 'font-semibold ' : '') + (c.key === 'all' ? 'border-x border-teal-200 bg-teal-50/60' : '')}>{fmt(r, c)}</td>)}
              </tr>)}
            </tbody>)}
          </table>
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-stone-500"><Info size={14} className="mt-0.5 shrink-0" />การคำนวณตัดทศนิยมลง ไม่ปัดขึ้น กลุ่ม = กลุ่มจ่ายเงิน (pay group) ของตำแหน่ง ตัวเลขเปลี่ยนตามผลการตรวจ รับรอง และส่งกลับกิจกรรมของกรรมการ</p>
    </section>
  </div>
}
