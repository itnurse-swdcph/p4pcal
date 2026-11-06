import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, Info, RefreshCw, ShieldCheck, UserCog } from 'lucide-react'
import { appConfirm } from './AppDialog'
import ActivityPanel from './committee/ActivityPanel'
import ClosePanel from './committee/ClosePanel'
import RosterAdmin from './committee/RosterAdmin'
import UnitDetail from './committee/UnitDetail'
import UnitOverview from './committee/UnitOverview'
import { buildUnitStats, isBelowGuarantee, monthLabel, num } from './committee/utils'

type Tab = 'overview' | 'close' | 'roster'
const STATUS_LABEL: Record<string, string> = {
  none: 'ยังไม่เริ่มรับรอง', reviewing: 'อยู่ระหว่างลงมติ', approved: 'กรรมการอนุมัติครบ', rejected: 'มีมติไม่เห็นชอบ',
  stale: 'ข้อมูลเปลี่ยน ต้องรับรองใหม่', closed: 'ปิดงวดและประกาศผลแล้ว', reopened: 'เปิดงวดใหม่'
}

export default function P4PCommitteePage({ sb, month, setMonth, isAdmin, isCentralAdminAccount = false, currentUserId, PrintSheet, appUnits, appPositions, scoreBreakdown, openEvidence }: any) {
  const monthDate = `${month}-01`
  const [tab, setTab] = useState<Tab>('overview')
  const [unitKey, setUnitKey] = useState<number | null>(null)
  const [panel, setPanel] = useState<{ person: any | null; randomUnitId?: number | null } | null>(null)
  const [version, setVersion] = useState(0)
  const [loadedFor, setLoadedFor] = useState('')
  const [calc, setCalc] = useState<any>(null)
  const [review, setReview] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [votes, setVotes] = useState<any[]>([])
  const [roster, setRoster] = useState<any[]>([])
  const [statusRows, setStatusRows] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [submissionReturns, setSubmissionReturns] = useState<any[]>([])
  const [activityReturns, setActivityReturns] = useState<any[]>([])
  const [correctionQueueOk, setCorrectionQueueOk] = useState(false)
  const [unitReviews, setUnitReviews] = useState<any[]>([])
  const [reviewOk, setReviewOk] = useState(false)
  const [statusOk, setStatusOk] = useState(true)
  const [unitsMeta, setUnitsMeta] = useState<any[]>([])
  const [staffMeta, setStaffMeta] = useState<any[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => setVersion(v => v + 1), [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setError('')
      const [c, r, m, v, ro, st, un, sd, ss, ur] = await Promise.all([
        sb.rpc('p4p_committee_calc', { p_month: monthDate }),
        sb.from('p4p_monthly_reviews').select('*').eq('month', monthDate).maybeSingle(),
        sb.from('p4p_committee_members').select('user_id,active,is_chair,appointed_at').order('appointed_at'),
        sb.from('p4p_monthly_review_votes').select('month,user_id,decision,comment,voted_at').eq('month', monthDate).order('voted_at'),
        sb.rpc('p4p_committee_roster'),
        sb.rpc('p4p_committee_activity_status', { p_month: monthDate }),
        sb.from('units').select('id,name,parent_group'),
        sb.rpc('p4p_committee_staff_groups'),
        sb.rpc('p4p_committee_submissions', { p_month: monthDate }),
        sb.rpc('p4p_committee_unit_reviews', { p_month: monthDate })
      ])
      const submissionIds = (ss.data || []).map((x: any) => x.id).filter(Boolean)
      let returnedRows: any[] = []
      let returnedRowsError: any = null
      if (submissionIds.length) {
        const returned = await sb.from('p4p_submission_returns')
          .select('id,submission_id,staff_directory_id,person_id,reason,status,returned_at,corrected_at')
          .in('submission_id', submissionIds).eq('status', 'returned')
        returnedRows = returned.data || []
        returnedRowsError = returned.error
      }
      // ดึงประวัติการส่งกลับ/ไม่อนุมัติรายกิจกรรมจากกรรมการ แล้วเทียบกับสถานะปัจจุบัน
      const [auditResult, returnedActivityResult] = await Promise.all([
        sb.from('p4p_activity_audit_events').select('id,log_id,person_id,action,reason,old_status,new_status,created_at')
          .eq('month', monthDate).in('action', ['return_for_correction', 'reject']).order('created_at', { ascending: false }),
        sb.from('v_logs').select('id,person_id,person_name,position,unit_id,activity_code,title,status,reject_reason')
          .eq('month', monthDate).in('status', ['pending', 'draft', 'rejected']).not('reject_reason', 'is', null).range(0, 1999)
      ])
      const latestAudit = new Map<string, any>()
      for (const event of auditResult.data || []) if (!latestAudit.has(String(event.log_id))) latestAudit.set(String(event.log_id), event)
      const activityReturns = (returnedActivityResult.data || []).flatMap((row: any) => {
        const event = latestAudit.get(String(row.id))
        const expectedStatus = event?.action === 'return_for_correction' ? 'pending' : 'draft'
        return event && event.old_status === 'approved' && row.status === expectedStatus && String(row.reject_reason || '').trim()
          ? [{ ...row, committee_action: event.action, committee_reason: event.reason || row.reject_reason, committee_returned_at: event.created_at }]
          : []
      })
      const activityReturnsError = auditResult.error || returnedActivityResult.error
      if (!alive) return
      const errs = [c.error && (c.error.message || 'ไม่สามารถโหลดผลคำนวณ P4P ได้'), r.error && 'ไม่สามารถโหลดสถานะการรับรองได้', m.error && 'ไม่สามารถโหลดรายชื่อกรรมการได้',
        v.error && 'ไม่สามารถโหลดผลลงมติได้', ro.error && 'ไม่สามารถโหลดทะเบียนกรรมการได้', st.error && 'ไม่สามารถตรวจสอบสถานะกิจกรรมรายหน่วยงานได้ จึงยังไม่ถือว่าหน่วยงานใดพร้อมตรวจ',
        un.error && 'ไม่สามารถโหลดรายชื่อหน่วยงานได้', sd.error && 'ไม่สามารถโหลดข้อมูลกลุ่มงานของบุคลากรได้', ss.error && 'ไม่สามารถโหลดรายการส่งผลงานของหน่วยงานได้',
        returnedRowsError && 'ไม่สามารถโหลดรายชื่อบุคลากรที่รอแก้ไขได้', activityReturnsError && 'ไม่สามารถตรวจสอบรายการกิจกรรมที่คณะกรรมการส่งกลับได้', ur.error && 'ไม่สามารถโหลดสถานะตรวจรายหน่วยงานได้ จึงปิดการเริ่มรับรองไว้ก่อน'].filter(Boolean)
      if (errs.length) setError(errs.join(' · '))
      setCalc(c.error ? null : c.data); setReview(r.error ? null : r.data); setMembers(m.data || []); setVotes(v.data || [])
      setRoster(ro.data || []); setStatusRows(st.data || []); setStatusOk(!st.error)
      setUnitsMeta(un.data || []); setStaffMeta(sd.data || []); setSubmissions(ss.data || []); setSubmissionReturns(returnedRows)
      setActivityReturns(activityReturns); setCorrectionQueueOk(!returnedRowsError && !activityReturnsError)
      // สถานะตรวจแล้วเป็นเงื่อนไขบังคับ: หากฐานข้อมูลยังไม่พร้อมหรืออ่านสถานะไม่ได้ ต้องไม่อนุญาตให้เริ่มรับรอง
      setUnitReviews(ur.error ? [] : ur.data || []); setReviewOk(!ur.error)
      setLoadedFor(monthDate)
    }
    load()
    return () => { alive = false }
  }, [sb, monthDate, version])

  const loading = loadedFor !== monthDate
  const activeMembers = useMemo(() => members.filter(x => x.active), [members])
  const isMember = activeMembers.some(x => x.user_id === currentUserId)
  const canReturnSubmission = isMember || isCentralAdminAccount
  const rstatus: string = review?.status || 'none'
  const viewCalc = rstatus === 'reviewing' || rstatus === 'approved' ? (review?.snapshot || calc) : calc
  const groups: any[] = viewCalc?.groups || []

  const statusByPerson = useMemo(() => new Map(statusRows.map((s: any) => [String(s.person_id), s])), [statusRows])
  const lines = useMemo(() => {
    const byPay = new Map(groups.map((g: any) => [Number(g.pay_group), g]))
    return (viewCalc?.lines || []).map((l: any) => ({ ...l, below: isBelowGuarantee(l, byPay.get(Number(l.pay_group))), pending: Number(statusByPerson.get(String(l.id))?.pending || 0) }))
  }, [viewCalc, groups, statusByPerson])
  const linesWithOrg = useMemo(() => lines.map((line: any) => {
    const staff = staffMeta.find((s: any) => Number(s.source_row) === Number(line.staff_directory_id))
    const isGroupHead = String(staff?.org_role || '').includes('หัวหน้ากลุ่มงาน')
    return { ...line, nursing_group: staff?.nursing_group || '', isGroupHeadWithoutUnit: isGroupHead && !staff?.unit_name }
  }), [lines, staffMeta])
  const units = useMemo(() => buildUnitStats(linesWithOrg, unitsMeta, statusRows).map(u => ({ ...u, ready: statusOk && correctionQueueOk && u.ready })), [linesWithOrg, unitsMeta, statusRows, statusOk, correctionQueueOk])
  const returnedPeopleByUnit = useMemo(() => {
    const grouped = new Map<number, any[]>()
    const addPerson = (key: number | undefined, person: any, activity?: any) => {
      if (key == null || !Number.isFinite(Number(key))) return
      const list = grouped.get(Number(key)) || []
      const personKey = String(person.staff_directory_id ?? person.id ?? '')
      const existing = list.find((x: any) => String(x.staff_directory_id ?? x.id ?? '') === personKey)
      if (existing) {
        if (activity) existing.activities = [...(existing.activities || []), activity]
        if (!existing.reason && person.reason) existing.reason = person.reason
        return
      }
      grouped.set(Number(key), [...list, { ...person, activities: activity ? [activity] : [] }])
    }
    for (const returned of submissionReturns) {
      const submission = submissions.find((s: any) => String(s.id) === String(returned.submission_id))
      if (!submission) continue
      const line = linesWithOrg.find((l: any) => Number(l.staff_directory_id ?? l.directory_source_row) === Number(returned.staff_directory_id)
        || (returned.person_id && String(l.id) === String(returned.person_id)))
      const key = submission.scope_type === 'unit'
        ? Number(submission.unit_id)
        : units.find(u => Number(u.key) < 0 && String(u.group) === String(submission.group_name))?.key
      addPerson(key, {
        ...(line || {}), id: returned.person_id || line?.id || null,
        staff_directory_id: returned.staff_directory_id,
        name: line?.name || line?.person_name || `บุคลากรรหัส ${returned.staff_directory_id}`,
        reason: returned.reason, returned_at: returned.returned_at, return_id: returned.id
      })
    }
    for (const returned of activityReturns) {
      const line = linesWithOrg.find((l: any) => String(l.id) === String(returned.person_id))
      const unitId = returned.unit_id ?? line?.unit_id
      const key = unitId != null ? Number(unitId) : units.find(u => Number(u.key) < 0 && String(u.group) === String(line?.nursing_group))?.key
      addPerson(key, {
        ...(line || {}), id: returned.person_id, staff_directory_id: line?.staff_directory_id,
        name: returned.person_name || line?.name || 'ไม่พบชื่อบุคลากร',
        reason: returned.committee_reason, returned_at: returned.committee_returned_at
      }, { id: returned.id, code: returned.activity_code, title: returned.title, action: returned.committee_action, reason: returned.committee_reason, status: returned.status })
    }
    return grouped
  }, [submissionReturns, activityReturns, submissions, linesWithOrg, units])
  const unit = unitKey == null ? null : units.find(u => u.key === unitKey) || null
  // หน้าตรวจสอบจะแสดงเฉพาะหน่วยงาน/กลุ่มงานที่กดส่งผลงานแล้ว
  const submissionForUnit = (u: any) => submissions.find(s =>
    s.scope_type === 'unit' ? Number(s.unit_id) === Number(u.key) :
      s.scope_type === 'group' && Number(u.key) < 0 && String(s.group_name || '') === String(u.group || '')
  ) || null
  // หน่วยงานพร้อมตรวจต้องส่งผลงานแล้ว และไม่มีรายการค้างรับรอง; รายการที่ถูกส่งกลับไม่นับ
  const submittedUnits = useMemo(() => units.filter(u => ['submitted', 'resubmitted', 'reviewed'].includes(String(submissionForUnit(u)?.status || ''))), [units, submissions])
  const overviewUnits = useMemo(() => units.map(u => {
    const submission = submissionForUnit(u)
    const submitted = ['submitted', 'resubmitted', 'reviewed'].includes(String(submission?.status || ''))
    const returnedPeople = returnedPeopleByUnit.get(u.key) || []
    const correctionPending = submission?.status === 'returned' || returnedPeople.length > 0
    const ready = statusOk && correctionQueueOk && submitted && u.ready && !correctionPending
    const rv = submission && ['submitted', 'resubmitted'].includes(String(submission.status)) ? unitReviews.find((x: any) => x.submission_id === submission.id) : null
    return { ...u, submitted, returnedPeople, returnCount: returnedPeople.length,
      submissionStatus: correctionPending ? 'returned' : String(submission?.status || ''), ready, progress: submitted ? u.progress : 0,
      reviewed: reviewOk && ready && !!rv, reviewedByName: rv?.reviewed_by_name || '', reviewedAt: rv?.reviewed_at || null }
  }), [units, submissions, returnedPeopleByUnit, statusOk, correctionQueueOk, unitReviews, reviewOk])
  const selectedSubmission = unit ? submissionForUnit(unit) : null

  const readyCount = submittedUnits.filter(u => statusOk && u.ready).length
  const pendingTotal = units.reduce((s, u) => s + u.pending, 0)
  const reviewedCount = overviewUnits.filter((u: any) => u.reviewed).length
  const allChecked = reviewOk && overviewUnits.length > 0 && reviewedCount === overviewUnits.length
  const allReady = statusOk && units.length > 0 && submittedUnits.length === units.length && readyCount === units.length
  const totals = useMemo(() => groups.reduce((a: any, g: any) => {
    const el = Number(g.n_eligible || 0), inel = Number(g.n_ineligible || 0)
    a.allocation += Number(g.full_amount || 0) * (el + inel); a.reserve += Number(g.reserve || 0) * el; a.carry += Number(g.carry_extra_in || 0)
    a.below += Number(g.below_threshold_difference || 0); a.pool += Number(g.pool_extra || 0); a.excess += Number(g.sum_excess || 0)
    return a
  }, { allocation: 0, reserve: 0, carry: 0, below: 0, pool: 0, excess: 0 }), [groups])

  const canAudit = (isMember || isCentralAdminAccount) && !['reviewing', 'approved', 'closed'].includes(rstatus)
  const lockedReason = !(isMember || isCentralAdminAccount) ? 'เฉพาะกรรมการ P4P หรือแอดมินกลางบัญชี 11450 เท่านั้นที่ส่งกลับหรือไม่อนุมัติกิจกรรมได้'
    : rstatus === 'closed' ? 'งวดนี้ปิดแล้ว แก้ไขผลกิจกรรมไม่ได้'
      : 'ขณะนี้อยู่ระหว่างรอบรับรองผล จึงแก้ผลกิจกรรมไม่ได้ หากพบข้อผิดพลาดให้ลงมติ "ไม่เห็นชอบ" เพื่อยกเลิกรอบนี้ก่อน'

  const runAction = async (label: string | ((d: any) => string), action: () => Promise<any>): Promise<boolean> => {
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await action()
      if (result?.error) throw result.error
      const data = result?.data
      if (data?.ok === false) {
        setError(data.reason === 'pending_items' ? `ยังมีรายการรอรับรอง ${data.pending_count || 0} รายการ` :
          data.reason === 'snapshot_changed' ? 'ข้อมูลคะแนนเปลี่ยนหลังเริ่มรับรอง มติทั้งหมดถูกล้าง ต้องเริ่มรับรองใหม่' :
            data.reason === 'committee_roster_changed' ? 'รายชื่อกรรมการเปลี่ยนแปลง มติทั้งหมดถูกล้าง ต้องเริ่มรับรองใหม่' : 'ไม่สามารถดำเนินการได้')
        refresh(); return false
      }
      setMessage(typeof label === 'function' ? label(data) : label)
      refresh(); return true
    } catch (e: any) { setError(e?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'); return false }
    finally { setBusy(false) }
  }

  const startReview = async () => {
    if (!(await appConfirm(`เริ่มกระบวนการรับรองผล P4P ประจำเดือน${monthLabel(month)}\n\nระบบจะเก็บผลคำนวณชุดนี้ไว้ให้กรรมการทุกคนลงมติ และจะแก้ผลกิจกรรมไม่ได้จนกว่าจะปิดงวดหรือมีผู้ไม่เห็นชอบ`, 'เริ่มกระบวนการรับรอง'))) return
    await runAction('เริ่มกระบวนการรับรองผลแล้ว กรรมการทุกคนลงมติได้ที่ขั้นตอนที่ 3', () => sb.rpc('p4p_start_review', { p_month: monthDate }))
  }
  const castVote = async (decision: 'approved' | 'rejected', comment: string) => {
    if (decision === 'rejected' && comment.trim().length < 5) { setError('กรุณาระบุเหตุผลที่ไม่เห็นชอบอย่างน้อย 5 ตัวอักษร'); return false }
    if (decision === 'approved' && !(await appConfirm('ยืนยันอนุมัติผลการจัดสรรประจำเดือนนี้\nเมื่อกรรมการอนุมัติครบทุกคน ระบบจะปิดงวดและประกาศผลทันที', 'ยืนยันการอนุมัติ'))) return false
    return runAction(d => d?.closed_automatically ? 'กรรมการอนุมัติครบทุกคน ระบบปิดงวดและประกาศผลเรียบร้อยแล้ว' : decision === 'approved' ? 'บันทึกมติอนุมัติแล้ว รอกรรมการท่านอื่น' : 'บันทึกมติไม่เห็นชอบแล้ว รอบนี้ถูกยกเลิก',
      () => sb.rpc('p4p_review_vote', { p_month: monthDate, p_decision: decision, p_comment: comment }))
  }

  const openUnit = (key: number) => { setTab('overview'); setUnitKey(key); window.scrollTo({ top: 0 }) }
  const returnSubmissionPerson = async (line: any, reason: string) => {
    const staffId = Number(line.staff_directory_id ?? line.directory_source_row)
    if (!selectedSubmission?.id || !staffId) { setError('ไม่พบรหัสบุคลากรหรือรายการส่งผลงาน'); return }
    if (reason.trim().length < 5) { setError('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'); return }
    await runAction('ส่งกลับให้ ' + (line.name || 'บุคลากร') + ' แก้ไขรายบุคคลแล้ว', () =>
      sb.rpc('p4p_return_submission_person', { p_submission_id: selectedSubmission.id, p_staff_directory_id: staffId, p_reason: reason.trim() }))
  };

  const reviewUnit = async () => {
    if (!selectedSubmission?.id) { setError('ไม่พบรายการส่งผลงานของหน่วยงานนี้'); return }
    await runAction('ทำเครื่องหมายตรวจแล้วเรียบร้อย', () => sb.rpc('p4p_review_unit', { p_submission_id: selectedSubmission.id }))
  }
  const unreviewUnit = async () => {
    if (!selectedSubmission?.id) return
    if (!(await appConfirm('ยกเลิกสถานะ "ตรวจแล้ว" ของหน่วยงานนี้ใช่หรือไม่?'))) return
    await runAction('ยกเลิกสถานะตรวจแล้วเรียบร้อย', () => sb.rpc('p4p_unreview_unit', { p_submission_id: selectedSubmission.id }))
  }

  const myVote = votes.find(v => v.user_id === currentUserId)
  const iAmExpected = (review?.expected_members || []).includes(currentUserId)
  const next = rstatus === 'closed' ? { text: 'งวดนี้ปิดและประกาศผลแล้ว', go: null as Tab | null, tone: 'ok' }
    : rstatus === 'reviewing' && iAmExpected && !myVote ? { text: 'ถึงคิวคุณลงมติแล้ว', go: 'close' as Tab, tone: 'act' }
      : rstatus === 'reviewing' ? { text: 'รอกรรมการลงมติให้ครบ', go: 'close' as Tab, tone: 'wait' }
        : allReady && !allChecked ? { text: `ทุกหน่วยงานพร้อมตรวจแล้ว แต่ตรวจแล้ว ${num(reviewedCount, 0)}/${num(units.length, 0)} หน่วยงาน ต้องกดตรวจแล้วให้ครบก่อนเริ่มรับรอง`, go: null as Tab | null, tone: 'wait' }
        : allReady ? { text: 'ตรวจครบทุกหน่วยงานแล้ว เริ่มกระบวนการรับรองได้', go: 'close' as Tab, tone: 'act' }
          : { text: `ยังมี ${num(units.length - readyCount, 0)} หน่วยงานที่ยังไม่พร้อม (ค้างรับรอง ${num(pendingTotal, 0)} รายการ)`, go: null as Tab | null, tone: 'wait' }

  const tabs: [Tab, string][] = [['overview', 'ตรวจรายหน่วยงาน'], ['close', 'รับรองและปิดงวด'], ...(isAdmin ? [['roster', 'กรรมการ'] as [Tab, string]] : [])]

  return <div className="space-y-4">
    <section className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800"><ShieldCheck size={18} />คณะกรรมการ P4P · ตรวจสอบและรับรองผล</div>
          <h2 className="mt-1 text-xl font-bold">ประจำเดือน{monthLabel(month)}</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700"><CalendarDays size={16} className="text-teal-800" /><span className="sr-only">เลือกเดือน</span>
            <input type="month" aria-label="เลือกเดือนที่ต้องการตรวจสอบ" className="inp !w-44 bg-white" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setUnitKey(null); setPanel(null) } }} /></label>
          <button type="button" className="btn sec" onClick={refresh} disabled={loading || busy}><RefreshCw size={15} />รีเฟรช</button>
        </div>
      </div>
      {!loading && <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-stone-100 px-3 py-1">สถานะ: <b>{STATUS_LABEL[rstatus] || rstatus}</b></span>
        <span className={'rounded-full px-3 py-1 ' + (allReady ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>หน่วยงานพร้อม <b>{num(readyCount, 0)}/{num(units.length, 0)}</b></span>
        {reviewOk && <span className={'rounded-full px-3 py-1 ' + (allChecked ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100')}>ตรวจแล้ว <b>{num(reviewedCount, 0)}/{num(units.length, 0)}</b></span>}
        <span className="rounded-full bg-stone-100 px-3 py-1">ค้างรับรอง <b className={pendingTotal ? 'text-amber-700' : 'text-emerald-700'}>{num(pendingTotal, 0)}</b> รายการ</span>
      </div>}
      {!loading && <div className={'flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ' + (next.tone === 'act' ? 'border-teal-300 bg-teal-50 text-teal-950' : next.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-stone-200 bg-stone-50 text-stone-800')}>
        <span className="flex items-center gap-2">{next.tone === 'ok' ? <CheckCircle2 size={17} /> : <Info size={17} />}<b>ขั้นตอนถัดไป:</b> {next.text}</span>
        {next.go && tab !== next.go && <button type="button" className="btn !py-1" onClick={() => setTab(next.go!)}>ไปที่ขั้นตอนรับรอง<ArrowRight size={15} /></button>}
      </div>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      <div className="flex flex-wrap gap-1 border-b border-stone-200" role="tablist">{tabs.map(([k, l]) =>
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={'-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold ' + (tab === k ? 'border-teal-700 text-teal-800' : 'border-transparent text-stone-600 hover:text-stone-900')}>
          {k === 'overview' ? <ClipboardList size={16} /> : k === 'close' ? <ShieldCheck size={16} /> : <UserCog size={16} />}{l}</button>)}</div>
    </section>

    {loading ? <div className="card text-sm text-stone-500">กำลังโหลดข้อมูล…</div> : <>
      {tab === 'overview' && (unit
        ? <UnitDetail unit={overviewUnits.find((u: any) => u.key === unit.key) || unit} groups={groups} siblings={overviewUnits} submission={selectedSubmission} returnedPeople={returnedPeopleByUnit.get(unit.key) || []} onReturnPerson={canReturnSubmission ? returnSubmissionPerson : undefined} canAudit={canAudit} reviewEnabled={reviewOk} canReview={canAudit && !busy} onReviewUnit={reviewUnit} onUnreviewUnit={unreviewUnit} onBack={() => setUnitKey(null)} onSelectUnit={setUnitKey}
          onViewPerson={line => setPanel({ person: line })} onRandomAudit={() => setPanel({ person: null, randomUnitId: unit.key })} />
        : <UnitOverview units={overviewUnits} onOpen={openUnit} showReview={reviewOk} />)}
      {tab === 'close' && <ClosePanel review={review} votes={votes} roster={roster} currentUserId={currentUserId} isMember={isMember} activeCount={activeMembers.length}
        units={statusOk ? overviewUnits : []} groups={groups} totals={totals} busy={busy} reviewGate={reviewOk} onStart={startReview} onVote={castVote} onOpenUnit={openUnit} />}
      {tab === 'roster' && isAdmin && <RosterAdmin sb={sb} members={members} roster={roster} version={version} busy={busy} runAction={runAction} setError={setError} />}
    </>}

    {panel && <ActivityPanel sb={sb} monthDate={monthDate} person={panel.person} randomUnitId={panel.randomUnitId} canAudit={canAudit} lockedReason={lockedReason} PrintSheet={PrintSheet} units={appUnits} positions={appPositions} scoreBreakdown={scoreBreakdown} openEvidence={openEvidence}
      onClose={() => setPanel(null)} onChanged={refresh} />}
  </div>
}
