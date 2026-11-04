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

export default function P4PCommitteePage({ sb, month, setMonth, isAdmin, isCentralAdminAccount = false, currentUserId }: any) {
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
      const [c, r, m, v, ro, st, un, sd, ss] = await Promise.all([
        sb.rpc('p4p_committee_calc', { p_month: monthDate }),
        sb.from('p4p_monthly_reviews').select('*').eq('month', monthDate).maybeSingle(),
        sb.from('p4p_committee_members').select('user_id,active,is_chair,appointed_at').order('appointed_at'),
        sb.from('p4p_monthly_review_votes').select('month,user_id,decision,comment,voted_at').eq('month', monthDate).order('voted_at'),
        sb.rpc('p4p_committee_roster'),
        sb.rpc('p4p_committee_activity_status', { p_month: monthDate }),
        sb.from('units').select('id,name,parent_group'),
        sb.rpc('p4p_committee_staff_groups'),
        sb.rpc('p4p_committee_submissions', { p_month: monthDate })
      ])
      if (!alive) return
      const errs = [c.error && (c.error.message || 'ไม่สามารถโหลดผลคำนวณ P4P ได้'), r.error && 'ไม่สามารถโหลดสถานะการรับรองได้', m.error && 'ไม่สามารถโหลดรายชื่อกรรมการได้',
        v.error && 'ไม่สามารถโหลดผลลงมติได้', ro.error && 'ไม่สามารถโหลดทะเบียนกรรมการได้', st.error && 'ไม่สามารถตรวจสอบสถานะกิจกรรมรายหน่วยงานได้ จึงยังไม่ถือว่าหน่วยงานใดพร้อมตรวจ',
        un.error && 'ไม่สามารถโหลดรายชื่อหน่วยงานได้', sd.error && 'ไม่สามารถโหลดข้อมูลกลุ่มงานของบุคลากรได้', ss.error && 'ไม่สามารถโหลดรายการส่งผลงานของหน่วยงานได้'].filter(Boolean)
      if (errs.length) setError(errs.join(' · '))
      setCalc(c.error ? null : c.data); setReview(r.error ? null : r.data); setMembers(m.data || []); setVotes(v.data || [])
      setRoster(ro.data || []); setStatusRows(st.data || []); setStatusOk(!st.error)
      setUnitsMeta(un.data || []); setStaffMeta(sd.data || []); setSubmissions(ss.data || [])
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
  const units = useMemo(() => buildUnitStats(linesWithOrg, unitsMeta, statusRows).map(u => ({ ...u, ready: statusOk && u.ready })), [linesWithOrg, unitsMeta, statusRows, statusOk])
  const unit = unitKey == null ? null : units.find(u => u.key === unitKey) || null
  // หน้าตรวจสอบจะแสดงเฉพาะหน่วยงาน/กลุ่มงานที่กดส่งผลงานแล้ว
  const submittedUnits = useMemo(() => units.filter(u => submissions.some(s =>
    s.scope_type === 'unit' ? Number(s.unit_id) === Number(u.key) :
      s.scope_type === 'group' && Number(u.key) < 0 && String(s.group_name || '') === String(u.group || '')
  )), [units, submissions])
  const selectedSubmission = unit ? submissions.find(s =>
    s.scope_type === 'unit' ? Number(s.unit_id) === Number(unit.key) :
      s.scope_type === 'group' && Number(unit.key) < 0 && String(s.group_name || '') === String(unit.group || '')
  ) || null : null

  const readyCount = units.filter(u => u.ready).length
  const pendingTotal = units.reduce((s, u) => s + u.pending, 0)
  const allReady = statusOk && units.length > 0 && readyCount === units.length
  const totals = useMemo(() => groups.reduce((a: any, g: any) => {
    const el = Number(g.n_eligible || 0), inel = Number(g.n_ineligible || 0)
    a.allocation += Number(g.full_amount || 0) * (el + inel); a.reserve += Number(g.reserve || 0) * el; a.carry += Number(g.carry_extra_in || 0)
    a.below += Number(g.below_threshold_difference || 0); a.pool += Number(g.pool_extra || 0); a.excess += Number(g.sum_excess || 0)
    return a
  }, { allocation: 0, reserve: 0, carry: 0, below: 0, pool: 0, excess: 0 }), [groups])

  const canAudit = isMember && !['reviewing', 'approved', 'closed'].includes(rstatus)
  const lockedReason = !isMember ? 'เฉพาะกรรมการที่ปฏิบัติหน้าที่เท่านั้นที่ส่งกลับหรือไม่อนุมัติกิจกรรมได้'
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

  const myVote = votes.find(v => v.user_id === currentUserId)
  const iAmExpected = (review?.expected_members || []).includes(currentUserId)
  const next = rstatus === 'closed' ? { text: 'งวดนี้ปิดและประกาศผลแล้ว', go: null as Tab | null, tone: 'ok' }
    : rstatus === 'reviewing' && iAmExpected && !myVote ? { text: 'ถึงคิวคุณลงมติแล้ว', go: 'close' as Tab, tone: 'act' }
      : rstatus === 'reviewing' ? { text: 'รอกรรมการลงมติให้ครบ', go: 'close' as Tab, tone: 'wait' }
        : allReady ? { text: 'ทุกหน่วยงานพร้อมตรวจ 100% เริ่มกระบวนการรับรองได้', go: 'close' as Tab, tone: 'act' }
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
        ? <UnitDetail unit={unit} groups={groups} siblings={submittedUnits} submission={selectedSubmission} onReturnPerson={canReturnSubmission ? returnSubmissionPerson : undefined} canAudit={canAudit} onBack={() => setUnitKey(null)} onSelectUnit={setUnitKey}
          onViewPerson={line => setPanel({ person: line })} onRandomAudit={() => setPanel({ person: null, randomUnitId: unit.key })} />
        : <UnitOverview units={submittedUnits} onOpen={openUnit} />)}
      {tab === 'close' && <ClosePanel review={review} votes={votes} roster={roster} currentUserId={currentUserId} isMember={isMember} activeCount={activeMembers.length}
        units={statusOk ? units : []} groups={groups} totals={totals} busy={busy} onStart={startReview} onVote={castVote} onOpenUnit={openUnit} />}
      {tab === 'roster' && isAdmin && <RosterAdmin sb={sb} members={members} roster={roster} version={version} busy={busy} runAction={runAction} setError={setError} />}
    </>}

    {panel && <ActivityPanel sb={sb} monthDate={monthDate} person={panel.person} randomUnitId={panel.randomUnitId} canAudit={canAudit} lockedReason={lockedReason}
      onClose={() => setPanel(null)} onChanged={refresh} />}
  </div>
}
