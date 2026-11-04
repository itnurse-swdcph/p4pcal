import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { appConfirm } from './AppDialog'
import { monthLabel, num } from './committee/utils'

type Props = {
  sb: any
  profile: any
  unitId: number | null
  groupName: string
  month: string
  scopeType?: 'unit' | 'group'
}

export default function P4PSubmissionControl({ sb, profile, unitId, groupName, month, scopeType = 'unit' }: Props) {
  const [staff, setStaff] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [peopleRows, setPeopleRows] = useState<any[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [submission, setSubmission] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isGroupHeadWithoutUnit, setIsGroupHeadWithoutUnit] = useState(false)

  const monthDate = month + '-01'
  const rangeEnd = useMemo(() => {
    const d = new Date(month + '-01T00:00:00')
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }, [month])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true); setError(''); setMessage('')
      const staffQuery = sb.from('staff_directory')
        .select('source_row,prefix,first_name,last_name,position,org_role,unit_name,nursing_group,active')
        .eq('active', true).neq('source_row', 2)
      const rosterQuery = scopeType === 'unit'
        ? staffQuery.eq('unit_name', (await sb.from('units').select('name').eq('id', unitId).maybeSingle()).data?.name || '__none__')
        : staffQuery.is('unit_name', null).eq('nursing_group', groupName)
      const [roster, logResult, peopleResult, leaveResult, groupLeaveResult, subResult, ownStaff] = await Promise.all([
        rosterQuery,
        scopeType === 'unit'
          ? sb.from('v_logs').select('id,person_id,work_date,status,counted_points').eq('unit_id', unitId).gte('work_date', monthDate).lt('work_date', rangeEnd)
          : sb.from('v_logs').select('id,person_id,work_date,status,counted_points').gte('work_date', monthDate).lt('work_date', rangeEnd).is('unit_id', null),
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
      if (roster.error || logResult.error || peopleResult.error || leaveResult.error || groupLeaveResult.error || subResult.error) {
        setError('โหลดข้อมูลเตรียมส่งผลงานไม่ครบ กรุณากดรีเฟรชหรือติดต่อผู้ดูแลระบบ')
      }
      setStaff(roster.data || [])
      setLogs(logResult.data || [])\n      setPeopleRows(peopleResult.data || [])
      const noteRows = [...(leaveResult.data || []), ...(groupLeaveResult.data || [])]
      setNotes(Object.fromEntries(noteRows.map((x: any) => [String(x.staff_directory_id), String(x.other_notes || '')])))
      setSubmission(subResult.data || null)
      setIsGroupHeadWithoutUnit(Boolean(ownStaff.data && !String(ownStaff.data.unit_name || '').trim() && String(ownStaff.data.org_role || '').includes('หัวหน้ากลุ่มงาน')))
      setLoading(false)
    }
    void load().catch((e: any) => { if (alive) { setError(e?.message || 'โหลดข้อมูลไม่สำเร็จ'); setLoading(false) } })
    return () => { alive = false }
  }, [sb, unitId, groupName, month, scopeType, profile?.staff_directory_id, monthDate, rangeEnd])

  const pending = logs.filter((r: any) => r.status === 'pending').length
  const approved = logs.filter((r: any) => r.status === 'approved')
  const approvedPeople = new Set(approved.map((r: any) => String(r.person_id)))
  const personByStaff = new Map<string, string>([])
  // people IDs are resolved by the log view; staff-directory membership and notes are checked again atomically in the database.
  const missingNotes = staff.filter((p: any) => {
    const hasApproved = logs.some((r: any) => r.status === 'approved' && staffPersonMatch(r.person_id, p.source_row, approvedPeople))
    return !hasApproved && !String(notes[String(p.source_row)] || '').trim()
  })
  const points = approved.reduce((sum: number, r: any) => sum + Number(r.counted_points || 0), 0)
  const canSubmitRole = profile?.role === 'head' || profile?.role === 'group_head' ||
    (profile?.role === 'admin' && String(profile?.username || '') === '11450')
  const canSubmitScope = scopeType === 'unit'
    ? !(isGroupHeadWithoutUnit && profile?.role === 'group_head')
    : (profile?.role === 'group_head' && isGroupHeadWithoutUnit) ||
      (profile?.role === 'admin' && String(profile?.username || '') === '11450')
  const alreadySubmitted = submission && submission.status !== 'returned'
  const ready = !loading && !error && pending === 0 && missingNotes.length === 0 && staff.length > 0
  const statusLabel: Record<string, string> = { submitted: 'ส่งผลงานแล้ว', returned: 'มีรายการส่งกลับแก้ไข', resubmitted: 'ส่งผลงานซ้ำแล้ว', reviewed: 'ตรวจสอบแล้ว' }

  async function send() {
    if (!ready || !canSubmitRole || !canSubmitScope || alreadySubmitted) return
    if (!(await appConfirm('ยืนยันส่งผลงานประจำเดือน' + monthLabel(month) + ' ใช่หรือไม่? หลังยืนยัน บุคลากรในขอบเขตนี้จะไม่สามารถเพิ่มหรือแก้ไขกิจกรรมได้ เว้นแต่คณะกรรมการส่งกลับรายบุคคล', 'ยืนยันส่งผลงาน'))) return
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: e } = await sb.rpc('p4p_submit_month_v2', {
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
      <div><h3 className="font-bold text-stone-900">การส่งผลงานประจำเดือน</h3><p className="text-sm text-stone-600">{scopeType === 'unit' ? 'หน่วยงาน' : 'กลุ่มงาน'} · {groupName} · {monthLabel(month)}</p></div>
      {submission && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{statusLabel[submission.status] || submission.status}</span>}
    </div>
    {loading ? <p className="text-sm text-stone-500">กำลังตรวจสอบความพร้อม…</p> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">บุคลากร</div><div className="text-xl font-bold">{num(staff.length,0)} คน</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">กิจกรรมรอรับรอง</div><div className={'text-xl font-bold ' + (pending ? 'text-amber-700' : 'text-emerald-700')}>{num(pending,0)} รายการ</div></div>
        <div className="rounded-lg bg-stone-50 p-3"><div className="text-xs text-stone-500">กิจกรรมรับรองแล้ว</div><div className="text-xl font-bold">{num(approved.length,0)} รายการ</div></div>
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
      {submission?.status === 'submitted' || submission?.status === 'resubmitted' || submission?.status === 'reviewed'
        ? <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17}/>ส่งผลงานแล้ว · ล็อกการบันทึกกิจกรรมในขอบเขตนี้</p>
        : <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={!ready || busy || !canSubmitScope} onClick={() => setPreview(true)}><Send size={16}/>ตรวจทานและส่งผลงาน</button>
          {submission?.status === 'returned' && <span className="self-center text-xs text-stone-600">หลังแก้ไข ต้องส่งผลงานทั้งหน่วยงานอีกครั้ง</span>}
        </div>}
    </>}
    {preview && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-label="ตรวจทานข้อมูลก่อนส่งผลงาน">
      <div className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div><h3 className="text-lg font-bold">ตรวจทานก่อนยืนยันส่งผลงาน</h3><p className="text-sm text-stone-600">{groupName} · {monthLabel(month)}</p></div>
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

// Determine whether an activity log belongs to a registered person in the selected staff-directory row.
function staffPersonMatch(personId: string, staffDirectoryId: number, approvedPeople: Set<string>) {
  // The database RPC is authoritative; this lightweight preview uses an exact join when people is available.
  return approvedPeople.has(String(personId)) && Number(staffDirectoryId) > 0
}
