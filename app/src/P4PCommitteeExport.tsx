import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, X } from 'lucide-react'
import { downloadXlsxWorkbook, type SheetSpec, type XCell } from './committee/xlsxExport'
import { monthLabel } from './committee/utils'

type ReportKey = 'all' | 'ready' | 'returned' | 'notready' | 'checked' | 'allocation'
const REPORTS: { key: ReportKey; label: string; detail: string }[] = [
  { key: 'all', label: 'รายงานทั้งหมด', detail: 'ทุกหน่วยงานและสถานะล่าสุด พร้อมประวัติแยกต่างหาก' },
  { key: 'ready', label: 'พร้อมตรวจ', detail: 'หน่วยงานที่ส่งผลงานครบและไม่มีรายการค้างรับรอง' },
  { key: 'returned', label: 'รอแก้ไข', detail: 'ผู้ถูกส่งกลับและรายการที่ยังอยู่ระหว่างแก้ไข แยกแท็บตามหน่วยงาน' },
  { key: 'notready', label: 'ยังไม่พร้อม', detail: 'ผู้ยังไม่ส่งผลงานและผู้ที่ยังค้างรับรอง แยกประเภท' },
  { key: 'checked', label: 'ตรวจแล้ว', detail: 'เฉพาะหน่วยงานที่กรรมการตรวจครบทุกคนและทุกรายการ' },
  { key: 'allocation', label: 'ผลการจัดสรรเพื่อเผยแพร่บุคลากร', detail: 'สรุปผลตามตารางสรุปหน่วยงาน แยกชีตหน่วยงาน พร้อมสารบัญกดไปยังแต่ละหน่วยงาน' },
]
const cell = (v: any, s: XCell['s'] = 'label'): XCell => ({ v: v == null ? '' : String(v), s })
const numericCell = (v: any, s: XCell['s'] = 'int'): XCell => ({ v: Number(v || 0), s })
const scoreCell = (v: any): XCell => {
  const n = Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100
  return { v: n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }), s: 'rate' }
}
const thaiBahtText = (value: number) => {
  const digits = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า']
  const units = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน']
  const group = (n: number): string => {
    if (!n) return ''
    const str = String(n); let out = ''
    for (let i = 0; i < str.length; i++) {
      const d = Number(str[i]), pos = str.length - i - 1
      if (!d) continue
      if (pos === 0 && d === 1 && str.length > 1) out += 'เอ็ด'
      else if (pos === 1 && d === 2) out += 'ยี่'
      else if (pos === 1 && d === 1) out += ''
      else out += digits[d]
      out += units[pos]
    }
    return out
  }
  const read = (n: number): string => n >= 1000000 ? read(Math.floor(n / 1000000)) + 'ล้าน' + group(n % 1000000) : group(n)
  const amount = Math.round(Math.max(0, Number(value) || 0) * 100) / 100
  const baht = Math.floor(amount), satang = Math.round((amount - baht) * 100)
  return read(baht) + 'บาท' + (satang ? read(satang) + 'สตางค์' : 'ถ้วน')
}
const dateTH = (v: any) => v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('th-TH') : '—'
const sheet = (sheetName: string, title: string, month: string, headers: string[], rows: any[][], widths: number[]): SheetSpec => ({
  sheetName,
  rows: [[{ v: title, s: 'title' }], [{ v: `โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน · เดือน${monthLabel(month)} · ส่งออกเมื่อ ${new Date().toLocaleString('th-TH')}`, s: 'subtitle' }], headers.map(x => cell(x, 'header')), ...rows.map(r => r.map((v, i) => cell(v, i === 0 ? 'labelStrong' : 'label')))],
  colWidths: widths, freeze: { row: 3, col: 0 }
})

