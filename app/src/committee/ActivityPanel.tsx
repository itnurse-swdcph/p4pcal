import { Fragment, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, ChevronDown, Moon, Paperclip, Printer, RotateCcw, Sun, Sunset, X, XCircle } from 'lucide-react'
import { appConfirm } from '../AppDialog'
import { num } from './utils'

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pending: { label: 'รอรับรอง', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  rejected: { label: 'ไม่อนุมัติ', cls: 'bg-red-50 text-red-800 border-red-200' },
  draft: { label: 'ร่าง', cls: 'bg-stone-100 text-stone-700 border-stone-200' }
}
const FILTERS: [string, string][] = [['all', 'ทั้งหมด'], ['approved', 'อนุมัติแล้ว'], ['pending', 'รอรับรอง'], ['rejected', 'ไม่อนุมัติ/ส่งกลับ']]
const SHIFT_ORDER = ['เช้า', 'บ่าย', 'ดึก']
const SHIFT_STYLE: Record<string, { cls: string; Icon: any }> = {
  'เช้า': { cls: 'border-amber-300 bg-amber-100 text-amber-900', Icon: Sun },
  'บ่าย': { cls: 'border-orange-300 bg-orange-100 text-orange-900', Icon: Sunset },
  'ดึก': { cls: 'border-indigo-300 bg-indigo-100 text-indigo-900', Icon: Moon }
}
// ฉบับร่างที่มีเหตุผลติดมา = กิจกรรมที่ถูกส่งกลับให้เจ้าของแก้ไข / ไม่อนุมัติ (ระบบเปลี่ยนเป็นฉบับร่างให้เจ้าของแก้ไขต่อ)
const isReturned = (r: any) => r.status === 'rejected' || (r.status === 'draft' && !!r.reject_reason)
const statusKey = (r: any) => (isReturned(r) ? 'rejected' : r.status)
const statusInfo = (r: any) => (r.status === 'draft' && r.reject_reason
  ? { label: 'ส่งกลับให้แก้ไข', cls: 'bg-red-50 text-red-800 border-red-200' }
  : STATUS[r.status] || { label: r.status, cls: 'bg-stone-100 text-stone-700 border-stone-200' })
const pt = (v: any) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateParts = (d: string) => {
  const dt = new Date(String(d).slice(0, 10) + 'T00:00:00')
  return { day: dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), sub: `${dt.toLocaleDateString('th-TH', { weekday: 'short' })} · ${dt.toLocaleDateString('th-TH', { year: 'numeric' })}` }
}

type Props = {
  sb: any
  monthDate: string
  /** บุคลากรที่ต้องการตรวจ (แถวจาก p4p_calc) หรือ null ถ้าเป็นโหมดสุ่มตรวจหน่วยงาน */
  person: any | null
  /** โหมดสุ่มตรวจ: ระบุหน่วยงานแทนบุคคล */
  randomUnitId?: number | null
  /** อนุญาตให้ส่งกลับ/ไม่อนุมัติได้หรือไม่ และเหตุผลที่ไม่อนุญาต */
  canAudit: boolean
  lockedReason: string
  onClose: () => void
  onChanged: () => void
  /** คอมโพเนนต์ใบสรุปผลงานรายบุคคล (A4 แนวนอน) จาก App — ใช้ชุดเดียวกับหน้าพิมพ์เดิม */
  PrintSheet?: any
  units?: any[]
  positions?: any[]
  /** สูตรคำนวณแต้มชุดเดียวกับหน้าสรุปผลรายบุคคลของระบบ */
  scoreBreakdown?: (position: any, positions: any[], orgRole: any, activityPoints: number, month?: string) => { insurance: number; roleGuarantee: number; activityPoints: number; performance: number; excess: number }
  /** เปิดรูปหลักฐานผ่านลิงก์ชั่วคราวจาก Storage */
  openEvidence?: (sb: any, path: string) => void
}

