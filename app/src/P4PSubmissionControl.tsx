import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, FileCheck2, Send, X } from 'lucide-react'
import { appConfirm } from './AppDialog'
import { monthLabel, num } from './committee/utils'

type Props = {
  sb: any
  profile: any
  unitId: number | null
  groupName: string
  month: string
  scopeType?: 'unit' | 'group'
  scopeLabel?: string
}

export default function P4PSubmissionControl({ sb, profile, unitId, groupName, month, scopeType = 'unit', scopeLabel }: Props) {
  const [staff, setStaff] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [peopleRows, setPeopleRows] = useState<any[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submission, setSubmission] = useState<any>(null)
  const [dashboardStatus, setDashboardStatus] = useState<any>(null)
  const [dashboardError, setDashboardError] = useState('')
  const [showReturnDetails, setShowReturnDetails] = useState(false)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isGroupHeadWithoutUnit, setIsGroupHeadWithoutUnit] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  // เมื่อบันทึกวันลา/หมายเหตุในหน้าสรุปผลแล้ว ให้โหลดข้อมูลใหม่ทันที (ไม่ต้องสลับหน้า)
  useEffect(() => {
    const onSaved = () => setReloadTick(t => t + 1)
    window.addEventListener('p4p-leave-saved', onSaved)
    return () => window.removeEventListener('p4p-leave-saved', onSaved)
  }, [])

  const monthDate = month + '-01'
  const rangeEnd = useMemo(() => {
    const d = new Date(month + '-01T00:00:00')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }, [month])

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (reloadTick === 0) { setLoading(true); setError(''); setMessage('') }
      let rosterQuery = sb.from('staff_directory')
        .select('source_row,prefix,first_name,last_name,position,org_role,unit_name,nursing_group,extra_nursing_group_names,active')
        .eq('active', true).neq('source_row', 2)
      if (scopeType === 'unit') {
        const { data: unitData, error: unitError } = await sb.from('units').select('name').eq('id', unitId).maybeSingle()
        if (unitError || !unitData?.name) throw unitError || new Error('ไม่พบข้อมูลหน่วยงาน')
        rosterQuery = rosterQuery.eq('unit_name', unitData.name)
      } else {
        rosterQuery = rosterQuery.is('unit_name', null)
      }
      // PostgREST returns at most 1,000 rows per request by default.
      // Fetch every page so eligibility is calculated from the complete month's activity.
      const fetchAllMonthLogs = async () => {
        const all: any[] = []
        for (let offset = 0; ; offset += 1000) {
          let query = sb.from('v_logs').select('id,person_id,work_date,status,counted_points')
            .gte('work_date', monthDate).lt('work_date', rangeEnd).order('id', { ascending: true })
          query = scopeType === 'unit' ? query.eq('unit_id', unitId) : query.is('unit_id', null)
          const { data, error } = await query.range(offset, offset + 999)
          if (error) return { data: null, error }
          all.push(...(data || []))
          if (!data || data.length < 1000) break
        }
        return { data: all, error: null }
      }
      const [rosterResult, logResult, peopleResult, leaveResult, groupLeaveResult, subResult, ownStaff] = await Promise.all([
        rosterQuery,
        fetchAllMonthLogs(),
        sb.from('people').select('id,staff_directory_id,unit_id').eq('active', true),
        scopeType === 'unit'
          ? sb.from('p4p_monthly_leave').select('staff_directory_id,other_notes').eq('unit_id', unitId).eq('month', monthDate)
          : Promise.resolve({ data: [], error: null }),
        scopeType === 'group'
          ? sb.from('p4p_group_monthly_leave').select('staff_directory_id,other_notes').eq('group_name', groupName).eq('month', monthDate)
          : Promise.resolve({ data: [], error: null }),
        scopeType === 'unit'
          ? sb.from('p4p_month_submissions').select('*').eq('month', monthDate).eq('scope_type', 'unit').eq('unit_id', unitId).maybeSingle()
          : sb.from('p4p_month_submissions').select('*').eq('month', monthDate).eq('scope_type', 'group').eq('group_name', groupName).maybeSingle(),
        profile?.staff_directory_id
          ? sb.from('staff_directory').select('unit_name,org_role,nursing_group').eq('source_row', profile.staff_directory_id).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ])
      if (!alive) return
      if (rosterResult.error || logResult.error || peopleResult.error || leaveResult.error || groupLeaveResult.error || subResult.error) {
        setError('โหลดข้อมูลเตรียมส่งผลงานไม่ครบ กรุณากดรีเฟรชหรือติดต่อผู้ดูแลระบบ')
      }
      const rosterRows = (rosterResult.data || []).filter((p: any) => scopeType === 'unit' ||
        (String(p.org_role || '').includes('หัวหน้ากลุ่มงาน') && (String(p.nursing_group || '').trim() === groupName ||
        String(p.extra_nursing_group_names || '').split(/[,;|]/).some((g: string) => g.trim() === groupName))))
      setStaff(rosterRows)
      setPeopleRows(peopleResult.data || [])
      const staffIds = new Set(rosterRows.map((p: any) => String(p.source_row)))
      const personIds = new Set((peopleResult.data || []).filter((p: any) => staffIds.has(String(p.staff_directory_id))).map((p: any) => String(p.id)))
      setLogs((logResult.data || []).filter((r: any) => personIds.has(String(r.person_id))))
      const noteRows = [...(leaveResult.data || []), ...(groupLeaveResult.data || [])]
      setNotes(Object.fromEntries(noteRows.map((x: any) => [String(x.staff_directory_id), String(x.other_notes || '')])))
      setSubmission(subResult.data || null)
      if (subResult.data?.id) {
        const dashboard = await sb.rpc('p4p_submission_dashboard_status', { p_submission_id: subResult.data.id })
        if (!alive) return
        setDashboardStatus(dashboard.error ? null : dashboard.data || null)
        // ไม่ให้ความผิดพลาดในการโหลดผลตรวจถูกแสดงเป็น "ไม่มีรายการส่งกลับ" แบบเงียบๆ
        setDashboardError(dashboard.error ? (dashboard.error.message || 'โหลดผลการตรวจไม่สำเร็จ') : '')
      } else { setDashboardStatus(null); setDashboardError('') }
      setIsGroupHeadWithoutUnit(Boolean(ownStaff.data && !String(ownStaff.data.unit_name || '').trim() && String(ownStaff.data.org_role || '').includes('หัวหน้ากลุ่มงาน')))
      setLoading(false)
    }
    void load().catch((e: any) => { if (alive) { setError(e?.message || 'โหลดข้อมูลไม่สำเร็จ'); setLoading(false) } })
    return () => { alive = false }
  }, [sb, unitId, groupName, month, scopeType, profile?.staff_directory_id, monthDate, rangeEnd, reloadTick])

  const pending = logs.filter((r: any) => r.status === 'pending').length
  const approved = logs.filter((r: any) => r.status === 'approved')
  const approvedPointsByPerson = approved.reduce((totals: Map<string, number>, r: any) => {
    const key = String(r.person_id)
    totals.set(key, (totals.get(key) || 0) + Number(r.counted_points || 0))
    return totals
  }, new Map<string, number>())
  const missingNotes = staff.filter((p: any) => {
    const person = peopleRows.find((x: any) => Number(x.staff_directory_id) === Number(p.source_row))
    const approvedPoints = person ? (approvedPointsByPerson.get(String(person.id)) || 0) : 0
    return approvedPoints <= 0 && !String(notes[String(p.source_row)] || '').trim()
  })
  const points = approved.reduce((sum: number, r: any) => sum + Number(r.counted_points || 0), 0)
  const workDays = new Set(approved.map((r: any) => String(r.work_date).slice(0, 10))).size
  const canSubmitRole = profile?.role === 'head' || profile?.role === 'group_head' ||
    (profile?.role === 'admin' && String(profile?.username || '') === '11450')
  const canSubmitScope = scopeType === 'unit'
    ? !isGroupHeadWithoutUnit
    : ((profile?.role === 'group_head' || profile?.role === 'head') && isGroupHeadWithoutUnit) ||
      (profile?.role === 'admin' && String(profile?.username || '') === '11450')
  const alreadySubmitted = !!submission && ['submitted', 'resubmitted', 'reviewed'].includes(String(submission.status))
  const ready = !loading && !error && pending === 0 && missingNotes.length === 0 && staff.length > 0
  const statusLabel: Record<string, string> = { submitted: 'ส่งผลงานแล้ว', returned: 'มีรายการส่งกลับแก้ไข', resubmitted: 'ส่งผลงานซ้ำแล้ว', reviewed: 'ตรวจสอบแล้ว', reopened: 'ยังไม่พร้อมตรวจ' }
  const correctionRows: any[] = Object.values((dashboardStatus?.returns || []).reduce((byPerson: Record<string, any>, row: any) => {
    const key = String(row.person_id || row.staff_directory_id || row.person_name || row.id)
    const existing = byPerson[key]
    if (!existing) byPerson[key] = { ...row, activities: [...(row.activities || [])] }
    else {
      existing.activities = [...(existing.activities || []), ...(row.activities || [])]
      if (row.status === 'returned') existing.status = 'returned'
      if (row.returned_at && (!existing.returned_at || new Date(row.returned_at) > new Date(existing.returned_at))) existing.returned_at = row.returned_at
      if (row.reason && !existing.reason) existing.reason = row.reason
    }
    return byPerson
  }, {} as Record<string, any>))
  const correctionPending = correctionRows.filter((r: any) => r.status === 'returned')
  // นับเป็น "รายการ" (กิจกรรม) ไม่ใช่จำนวนคน: ส่งกลับทั้งชุดที่ไม่มีรายกิจกรรมนับเป็น 1 รายการ
  const correctionItems: any[] = correctionRows.flatMap((r: any) => (Array.isArray(r.activities) && r.activities.length)
    ? r.activities.map((a: any) => ({ ...a, status: a.status || r.status }))
    : [{ ...r, log_id: 'person-' + r.id }])
  const itemsPending = correctionItems.filter((a: any) => a.status === 'returned').length
  const itemsCorrected = correctionItems.length - itemsPending
  const dateOnlyText = (value?: string | null) => value ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date(value)) : '—'
  const timeOnlyText = (value?: string | null) => value ? new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' น.' : '—'
  const dateTimeText = (value?: string | null) => value
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'medium', hour12: false }).format(new Date(value))
    : '—'
  const correctionStatusLabel = (status: string) => status === 'returned' ? 'รอแก้ไข'
    : status === 'corrected' ? 'แก้ไขแล้ว · รอส่งผลงาน/รับรอง'
      : status === 'cancelled' ? 'ยกเลิก' : status || 'ไม่ทราบสถานะ'

  async function cancelSubmissionForEdit() {
    if (!submission || !['submitted', 'resubmitted', 'reviewed'].includes(String(submission.status))) return
    if (!(await appConfirm('ยืนยันยกเลิกส่งผลงานประจำเดือนนี้? สถานะหน่วยงานจะเปลี่ยนเป็น “ยังไม่พร้อมตรวจ” และบุคลากรทุกคนในหน่วยงานจะสามารถบันทึกกิจกรรมใหม่ได้ รวมถึงผู้มีสิทธิ์สามารถแก้ไขการรับรองรายกิจกรรม เมื่อดำเนินการเสร็จต้องส่งผลงานใหม่ทั้งหน่วยงาน', 'ยกเลิกส่งผลงาน'))) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: e } = await sb.rpc('p4p_cancel_submission_for_activity_edit', {
        p_month: monthDate, p_unit_id: scopeType === 'unit' ? unitId : null, p_group_name: groupName
      })
      if (e) throw e
      if (data?.ok === false) throw new Error(data?.reason || 'ไม่สามารถยกเลิกส่งผลงานได้')
      setSubmission({ ...submission, status: 'reopened', updated_at: new Date().toISOString() })
      setPreview(false)
      setMessage('ยกเลิกส่งผลงานแล้ว ขณะนี้ยังไม่พร้อมตรวจ บุคลากรทุกคนในหน่วยงานสามารถบันทึกกิจกรรมใหม่ และผู้มีสิทธิ์สามารถแก้ไขการรับรองรายกิจกรรมได้')
      setReloadTick(t => t + 1)
    } catch (e: any) { setError(e?.message || 'ยกเลิกส่งผลงานไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  async function send() {
    if (!ready || !canSubmitRole || !canSubmitScope || alreadySubmitted) return
    if (!(await appConfirm('ยืนยันส่งผลงานประจำเดือน' + monthLabel(month) + ' ใช่หรือไม่? หลังยืนยัน บุคลากรในขอบเขตนี้จะไม่สามารถเพิ่มหรือแก้ไขกิจกรรมได้ หากต้องแก้ไขการรับรอง ให้กดยกเลิกส่งผลงานก่อน แล้วแก้ไขเป็นรายกิจกรรม จากนั้นส่งผลงานใหม่ทั้งหน่วยงาน', 'ยืนยันส่งผลงาน'))) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: e } = await sb.rpc(submission?.status === 'reopened' ? 'p4p_resubmit_reopened_month' : 'p4p_submit_month_v2', {
        p_month: monthDate, p_unit_id: scopeType === 'unit' ? unitId : null, p_group_name: groupName
      })
      if (e) throw e
      if (data?.ok === false) throw new Error(data?.reason || 'ไม่สามารถส่งผลงานได้')
      setSubmission({ ...(submission || {}), id: data.submission_id, status: data.status, submitted_at: new Date().toISOString() })
      setPreview(false)
      setMessage(data.status === 'resubmitted' ? 'ส่งผลงานที่แก้ไขแล้วซ้ำเรียบร้อย' : 'ส่งผลงานเรียบร้อยแล้ว')
    } catch (e: any) { setError(e?.message || 'ส่งผลงานไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  if (!canSubmitRole || !canSubmitScope) return null
  return <section className="card space-y-3 border border-teal-200">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-bold text-stone-900">การส่งผลงานประจำเดือน</h3><p className="text-sm text-stone-600">หน่วยงาน: {scopeLabel || groupName} · {monthLabel(month)}</p></div>
      {submission && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{statusLabel[submission.status] || submission.status}</span>}
    </div>
    {loading ? <p className="text-sm text-stone-500">กำลังตรวจสอบความพร้อม…</p> : <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-700"><FileCheck2 size={16}/>ผลการตรวจหน่วยงาน</div>
          {dashboardError
            ? <div role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">โหลดผลการตรวจไม่สำเร็จ กรุณากดรีเฟรชหรือแจ้งผู้ดูแลระบบ<div className="mt-1 break-words text-xs text-amber-800">{dashboardError}</div></div>
            : dashboardStatus?.review?.reviewed_at
              ? <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  <div className="flex items-center gap-2 font-bold"><CheckCircle2 size={17}/>ตรวจแล้ว</div>
                  <div className="mt-1">ตรวจโดย <b>{dashboardStatus.review.reviewed_by_name || 'กรรมการ P4P'}</b></div>
                  <div className="text-xs">วันที่ <b>{dateOnlyText(dashboardStatus.review.reviewed_at)}</b> เวลา <b>{timeOnlyText(dashboardStatus.review.reviewed_at)}</b></div>
                </div>
              : itemsPending > 0
                ? <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-900"><b>กรรมการส่งกลับให้แก้ไข</b> · ยังไม่ผ่านการตรวจ</div>
                : <div className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">ยังไม่มีผลการตรวจจากคณะกรรมการ</div>}
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-700"><Clock3 size={16}/>รายการส่งกลับและสถานะแก้ไข</div>
          {dashboardError
            ? <div className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">ไม่สามารถแสดงรายการส่งกลับได้ในขณะนี้</div>
            : correctionRows.length
              ? <button type="button" onClick={() => setShowReturnDetails(true)} className={'mt-2 flex w-full items-center justify-between rounded-lg border p-3 text-left ' + (itemsPending > 0 ? 'border-red-200 bg-red-50 text-red-900 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100')}>
                  <span><b className="text-2xl tabular-nums">{num(itemsPending,0)}</b><span className="ml-2 text-sm">{itemsPending > 0 ? 'รายการรอแก้ไข' : 'รายการ · แก้ไขครบแล้ว'}</span><span className="mt-1 block text-xs underline">จาก {num(correctionPending.length || correctionRows.length,0)} คน · ส่งกลับทั้งหมด {num(correctionItems.length,0)} รายการ · แก้ไขแล้ว {num(itemsCorrected,0)} รายการ</span></span>
                  <span className="text-sm font-semibold">ดูรายละเอียด →</span>
                </button>
              : <div className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">ไม่มีรายการส่งกลับรอแก้ไข</div>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">บุคลากร</div><div className="text-xl font-bold">{num(staff.length,0)} คน</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">กิจกรรมรอรับรอง</div><div className={'text-xl font-bold ' + (pending ? 'text-amber-700' : 'text-emerald-700')}>{num(pending,0)} รายการ</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">กิจกรรมรับรองแล้ว</div><div className="text-xl font-bold">{num(approved.length,0)} รายการ</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">วันทำงานรับรอง</div><div className="text-xl font-bold">{num(workDays,0)} วัน</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">แต้มรับรองแล้ว</div><div className="text-xl font-bold">{num(points)} แต้ม</div></div>
      </div>
      {missingNotes.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <b>ต้องระบุหมายเหตุอื่นๆ สำหรับผู้ไม่มีสิทธิ์ {missingNotes.length} คน</b>
        <ul className="mt-1 list-disc pl-5">{missingNotes.slice(0,8).map((p: any) => <li key={p.source_row}>{p.prefix}{p.first_name} {p.last_name}</li>)}</ul>
      </div>}
      {pending > 0 && <p className="text-sm text-amber-800">ยังส่งไม่ได้ เนื่องจากมีรายการรอรับรอง กรุณารับรองให้ครบก่อน</p>}
      {submission?.status === 'returned' && <p className="text-sm text-amber-800">คณะกรรมการส่งกลับแก้ไขรายบุคคลแล้ว เมื่อแก้ไขและรับรองครบ ให้ตรวจทานและส่งผลงานทั้งหน่วยงานอีกครั้ง</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {['submitted', 'resubmitted', 'reviewed'].includes(String(submission?.status || ''))
        ? <div className="flex flex-wrap items-center gap-2"><p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17}/>ส่งผลงานแล้ว · ล็อกการบันทึกกิจกรรมในขอบเขตนี้</p><button type="button" className="btn sec !border-amber-300 !text-amber-800" disabled={busy} onClick={cancelSubmissionForEdit}>ยกเลิกส่งผลงาน</button></div>
        : <div className="flex flex-wrap gap-2">
          {submission?.status === 'reopened' && <p className="w-full text-sm font-semibold text-amber-800">ยังไม่พร้อมตรวจ · เปิดให้บุคลากรทุกคนบันทึกกิจกรรมใหม่ และผู้มีสิทธิ์แก้ไขการรับรองรายกิจกรรมได้ เมื่อดำเนินการเสร็จให้ส่งผลงานทั้งหน่วยงานใหม่</p>}
          <button type="button" className="btn blue" disabled={!ready || busy || !canSubmitScope} onClick={() => setPreview(true)}><Send size={16}/>{submission?.status === 'reopened' ? 'ตรวจทานและส่งผลงานใหม่' : 'ตรวจทานและส่งผลงาน'}</button>
          {submission?.status === 'returned' && <span className="self-center text-xs text-stone-600">หลังแก้ไข ต้องส่งผลงานทั้งหน่วยงานอีกครั้ง</span>}
        </div>}
    </>}
    {showReturnDetails && <div className="fixed inset-0 z-[135] flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-label="รายละเอียดรายการส่งกลับแก้ไข">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4">
          <div><h3 className="text-lg font-bold text-stone-900">รายละเอียดรายการส่งกลับแก้ไข</h3><p className="text-sm text-stone-600">{scopeLabel || groupName} · {monthLabel(month)} · รอแก้ไข {num(itemsPending,0)} รายการ · แก้ไขแล้ว {num(itemsCorrected,0)} รายการ</p></div>
          <button type="button" className="btn sec !p-2" onClick={() => setShowReturnDetails(false)} aria-label="ปิด"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto p-4">
          <div className="space-y-3">{correctionRows.map((r: any) => <article key={r.id} className="rounded-xl border border-stone-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="font-semibold text-stone-900">{r.person_name || 'บุคลากรรหัส ' + r.staff_directory_id}</div>
              <span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + (r.status === 'returned' ? 'bg-red-50 text-red-800' : r.status === 'corrected' ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-700')}>{correctionStatusLabel(r.status)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-2 text-sm text-stone-700"><b>เหตุผลที่ส่งกลับ:</b> {r.reason || 'ไม่ได้ระบุเหตุผล'}</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-stone-600 sm:grid-cols-2">
              <div>ส่งกลับเมื่อ: <b>{dateTimeText(r.returned_at)}</b></div>
              <div>แก้ไขเมื่อ: <b>{r.corrected_at ? dateTimeText(r.corrected_at) : 'ยังไม่แก้ไข'}</b></div>
            </div>
            {Array.isArray(r.activities) && r.activities.length > 0 && <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
              <div className="text-xs font-bold text-stone-600">กิจกรรมที่ถูกส่งกลับ ({r.activities.length} รายการ · รอแก้ไข {r.activities.filter((a: any) => (a.status || r.status) === 'returned').length})</div>
              {r.activities.map((a: any) => { const st = a.status || r.status; return <div key={a.log_id} className="rounded-lg bg-stone-50 p-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-medium text-stone-800">{a.work_date ? new Date(a.work_date + 'T00:00:00').toLocaleDateString('th-TH') : '—'} · {[a.activity_code, a.title].filter(Boolean).join(' · ')}</div>
                  <span className={'whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ' + (st === 'returned' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800')}>{st === 'returned' ? 'รอแก้ไข' : 'แก้ไขแล้ว'}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-stone-600">เหตุผล: {a.reason || r.reason || 'ไม่ได้ระบุเหตุผล'}</div>
                <div className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-stone-500 sm:grid-cols-2"><div>ส่งกลับเมื่อ: <b>{dateTimeText(a.returned_at)}</b></div><div>แก้ไขเมื่อ: <b>{a.corrected_at ? dateTimeText(a.corrected_at) : st === 'returned' ? 'ยังไม่แก้ไข' : 'แก้ไขแล้ว (ไม่ระบุเวลา)'}</b></div></div>
              </div> })}
            </div>}
          </article>)}</div>
        </div>
        <div className="flex justify-end border-t border-stone-200 p-3"><button type="button" className="btn" onClick={() => setShowReturnDetails(false)}>ปิดหน้าต่าง</button></div>
      </div>
    </div>}
    {preview && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-label="ตรวจทานข้อมูลก่อนส่งผลงาน">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div><h3 className="text-lg font-bold">ตรวจทานก่อนยืนยันส่งผลงาน</h3><p className="text-sm text-stone-600">หน่วยงาน: {scopeLabel || groupName} · {monthLabel(month)}</p></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">บุคลากร</div><b>{num(staff.length,0)} คน</b></div>
          <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">กิจกรรมรับรอง</div><b>{num(approved.length,0)} รายการ</b></div>
          <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">คะแนนรวม</div><b>{num(points)} แต้ม</b></div>
        </div>
        <p className="text-sm text-stone-700">ไม่มีรายการรอรับรอง และบุคลากรที่ไม่มีสิทธิ์ต้องมีหมายเหตุครบถ้วนก่อนส่ง</p>
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">เมื่อยืนยันแล้ว จะล็อกการเพิ่ม/แก้ไขกิจกรรมของทุกคนในขอบเขตนี้ หากต้องแก้ไขต้องรอคณะกรรมการส่งกลับเป็นรายบุคคล และหลังแก้ไขต้องส่งผลงานทั้งหน่วยงานอีกครั้ง</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn sec" disabled={busy} onClick={() => setPreview(false)}>กลับไปตรวจสอบ</button><button type="button" className="btn" disabled={busy || !ready} onClick={send}>{busy ? 'กำลังส่ง…' : 'ยืนยันส่งผลงาน'}</button></div>
      </div>
    </div>}
  </section>
}