export default function P4PCommitteeExport({ open, onClose, onPrepare, month, units = [], lines = [], groups = [], statusRows = [], returnedPeopleByUnit, positions = [], scoreBreakdown, unitMeta = [], closed = false }: any) {
  const [selected, setSelected] = useState<ReportKey>('all')
  const [prepared, setPrepared] = useState<{ activityRows: any[]; auditHistory: any[] } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState('')
  useEffect(() => {
    if (open) {
      setSelected('all')
      setPrepared(null)
      setPrepareError('')
    }
  }, [open, month])
  const unitByKey = useMemo(() => new Map(units.map((u: any) => [Number(u.key), u])), [units])
  const personById = useMemo(() => new Map(lines.map((p: any) => [String(p.id), p])), [lines])
  const payGroupById = useMemo(() => new Map(groups.map((g: any) => [Number(g.pay_group), g])), [groups])
  const getPerson = (row: any) => personById.get(String(row.person_id)) || lines.find((p: any) => String(p.staff_directory_id) === String(row.staff_directory_id)) || {}
  const getUnit = (row: any) => {
    const person = getPerson(row)
    const id = row.unit_id ?? person.unit_id
    return unitByKey.get(Number(id)) || units.find((u: any) => String(u.group) === String(person.nursing_group)) || null
  }
  const counts = useMemo(() => {
    const ready = units.filter((u: any) => u.submitted && u.ready && !u.reviewed && u.submissionStatus !== 'returned')
    const returned = units.filter((u: any) => u.submissionStatus === 'returned' || (returnedPeopleByUnit?.get(u.key) || []).length)
    const notready = units.filter((u: any) => !u.reviewed && u.submissionStatus !== 'returned' && (!u.submitted || Number(u.pending || 0) > 0))
    const checked = units.filter((u: any) => !!u.reviewed)
    return { all: units.length, ready: ready.length, returned: returned.length, notready: notready.length, checked: checked.length, allocation: units.length }
  }, [units, returnedPeopleByUnit])
  if (!open) return null
  const activityRows = prepared?.activityRows || []
  const auditHistory = prepared?.auditHistory || []

  const unitRows = (list: any[]) => list.map((u: any) => [
    u.group, u.name, u.lines?.length || 0, u.eligible || 0, u.pending || 0, u.approved || 0, u.rejected || 0,
    u.submissionStatus === 'returned' ? 'รอแก้ไข' : u.reviewed ? 'ตรวจแล้ว' : !u.submitted ? 'ยังไม่ส่งผลงาน' : u.ready ? 'พร้อมตรวจ' : 'ยังไม่พร้อม',
    u.reviewed ? 'ตรวจแล้ว' : 'ยังไม่ตรวจ'
  ])
  const peopleRows = (list: any[]) => list.flatMap((u: any) => (u.lines || []).map((p: any) => {
    const status = statusRows.find((s: any) => String(s.person_id) === String(p.id)) || {}
    return [u.group, u.name, p.name || p.person_name, p.position, p.activity || 0, p.total || 0, status.pending || 0, status.approved || 0, status.rejected || 0, u.submissionStatus || '']
  }))
  const activityExportRows = (list: any[]) => activityRows.filter((a: any) => list.some((u: any) => {
    const target = getUnit(a); return target && Number(target.key) === Number(u.key)
  })).map((a: any) => {
    const p = getPerson(a); const u = getUnit(a)
    return [u?.group || '', u?.name || '', a.person_name || p.name, a.position || p.position, dateTH(a.work_date), a.activity_code, a.title, a.quantity ?? a.qty ?? a.amount ?? '', a.points ?? a.score ?? '', a.status, a.reject_reason || '']
  })
  const allUnits = units
  const readyUnits = units.filter((u: any) => u.submitted && u.ready && !u.reviewed && u.submissionStatus !== 'returned')
  const returnedUnits = units.filter((u: any) => u.submissionStatus === 'returned' || (returnedPeopleByUnit?.get(u.key) || []).length)
  const notReadyUnits = units.filter((u: any) => !u.reviewed && u.submissionStatus !== 'returned' && (!u.submitted || Number(u.pending || 0) > 0))
  const checkedUnits = units.filter((u: any) => !!u.reviewed)
  const specs: SheetSpec[] = []
  const safeTabName = (raw: string, used: Set<string>) => {
    const base = raw.replace(/[\\/?*:[\]]/g, ' ').trim().slice(0, 31) || 'หน่วยงาน'
    let name = base, n = 2
    while (used.has(name.toLowerCase())) { const suffix = ` (${n++})`; name = base.slice(0, 31 - suffix.length) + suffix }
    used.add(name.toLowerCase())
    return name
  }
  const addAllocationReport = () => {
    const used = new Set<string>(['00_สารบัญ'])
    const tabs = units.map((u: any) => ({ unit: u, tab: safeTabName(`U${u.key}_${u.name}`, used) }))
    const indexRows: XCell[][] = [
      [{ v: 'ลำดับ', s: 'header' }, { v: 'กลุ่มงาน', s: 'header' }, { v: 'หน่วยงาน', s: 'header' }, { v: 'บุคลากร', s: 'header' }, { v: 'มีสิทธิ์', s: 'header' }, { v: 'ถึงแต้มประกัน', s: 'header' }, { v: 'ต่ำกว่าแต้มประกัน', s: 'header' }, { v: 'ยอดจัดสรร (บาท)', s: 'header' }, { v: 'เปิดชีต', s: 'header' }],
      ...tabs.map(({ unit: u, tab }: any, i: number) => [
        numericCell(i + 1, 'center'), cell(u.group), { v: String(u.name || ''), s: 'labelStrong', hyperlink: `'${tab.replace(/'/g, "''")}'!A1` } as XCell, numericCell(u.lines?.length || 0),
        numericCell(u.eligible || 0), numericCell(u.reached || 0), numericCell(u.below || 0),
        { v: Number(u.total || 0), s: 'moneyStrong' } as XCell,
        { v: 'ดูรายละเอียด', s: 'labelStrong', hyperlink: `'${tab.replace(/'/g, "''")}'!A1` } as XCell
      ])
    ]
    specs.push({
      sheetName: '00_สารบัญ',
      rows: [
        [{ v: 'รายงานผลการจัดสรรค่าตอบแทน P4P เพื่อเผยแพร่บุคลากร', s: 'title' }],
        [{ v: `โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน · เดือน${monthLabel(month)} · คลิกชื่อหน่วยงานหรือ “ดูรายละเอียด” เพื่อเปิดชีต`, s: 'subtitle' }],
        ...indexRows
      ],
      colWidths: [9, 30, 38, 13, 12, 16, 18, 22, 18], freeze: { row: 3, col: 0 }
    })
    const round2 = (v: any) => Math.floor((Math.max(0, Number(v) || 0) + 1e-8) * 100) / 100
    const eligible = (p: any) => !!p.eligible && Number(p.work_days ?? p.days ?? 1) > 0
    for (const { unit: u, tab } of tabs) {
      const unitName = String(u.name || '')
      const groupName = String(u.group || '')
      const reportLines = (u.lines || []).filter(eligible)
      const prepared = reportLines.map((p: any) => {
        const meta = unitMeta.find((x: any) => Number(x.id) === Number(p.unit_id ?? u.key)) || {}
        const positionInfo = positions.find((x: any) => String(x.name || '').replace(/\\s+/g, '').trim() === String(p.position || '').replace(/\\s+/g, '').trim()) || {}
        const scoring = typeof scoreBreakdown === 'function'
          ? scoreBreakdown(p.position, positions, p.org_role, Number(p.points ?? p.counted ?? 0), month, meta.name || unitName)
          : null
        const payGroup = payGroupById.get(Number(p.pay_group ?? positionInfo.pay_group)) || {}
        const insurancePoints = Number(scoring?.insurance ?? positionInfo.guarantee ?? payGroup.guarantee ?? 0)
        const rolePoints = Number(scoring?.roleGuarantee ?? p.role_guarantee ?? p.roleGuarantee ?? 0)
        const workPoints = Number(scoring?.activityPoints ?? p.activity_points ?? p.points ?? p.counted ?? 0)
        const performancePoints = Number(scoring?.performance ?? p.performance_points ?? p.counted ?? (workPoints + rolePoints))
        const excessPoints = Number(scoring?.excess ?? p.excess_points ?? Math.max(0, performancePoints - insurancePoints))
        const allocation = Number(payGroup.full_amount || 0)
        // ให้เหมือนเอกสารพิมพ์สรุปรายหน่วยงานทุกช่อง
        const insurancePay = round2(allocation * 0.97 * 0.77)
        const payout = Number(p.total || 0)
        const extraPay = Math.max(0, payout - insurancePay)
        return { p, insurancePoints, rolePoints, workPoints, performancePoints, excessPoints, insurancePay, extraPay, payout }
      })
      const sum = (key: string) => prepared.reduce((v: number, x: any) => v + Number(x[key] || 0), 0)
      const pending = closed !== true
      const rows: XCell[][] = [
        [{ v: 'หลักฐานการจ่ายค่าตอบแทนตามผลการปฏิบัติงานของเจ้าหน้าที่ที่ปฏิบัติงานให้กับหน่วยบริการในสังกัดกระทรวงสาธารณสุข/แบบสรุปผลการปฏิบัติงาน', s: 'title' }],
        [{ v: `งาน${unitName.replace(/^งาน/, '')} กลุ่มงาน${groupName.replace(/^กลุ่มงาน/, '')} กลุ่มการพยาบาล ประจำเดือน ${monthLabel(month)}`, s: 'subtitle' }],
        [{ v: 'ลำดับ', s: 'header' }, { v: 'ชื่อ-สกุล', s: 'header' }, { v: 'ตำแหน่งที่ปฏิบัติงาน', s: 'header' }, { v: 'แต้มประกัน/เดือน', s: 'header' }, { v: 'จำนวนเงินประกันต่อเดือน', s: 'header' }, { v: 'ผลการปฏิบัติงาน/เดือน', s: 'header' }, { v: '', s: 'header' }, { v: 'รวมผลการปฏิบัติงาน', s: 'header' }, { v: 'แต้มที่ได้มากกว่าแต้มประกัน', s: 'header' }, { v: 'จำนวนเงินที่ได้มากกว่าแต้มประกัน', s: 'header' }, { v: 'จำนวนเงินตามผลงาน', s: 'header' }, { v: 'จำนวนเงินที่ได้รับ', s: 'header' }, { v: 'ลายมือชื่อผู้รับเงิน', s: 'header' }, { v: 'วัน/เดือน/ปีที่ได้รับเงิน', s: 'header' }],
        [{ v: '', s: 'header' }, { v: '', s: 'header' }, { v: '', s: 'header' }, { v: '', s: 'header' }, { v: '', s: 'header' }, { v: 'แต้มการันตี', s: 'header' }, { v: 'แต้มการปฏิบัติงาน', s: 'header' }, ...Array.from({ length: 7 }, () => ({ v: '', s: 'header' } as XCell))],
        ...prepared.map((x: any, i: number) => [
          numericCell(i + 1, 'center'), cell(x.p.name || x.p.person_name, 'labelStrong'), cell(x.p.position),
          scoreCell(x.insurancePoints), numericCell(x.insurancePay, 'money'), scoreCell(x.rolePoints), scoreCell(x.workPoints),
          scoreCell(x.performancePoints), scoreCell(x.excessPoints),
          pending ? cell('รอผล', 'center') : numericCell(x.extraPay, 'money'),
          pending ? cell('รอผล', 'center') : numericCell(x.insurancePay + x.extraPay, 'money'),
          pending ? cell('รอผล', 'center') : numericCell(x.payout, 'money'),
          cell(''), cell('')
        ]),
        [
          { v: 'รวม', s: 'labelStrong' }, { v: '', s: 'plain' }, { v: '', s: 'plain' },
          scoreCell(sum('insurancePoints')), numericCell(sum('insurancePay'), 'moneyStrong'),
          scoreCell(sum('rolePoints')), scoreCell(sum('workPoints')), scoreCell(sum('performancePoints')), scoreCell(sum('excessPoints')),
          pending ? cell('รอผล', 'center') : numericCell(sum('extraPay'), 'moneyStrong'),
          pending ? cell('รอผล', 'center') : numericCell(sum('insurancePay') + sum('extraPay'), 'moneyStrong'),
          pending ? cell('รอผล', 'center') : numericCell(sum('payout'), 'moneyStrong'),
          cell(''), cell('')
        ],
        [{ v: `รวม ${pending ? 'รอผล' : sum('payout').toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' บาท (' + thaiBahtText(sum('payout')) + ')'}`, s: 'labelStrong' }],
        [{ v: 'ขอรับรองว่าผู้มีรายนามข้างต้น ได้ปฏิบัติงานจริง', s: 'labelStrong' }],
        [{ v: 'ลงชื่อ ................................................  (................................................)  หัวหน้ากลุ่มงาน' }],
        [{ v: 'ลงชื่อ ........................................................  (........................................................)  กรรมการตรวจสอบค่าคะแนนผลการปฏิบัติงาน' }],
        [{ v: 'ลงชื่อ ........................................................ ผู้อนุมัติ  (นายพันธ์นพ ควรดำรงธรรม)  ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน' }]
      ]
      specs.push({
        sheetName: tab, rows,
        merges: ['A1:N1', 'A2:N2', 'F3:G3', 'A3:A4', 'B3:B4', 'C3:C4', 'D3:D4', 'E3:E4', 'H3:H4', 'I3:I4', 'J3:J4', 'K3:K4', 'L3:L4', 'M3:M4', 'N3:N4', `A${rows.length - 4}:N${rows.length - 4}`, `A${rows.length - 3}:N${rows.length - 3}`, `A${rows.length - 2}:N${rows.length - 2}`, `A${rows.length - 1}:N${rows.length - 1}`, `A${rows.length}:N${rows.length}`],
        colWidths: [8, 30, 30, 16, 22, 15, 18, 18, 22, 24, 22, 22, 22, 18], freeze: { row: 4, col: 0 }
      })
    }
  }
  const addSummary = (list: any[], name: string) => specs.push(sheet('01_สรุปหน่วยงาน', name, month,
    ['กลุ่มงาน', 'หน่วยงาน', 'บุคลากร', 'มีสิทธิ์', 'ค้างรับรอง', 'รับรองแล้ว', 'ไม่รับรอง', 'สถานะส่งผลงาน', 'สถานะตรวจ'], unitRows(list), [30, 34, 12, 12, 14, 14, 14, 22, 18]))
  const addPeople = (list: any[], name: string) => specs.push(sheet('02_รายละเอียดบุคลากร', name, month,
    ['กลุ่มงาน', 'หน่วยงาน', 'ชื่อ-นามสกุล', 'ตำแหน่ง', 'แต้มกิจกรรม', 'คะแนนรวม', 'รอรับรอง', 'รับรองแล้ว', 'ไม่รับรอง', 'สถานะหน่วยงาน'], peopleRows(list), [28, 32, 30, 28, 14, 14, 12, 12, 12, 22]))
  const addActivities = (list: any[], name: string, sheetName = '03_รายละเอียดกิจกรรม') => specs.push(sheet(sheetName, name, month,
    ['กลุ่มงาน', 'หน่วยงาน', 'ชื่อเจ้าหน้าที่', 'ตำแหน่ง', 'วันที่', 'รหัสกิจกรรม', 'ชื่อกิจกรรม', 'จำนวน', 'คะแนน', 'สถานะล่าสุด', 'เหตุผล'], activityExportRows(list), [28, 32, 30, 26, 16, 16, 42, 12, 12, 18, 48]))
  if (selected === 'allocation') {
    addAllocationReport()
  } else if (selected === 'all') {
    specs.push(sheet('00_ภาพรวม', 'ภาพรวมสถานะ P4P ทุกหน่วยงาน', month, ['สถานะ', 'จำนวนหน่วยงาน'], [
      ['พร้อมตรวจ', readyUnits.length], ['รอแก้ไข', returnedUnits.length], ['ยังไม่พร้อม', notReadyUnits.length], ['ตรวจแล้ว', checkedUnits.length], ['ทั้งหมด', allUnits.length]
    ], [32, 20]))
    addSummary(allUnits, 'รายงาน P4P ทุกสถานะ')
    addPeople(allUnits, 'รายละเอียดบุคลากรทุกสถานะ')
    addActivities(allUnits, 'รายละเอียดกิจกรรมตามสถานะล่าสุด')
    specs.push(sheet('04_ประวัติการตรวจ', 'ประวัติการส่งกลับ แก้ไข และตรวจสอบ', month,
      ['วันที่เวลา', 'ชื่อเจ้าหน้าที่', 'รหัสกิจกรรม', 'การดำเนินการ', 'สถานะเดิม', 'สถานะใหม่', 'เหตุผล'], auditHistory.map((a: any) => {
        const p = getPerson(a); const log = activityRows.find((x: any) => String(x.id) === String(a.log_id))
        return [a.created_at ? new Date(a.created_at).toLocaleString('th-TH') : '—', p.name || log?.person_name, log?.activity_code, a.action, a.old_status, a.new_status, a.reason]
      }), [22, 30, 16, 24, 16, 16, 50]))
  } else if (selected === 'ready') {
    addSummary(readyUnits, 'หน่วยงานพร้อมตรวจ')
    addPeople(readyUnits, 'บุคลากรที่พร้อมตรวจ')
    addActivities(readyUnits, 'กิจกรรมที่ผ่านการรับรองจากหัวหน้า')
  } else if (selected === 'returned') {
    specs.push(sheet('01_สรุปภาพรวม', 'รายงานรายการรอแก้ไข', month, ['กลุ่มงาน', 'หน่วยงาน', 'จำนวนบุคลากรที่รอแก้ไข'], returnedUnits.map(u => [u.group, u.name, (returnedPeopleByUnit?.get(u.key) || []).length]), [30, 36, 22]))
    specs.push(sheet('02_สถานะรายบุคคล', 'สถานะการแก้ไขรายบุคคล', month, ['กลุ่มงาน', 'หน่วยงาน', 'ชื่อเจ้าหน้าที่', 'เหตุผล', 'จำนวนกิจกรรมที่เกี่ยวข้อง'], returnedUnits.flatMap(u => (returnedPeopleByUnit?.get(u.key) || []).map((p: any) => [u.group, u.name, p.name, p.reason, (p.activities || []).length])), [28, 32, 30, 55, 22]))
    for (const u of returnedUnits) {
      const rows = (returnedPeopleByUnit?.get(u.key) || []).flatMap((p: any) => (p.activities?.length ? p.activities : [{ date: '', code: '', title: 'ส่งกลับรายบุคคล', reason: p.reason, status: 'returned' }]).map((a: any) => [p.name, dateTH(a.date), a.code, a.title, a.reason || p.reason, a.status]))
      specs.push(sheet(u.name, `รายการรอแก้ไข · ${u.name}`, month, ['ชื่อเจ้าหน้าที่', 'วันที่', 'รหัสกิจกรรม', 'กิจกรรม', 'เหตุผลที่ส่งกลับ', 'สถานะล่าสุด'], rows, [30, 16, 16, 42, 55, 18]))
    }
  } else if (selected === 'notready') {
    addSummary(notReadyUnits, 'หน่วยงานที่ยังไม่พร้อม')
    specs.push(sheet('02_ยังไม่ส่งผลงาน', 'บุคลากรที่ยังไม่ส่งผลงาน', month,
      ['กลุ่มงาน', 'หน่วยงาน', 'ชื่อเจ้าหน้าที่', 'ตำแหน่ง', 'สถานะ'], notReadyUnits.filter((u: any) => !u.submitted && u.submissionStatus !== 'returned').flatMap((u: any) => (u.lines || []).map((p: any) => [u.group, u.name, p.name, p.position, 'ยังไม่ส่งผลงาน'])), [28, 32, 30, 28, 20]))
    specs.push(sheet('03_ค้างรับรอง', 'บุคลากรที่มีรายการค้างรับรอง', month,
      ['กลุ่มงาน', 'หน่วยงาน', 'ชื่อเจ้าหน้าที่', 'ตำแหน่ง', 'จำนวนรายการค้างรับรอง'], notReadyUnits.filter((u: any) => u.submitted && Number(u.pending || 0) > 0).flatMap((u: any) => (u.lines || []).filter((p: any) => Number(p.pending || 0) > 0).map((p: any) => [u.group, u.name, p.name, p.position, p.pending])), [28, 32, 30, 28, 24]))
    addActivities(notReadyUnits, 'กิจกรรมของหน่วยงานที่ยังไม่พร้อม', '04_รายละเอียดกิจกรรม')
    for (const u of notReadyUnits) {
      const rows = (u.lines || []).filter((p: any) => !u.submitted || Number(p.pending || 0) > 0).map((p: any) => {
        const status = statusRows.find((x: any) => String(x.person_id) === String(p.id)) || {}
        return [p.name || p.person_name, p.position, !u.submitted ? 'ยังไม่ส่งผลงาน' : 'ค้างรับรอง', status.pending || p.pending || 0, status.approved || 0, status.rejected || 0]
      })
      specs.push(sheet(u.name, `ติดตามความพร้อม · ${u.name}`, month,
        ['ชื่อเจ้าหน้าที่', 'ตำแหน่ง', 'สาเหตุที่ยังไม่พร้อม', 'ค้างรับรอง', 'รับรองแล้ว', 'ไม่รับรอง'], rows, [32, 28, 24, 14, 14, 14]))
    }
  } else {
    addSummary(checkedUnits, 'หน่วยงานที่ตรวจครบแล้ว')
    addPeople(checkedUnits, 'บุคลากรในหน่วยงานที่ตรวจครบแล้ว')
    addActivities(checkedUnits, 'รายละเอียดกิจกรรมของหน่วยงานที่ตรวจครบแล้ว')
    specs.push(sheet('04_ประวัติการตรวจ', 'ประวัติการตรวจของหน่วยงานที่ตรวจครบ', month,
      ['วันที่เวลา', 'ชื่อเจ้าหน้าที่', 'รหัสกิจกรรม', 'การดำเนินการ', 'สถานะเดิม', 'สถานะใหม่', 'เหตุผล'], auditHistory.map((a: any) => {
        const p = getPerson(a); const log = activityRows.find((x: any) => String(x.id) === String(a.log_id)); const u = getUnit(log || a)
        return checkedUnits.some((x: any) => x.key === u?.key) ? [a.created_at ? new Date(a.created_at).toLocaleString('th-TH') : '—', p.name || log?.person_name, log?.activity_code, a.action, a.old_status, a.new_status, a.reason] : null
      }).filter(Boolean), [22, 30, 16, 24, 16, 16, 50]))
  }
  const count = counts[selected]
  const exportReport = async () => {
    if (!prepared) {
      setPreparing(true)
      setPrepareError('')
      try {
        const result = await onPrepare(selected)
        setPrepared(result || { activityRows: [], auditHistory: [] })
      } catch (e: any) {
        setPrepareError(e?.message || 'เตรียมข้อมูลรายงานไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        setPreparing(false)
      }
      return
    }
    downloadXlsxWorkbook(specs, `P4P_${REPORTS.find(r => r.key === selected)?.label}_${month}.xlsx`)
  }
  const current = REPORTS.find(r => r.key === selected)!
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3" role="dialog" aria-modal="true" aria-label="Export รายงาน P4P">
    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet className="text-emerald-700"/>Export รายงาน P4P</div><button type="button" className="btn sec !px-2" onClick={onClose} aria-label="ปิด"><X size={17}/></button></div>
      <p className="mt-1 text-sm text-stone-500">ประจำเดือน{monthLabel(month)} · Excel (.xlsx)</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{REPORTS.map(r => <button key={r.key} type="button" disabled={preparing} onClick={() => { setSelected(r.key); setPrepared(null); setPrepareError('') }} className={`rounded-lg border p-3 text-left ${selected === r.key ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700' : 'border-stone-200 hover:bg-stone-50'}`}><span className="font-semibold">{r.label}</span><span className="mt-1 block text-xs text-stone-600">{r.detail}</span></button>)}</div>
      <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
        <div className="flex items-center justify-between"><b>ตัวอย่างรายงาน: {current.label}</b><span className="text-sm tabular-nums text-stone-600">{count} หน่วยงาน</span></div>
        <p className="mt-1 text-sm text-stone-600">{prepared ? `เตรียมข้อมูลแล้ว · สร้าง ${specs.length} แท็บตามรายงานที่เลือก` : 'เลือกประเภทรายงานก่อน แล้วกดเตรียมข้อมูลเพื่อเริ่มดึงเฉพาะข้อมูลที่จำเป็น'}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{specs.map(s => <li key={s.sheetName}>{s.sheetName}</li>)}</ul>
      </div>
      {prepareError && <p role="alert" className="mt-3 text-sm text-red-700">{prepareError}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="btn sec" onClick={onClose}>ยกเลิก</button><button type="button" className="btn" disabled={preparing} onClick={exportReport}>{preparing ? <><Download size={16}/>กำลังเตรียมข้อมูล…</> : prepared ? <><Download size={16}/>ดาวน์โหลด Excel</> : <><Download size={16}/>เตรียมรายงานที่เลือก</>}</button></div>
    </div>
  </div>
}