export default function ActivityPanel({ sb, monthDate, person, randomUnitId, canAudit, lockedReason, onClose, onChanged, PrintSheet, units, positions, scoreBreakdown, openEvidence }: Props) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<{ id: number; type: 'return_for_correction' | 'reject' } | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const personId = person && !String(person.id).startsWith('dir:') ? person.id : null
  const [printData, setPrintData] = useState<{ person: any; leave: any } | null>(null)
  const [preparingPrint, setPreparingPrint] = useState(false)
  const [personRow, setPersonRow] = useState<any>(null)
  const [evidencePaths, setEvidencePaths] = useState<Record<string, string>>({})
  const [activityDefinitions, setActivityDefinitions] = useState<Record<string, any>>({})

  // กด Esc เพื่อปิดหน้าต่าง (ไม่ปิดขณะเปิดตัวอย่างพิมพ์อยู่)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !printData) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, printData])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true); setError('')
      const select = 'id,person_id,person_name,position,unit_id,work_date,shift,activity_code,title,uom,minutes,rate,domain,qty,points,counted_points,status,evidence,reject_reason'
      let q = sb.from('v_logs').select(select).eq('month', monthDate)
      if (randomUnitId != null) q = q.eq('unit_id', randomUnitId).eq('status', 'approved').limit(300)
      else if (personId) q = q.eq('person_id', personId).order('work_date').order('id').range(0, 999)
      else { setRows([]); setLoading(false); return }
      const { data, error: e } = await q
      if (!alive) return
      let list: any[] = data || []
      if (e) setError(e.message || 'ไม่สามารถโหลดกิจกรรมได้')
      else {
        if (randomUnitId != null) list = [...list].sort(() => Math.random() - 0.5).slice(0, 5)
        setRows(list)
      }
      setLoading(false)
      if (e) return
      // โหลดข้อมูลเสริมแยกจากรายการหลัก เพื่อให้รายการแสดงทันที และไม่ล้มทั้งแผงหากส่วนนี้โหลดไม่ได้
      try {
        const codes = [...new Set(list.map((r: any) => String(r.activity_code || '')).filter(Boolean))]
        if (codes.length) {
          const { data: definitions } = await sb.from('activities').select('code,uom,minutes,definition').in('code', codes)
          if (alive) setActivityDefinitions(Object.fromEntries((definitions || []).map((a: any) => [String(a.code), a])))
        } else if (alive) setActivityDefinitions({})
        const paths: Record<string, string> = {}
        const ids = list.map((r: any) => r.id)
        for (let i = 0; i < ids.length; i += 200) {
          const { data: ev } = await sb.from('logs').select('id,evidence_image_path').in('id', ids.slice(i, i + 200)).not('evidence_image_path', 'is', null)
          ;(ev || []).forEach((x: any) => { if (x.evidence_image_path) paths[String(x.id)] = x.evidence_image_path })
        }
        if (alive) setEvidencePaths(paths)
        if (personId) {
          // people ไม่มีคอลัมน์ org_role (อยู่ที่ staff_directory) จึงดึงแยก เพื่อไม่ให้เกิด 400
          const { data: pr } = await sb.from('people').select('position,unit_id,staff_directory_id').eq('id', personId).maybeSingle()
          let orgRole: string | undefined
          if (pr?.staff_directory_id != null) {
            const { data: sd } = await sb.from('staff_directory').select('org_role').eq('source_row', pr.staff_directory_id).maybeSingle()
            orgRole = sd?.org_role
          }
          if (alive) setPersonRow(pr ? { ...pr, org_role: orgRole } : null)
        }
      } catch { /* ไม่แสดงปุ่มหลักฐาน/ใช้ค่าเริ่มต้นของการ์ดแต้ม */ }
    }
    load()
    return () => { alive = false }
  }, [sb, monthDate, personId, randomUnitId])

  const counts = useMemo(() => rows.reduce((a: any, r: any) => { const k = statusKey(r); a[k] = (a[k] || 0) + 1; return a }, {}), [rows])
  // เรียงตามวันที่ → เวร (เช้า/บ่าย/ดึก) → ลำดับบันทึก
  const sorted = useMemo(() => [...rows].sort((a, b) => String(a.work_date).localeCompare(String(b.work_date))
    || (SHIFT_ORDER.indexOf(a.shift) + 1 || 9) - (SHIFT_ORDER.indexOf(b.shift) + 1 || 9) || Number(a.id) - Number(b.id)), [rows])
  const shown = filter === 'all' ? sorted : sorted.filter(r => statusKey(r) === filter)
  const shownApprovedTotal = shown.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.counted_points ?? r.points ?? 0), 0)
  const totalCounted = rows.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.counted_points ?? r.points ?? 0), 0)

  const approvedCount = counts.approved || 0
  // การ์ดสรุปแต้ม: ใช้สูตรเดียวกับหน้าสรุปผลรายบุคคล (นับเฉพาะกิจกรรมที่อนุมัติแล้ว)
  const score = person && scoreBreakdown && positions && positions.length
    ? scoreBreakdown(person.position || personRow?.position, positions, person.org_role ?? personRow?.org_role, totalCounted, monthDate.slice(0, 7)) : null
  const scoreCards: { label: string; value: string; note?: string; strong?: boolean }[] = score ? [
    { label: 'แต้มประกัน', value: num(score.insurance) },
    { label: 'แต้มการันตี', value: num(score.roleGuarantee) },
    { label: 'แต้มการปฏิบัติงาน', value: num(score.activityPoints), note: `จากกิจกรรมที่อนุมัติแล้ว ${num(approvedCount, 0)} รายการ` },
    { label: 'รวมแต้มทั้งหมด', value: num(score.performance), strong: true,
      note: score.insurance > 0 ? (score.performance + 0.005 >= score.insurance ? `ถึงแต้มประกัน (ส่วนเกิน ${num(score.performance - score.insurance)})` : `ต่ำกว่าแต้มประกัน ${num(score.insurance - score.performance)}`) : undefined }
  ] : []
  // เตรียมข้อมูลใบสรุปรายบุคคล: ข้อมูลบุคคล + วันลา (ผ่านฟังก์ชันที่ตรวจสิทธิ์กรรมการ) แล้วเปิดตัวอย่างพิมพ์
  const openPrint = async () => {
    if (!person || !personId || !PrintSheet) return
    setPreparingPrint(true); setError(''); setNotice('')
    try {
      const { data: prow } = await sb.from('people').select('*').eq('id', personId).maybeSingle()
      const staffId = person.staff_directory_id ?? person.directory_source_row ?? prow?.staff_directory_id
      let leave = { personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }
      if (staffId != null) {
        const { data, error: e } = await sb.rpc('p4p_committee_person_leave', { p_staff_directory_id: Number(staffId), p_month: monthDate })
        if (e) throw new Error('โหลดวันลาไม่สำเร็จ จึงยังไม่เปิดใบพิมพ์เพื่อไม่ให้ตัวเลขวันลาผิดพลาด: ' + (e.message || ''))
        if (data) leave = data
      }
      setPrintData({
        leave,
        person: {
          ...(prow || {}), ...person, id: personId,
          name: person.name || prow?.name, position: person.position || prow?.position,
          org_role: prow?.org_role ?? person.org_role,
          unit_id: prow?.unit_id ?? person.unit_id ?? rows[0]?.unit_id,
          sub_unit: prow?.sub_unit ?? person.sub_unit,
          staff_directory_id: staffId
        }
      })
    } catch (e: any) { setError(e?.message || 'เปิดใบสรุปรายบุคคลไม่สำเร็จ') }
    finally { setPreparingPrint(false) }
  }

  const submit = async () => {
    if (!open) return
    const text = reason.trim()
    if (text.length < 5) { setError('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร เพื่อให้เจ้าของกิจกรรมทราบว่าต้องแก้ไขอะไร'); return }
    const isReturn = open.type === 'return_for_correction'
    const row = rows.find(r => r.id === open.id)
    if (!(await appConfirm(`${isReturn ? 'ส่งกิจกรรมกลับให้แก้ไข' : 'ไม่อนุมัติกิจกรรม'}\n"${row?.title || row?.activity_code}"\nของ ${row?.person_name || person?.name || ''}\n\nระบบจะแจ้งเตือนเจ้าของกิจกรรมพร้อมเหตุผลที่ระบุ`, isReturn ? 'ยืนยันส่งกลับแก้ไข' : 'ยืนยันไม่อนุมัติ'))) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: e } = await sb.rpc('p4p_committee_audit_activity', { p_log_id: open.id, p_action: open.type, p_reason: text })
      if (e) throw new Error([e.message, (e as any).details, (e as any).hint].filter(Boolean).join(' · ') || 'บันทึกผลตรวจสอบไม่สำเร็จ')
      if (data?.ok === false) throw new Error(data?.reason || 'ไม่สามารถบันทึกผลตรวจสอบได้')
      const newStatus = data?.new_status || (isReturn ? 'pending' : 'rejected')
      setRows(rs => rs.map(r => r.id === open.id ? { ...r, status: newStatus, reject_reason: text } : r))
      setNotice(isReturn
        ? 'ส่งกลับให้แก้ไขแล้ว และแจ้งเตือนเจ้าของกิจกรรมเรียบร้อย'
        : 'บันทึกไม่อนุมัติแล้ว และแจ้งเตือนเจ้าของกิจกรรมเรียบร้อย')
      setOpen(null); setReason('')
      onChanged()
    } catch (e: any) { setError(e?.message || 'บันทึกผลตรวจสอบไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/45" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label="กิจกรรมรายบุคคล" className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-teal-800">{randomUnitId != null ? 'สุ่มตรวจกิจกรรมที่อนุมัติแล้ว 5 รายการ' : 'ตรวจกิจกรรมรายบุคคล'}</div>
          <h2 className="truncate text-lg font-bold text-stone-900">{person?.name || 'หน่วยงานที่เลือก'}</h2>
          {person && <p className="text-xs text-stone-600">{person.position || '—'} · {person.unit_name || '—'}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {person && PrintSheet && <button type="button" className="btn !py-2" disabled={!personId || loading || preparingPrint || approvedCount === 0}
            title={approvedCount === 0 ? 'พิมพ์ได้เมื่อมีกิจกรรมที่อนุมัติแล้ว' : 'พิมพ์เฉพาะกิจกรรมที่รับรองแล้ว (A4 แนวนอน)'} onClick={openPrint}>
            <Printer size={16} className="mr-1 inline -mt-0.5" />{preparingPrint ? 'กำลังเตรียม…' : 'พิมพ์ใบสรุปรายบุคคล'}</button>}
          <button type="button" aria-label="ปิดหน้าต่าง" title="ปิดหน้าต่าง (Esc)" onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-stone-400 bg-stone-100 px-3 py-2 text-sm font-bold text-stone-900 shadow-sm transition hover:border-red-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500">
            <X size={20} strokeWidth={3} />ปิด</button>
        </div>
      </header>

      <div className="space-y-3 overflow-y-auto p-4">
        {!canAudit && <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>{lockedReason}</span></div>}
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><BellRing size={16} className="mt-0.5 shrink-0" /><span>{notice}</span></div>}

        {randomUnitId == null && scoreCards.length > 0 && <div className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="สรุปแต้มรายบุคคล">
          {scoreCards.map(c => <div key={c.label} className={'rounded-xl border p-3 ' + (c.strong ? 'border-teal-300 bg-teal-50' : 'border-stone-200 bg-white')}>
            <div className="text-xs text-stone-600">{c.label}</div>
            <div className={'mt-1 text-2xl font-bold tabular-nums ' + (c.strong ? 'text-teal-800' : 'text-stone-900')}>{c.value}</div>
            {c.note && <div className="mt-0.5 text-[11px] leading-snug text-stone-500">{c.note}</div>}
          </div>)}
        </div>}

        {randomUnitId == null && <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">{FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)}
            className={'rounded-full border px-3 py-1 text-xs font-semibold ' + (filter === k ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50')}>
            {l} {k === 'all' ? rows.length : counts[k] || 0}</button>)}</div>
          <div className="text-xs text-stone-600">คะแนนที่นับได้ (อนุมัติแล้ว) <b className="text-stone-900">{num(totalCounted)}</b></div>
        </div>}

        {loading ? <p className="py-8 text-center text-sm text-stone-500">กำลังโหลดกิจกรรม…</p>
          : !personId && randomUnitId == null ? <p className="py-8 text-center text-sm text-stone-500">บุคลากรคนนี้ยังไม่มีบัญชีบันทึกกิจกรรมในระบบ</p>
          : !shown.length ? <p className="py-8 text-center text-sm text-stone-500">ไม่พบกิจกรรมตามเงื่อนไขที่เลือก</p>
          : <div className="overflow-x-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm" aria-label="รายการกิจกรรม">
              <thead>
                <tr className="text-left text-xs font-bold text-stone-700">
                  <th className="sticky top-0 z-10 w-[104px] border-b-2 border-stone-300 bg-stone-100 px-3 py-2">วันที่</th>
                  <th className="sticky top-0 z-10 w-[84px] border-b-2 border-stone-300 bg-stone-100 px-3 py-2 text-center">เวร</th>
                  <th className="sticky top-0 z-10 border-b-2 border-stone-300 bg-stone-100 px-3 py-2">กิจกรรม</th>
                  <th className="sticky top-0 z-10 w-[96px] border-b-2 border-stone-300 bg-stone-100 px-3 py-2 text-right">จำนวน</th>
                  <th className="sticky top-0 z-10 w-[112px] border-b-2 border-stone-300 bg-teal-50 px-3 py-2 text-right text-teal-900">แต้มที่ได้</th>
                  <th className="sticky top-0 z-10 w-[112px] border-b-2 border-stone-300 bg-stone-100 px-3 py-2 text-center">สถานะ</th>
                  <th className="sticky top-0 z-10 w-[150px] border-b-2 border-stone-300 bg-stone-100 px-3 py-2 text-center">ตรวจสอบ</th>
                </tr>
              </thead>
              <tbody>{(() => {
                let prevDate = ''; let dayIndex = -1
                return shown.map((r, i) => {
                  const dateKey = String(r.work_date).slice(0, 10)
                  if (dateKey !== prevDate) { dayIndex += 1; prevDate = dateKey }
                  const band = dayIndex % 2 === 0 ? 'bg-white' : 'bg-stone-50'
                  const dateTop = i > 0 && String(shown[i - 1].work_date).slice(0, 10) !== dateKey ? 'border-t-2 border-t-stone-300' : 'border-t border-t-stone-200'
                  const dp = dateParts(r.work_date)
                  const shiftStyle = SHIFT_STYLE[r.shift] || { cls: 'border-stone-300 bg-stone-100 text-stone-800', Icon: null }
                  const ShiftIcon = shiftStyle.Icon
                  const st = statusInfo(r)
                  const form = open && open.id === r.id ? open : null
                  const isOpen = !!expanded[r.id] || !!form
                  const definition = activityDefinitions[String(r.activity_code)]
                  const baseMinutes = Number(definition?.minutes ?? r.minutes ?? 0)
                  const positionName = person?.position || personRow?.position || r.position || ''
                  const positionRate = Number((positions || []).find((p: any) => String(p.name || '').trim() === String(positionName).trim())?.rate ?? r.rate ?? 0)
                  const pointsPerUnit = baseMinutes * positionRate
                  const counted = Number(r.counted_points ?? r.points ?? 0)
                  const raw = Number(r.points ?? counted)
                  const cut = raw - counted
                  const ptsCls = r.status === 'approved' ? 'text-teal-800' : r.status === 'pending' ? 'text-amber-700' : 'text-stone-400 line-through'
                  const cell = `${band} ${dateTop} px-3 py-2 align-top`
                  return <Fragment key={r.id}>
                    <tr>
                      <td className={cell}>
                        <div className="text-base font-bold leading-tight text-stone-900">{dp.day}</div>
                        <div className="text-[11px] leading-tight text-stone-500">{dp.sub}</div>
                      </td>
                      <td className={cell + ' text-center'}>
                        {r.shift ? <span className={'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ' + shiftStyle.cls}>{ShiftIcon && <ShiftIcon size={13} aria-hidden="true" />}{r.shift}</span> : <span className="text-stone-400">—</span>}
                      </td>
                      <td className={cell}>
                        {randomUnitId != null && <div className="text-xs font-bold text-stone-700">{r.person_name}</div>}
                        <div className="font-semibold leading-snug text-stone-900">{r.title || r.activity_code}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-stone-500">
                          {r.activity_code && <span className="rounded bg-stone-100 px-1.5 py-px font-mono text-stone-600">{r.activity_code}</span>}
                          <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-teal-800 hover:underline" aria-expanded={isOpen}
                            onClick={() => setExpanded(v => ({ ...v, [r.id]: !v[r.id] }))}><ChevronDown size={12} className={isOpen ? 'rotate-180 transition' : 'transition'} />{isOpen ? 'ซ่อนรายละเอียด' : 'รายละเอียด'}</button>
                        </div>
                        {r.reject_reason && r.status !== 'approved' && <p className="mt-1 text-xs font-semibold text-red-800">เหตุผล: {r.reject_reason}</p>}
                      </td>
                      <td className={cell + ' text-right tabular-nums'}>
                        <div className="font-semibold text-stone-900">{num(r.qty)}</div>
                        <div className="text-[11px] text-stone-500">{definition?.uom || r.uom || ''}</div>
                      </td>
                      <td className={cell + ' bg-teal-50/60 text-right'}>
                        <div className={'text-lg font-bold leading-tight tabular-nums ' + ptsCls}>{pt(counted)}</div>
                        {cut > 0.005 && r.status !== 'rejected' && <div className="text-[11px] leading-tight text-amber-700">ตัดเพดาน −{pt(cut)}<br />(เดิม {pt(raw)})</div>}
                      </td>
                      <td className={cell + ' text-center'}><span className={'inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ' + st.cls}>{st.label}</span></td>
                      <td className={cell + ' text-center'}>
                        <div className="flex flex-col items-stretch gap-1">
                          {evidencePaths[String(r.id)] && openEvidence && <button type="button" className="btn sec !py-1 !text-xs" onClick={() => openEvidence(sb, evidencePaths[String(r.id)])}><Paperclip size={13} />ดูหลักฐาน</button>}
                          {r.status === 'approved' && <>
                            <button type="button" className="btn sec !py-1 !text-xs" disabled={!canAudit || busy} onClick={() => { setOpen({ id: r.id, type: 'return_for_correction' }); setReason(''); setError('') }}><RotateCcw size={13} />ส่งกลับให้แก้ไข</button>
                            <button type="button" className="btn sec !py-1 !text-xs !border-red-200 !text-red-700" disabled={!canAudit || busy} onClick={() => { setOpen({ id: r.id, type: 'reject' }); setReason(''); setError('') }}><XCircle size={13} />ไม่อนุมัติ</button>
                          </>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && <tr>
                      <td colSpan={7} className={band + ' border-t border-t-stone-100 px-3 pb-3 pt-1'}>
                        <div className="sticky left-0 w-[min(100%,calc(100vw-4.5rem))]">
                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-teal-100 bg-teal-50/60 p-2 text-xs">
                          <div><div className="text-stone-500">หน่วยนับ</div><b className="text-stone-900">{definition?.uom || r.uom || '—'}</b></div>
                          <div><div className="text-stone-500">เวลาพื้นฐาน</div><b className="text-stone-900">{num(baseMinutes)} นาที/หน่วย</b></div>
                          <div><div className="text-stone-500">คะแนนปรับต่อหน่วย</div><b className="text-teal-900">{positionRate ? num(pointsPerUnit) : '—'} คะแนน</b></div>
                        </div>
                        {definition?.definition && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-xs text-stone-600">คำนิยาม/หลักฐาน: {definition.definition}</p>}
                        {r.evidence && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-100 p-2 text-xs text-stone-700">หลักฐาน: {r.evidence}</p>}
                        {form && <div className="mt-2 space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                          <label className="block text-xs font-semibold text-stone-800">{form.type === 'return_for_correction' ? 'สิ่งที่ต้องแก้ไข (เจ้าของกิจกรรมจะเห็นข้อความนี้)' : 'เหตุผลที่ไม่อนุมัติ (เจ้าของกิจกรรมจะเห็นข้อความนี้)'}
                            <textarea autoFocus className="inp mt-1 min-h-16 w-full !cursor-text" value={reason} onChange={e => setReason(e.target.value)} placeholder="อย่างน้อย 5 ตัวอักษร" /></label>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={'btn !py-1 ' + (form.type === 'reject' ? 'red' : '')} disabled={busy} onClick={submit}><CheckCircle2 size={14} />{busy ? 'กำลังบันทึก…' : form.type === 'return_for_correction' ? 'ยืนยันส่งกลับและแจ้งเตือน' : 'ยืนยันไม่อนุมัติและแจ้งเตือน'}</button>
                            <button type="button" className="btn sec !py-1" disabled={busy} onClick={() => { setOpen(null); setReason('') }}>ยกเลิก</button>
                          </div>
                        </div>}
                        </div>
                      </td>
                    </tr>}
                  </Fragment>
                })
              })()}</tbody>
              <tfoot>
                <tr className="text-sm font-bold">
                  <td colSpan={4} className="border-t-2 border-stone-300 bg-stone-100 px-3 py-2 text-right text-stone-700">รวมแต้มที่นับได้ (อนุมัติแล้ว) จาก {num(shown.length, 0)} รายการที่แสดง</td>
                  <td className="border-t-2 border-stone-300 bg-teal-50 px-3 py-2 text-right text-lg tabular-nums text-teal-900">{pt(shownApprovedTotal)}</td>
                  <td colSpan={2} className="border-t-2 border-stone-300 bg-stone-100" />
                </tr>
              </tfoot>
            </table>
          </div>}
      </div>
    </section>
    {printData && PrintSheet && <PrintSheet sb={sb} person={printData.person} rows={rows} month={monthDate.slice(0, 7)} units={units || []} positions={positions || []}
      leaveDataOverride={printData.leave} onClose={() => setPrintData(null)} />}
  </div>
}
