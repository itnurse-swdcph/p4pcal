import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, CheckCircle2, Paperclip, Printer, RotateCcw, X, XCircle } from 'lucide-react'
import { appConfirm } from '../AppDialog'
import { num } from './utils'

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: 'อนุมัติแล้ว', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  pending: { label: 'รอรับรอง', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  rejected: { label: 'ไม่อนุมัติ', cls: 'bg-red-50 text-red-800 border-red-200' },
  draft: { label: 'ร่าง', cls: 'bg-stone-100 text-stone-700 border-stone-200' }
}
const FILTERS: [string, string][] = [['all', 'ทั้งหมด'], ['approved', 'อนุมัติแล้ว'], ['pending', 'รอรับรอง'], ['rejected', 'ไม่อนุมัติ']]

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
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const personId = person && !String(person.id).startsWith('dir:') ? person.id : null
  const [printData, setPrintData] = useState<{ person: any; leave: any } | null>(null)
  const [preparingPrint, setPreparingPrint] = useState(false)
  const [personRow, setPersonRow] = useState<any>(null)
  const [evidencePaths, setEvidencePaths] = useState<Record<string, string>>({})

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
        const paths: Record<string, string> = {}
        const ids = list.map((r: any) => r.id)
        for (let i = 0; i < ids.length; i += 200) {
          const { data: ev } = await sb.from('logs').select('id,evidence_image_path').in('id', ids.slice(i, i + 200)).not('evidence_image_path', 'is', null)
          ;(ev || []).forEach((x: any) => { if (x.evidence_image_path) paths[String(x.id)] = x.evidence_image_path })
        }
        if (alive) setEvidencePaths(paths)
        if (personId) {
          const { data: pr } = await sb.from('people').select('org_role,position,unit_id').eq('id', personId).maybeSingle()
          if (alive) setPersonRow(pr || null)
        }
      } catch { /* ไม่แสดงปุ่มหลักฐาน/ใช้ค่าเริ่มต้นของการ์ดแต้ม */ }
    }
    load()
    return () => { alive = false }
  }, [sb, monthDate, personId, randomUnitId])

  const counts = useMemo(() => rows.reduce((a: any, r: any) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {}), [rows])
  const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter)
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
      if (e) throw e
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
    <section role="dialog" aria-modal="true" aria-label="กิจกรรมรายบุคคล" className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
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
          : <ul className="space-y-2">{shown.map(r => {
            const st = STATUS[r.status] || { label: r.status, cls: 'bg-stone-100 text-stone-700 border-stone-200' }
            const form = open && open.id === r.id ? open : null
            return <li key={r.id} className="rounded-xl border border-stone-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900">{r.title || r.activity_code}</div>
                  <div className="text-xs text-stone-600">{randomUnitId != null && <b>{r.person_name} · </b>}{new Date(r.work_date + 'T00:00:00').toLocaleDateString('th-TH', { dateStyle: 'medium' })}{r.shift ? ` · เวร${r.shift}` : ''} · จำนวน {num(r.qty)}</div>
                </div>
                <div className="text-right">
                  <span className={'inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ' + st.cls}>{st.label}</span>
                  <div className="mt-1 text-xs text-stone-600">แต้ม <b className="text-stone-900">{num(r.counted_points ?? r.points)}</b></div>
                </div>
              </div>
              {r.evidence && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-2 text-xs text-stone-700">หลักฐาน: {r.evidence}</p>}
              {r.reject_reason && r.status !== 'approved' && <p className="mt-2 text-xs text-red-800">เหตุผล: {r.reject_reason}</p>}
              {(r.status === 'approved' || (evidencePaths[String(r.id)] && openEvidence)) && <div className="mt-2 flex flex-wrap gap-2">
                {evidencePaths[String(r.id)] && openEvidence && <button type="button" className="btn sec !py-1" onClick={() => openEvidence(sb, evidencePaths[String(r.id)])}><Paperclip size={14} />ดูหลักฐาน</button>}
                {r.status === 'approved' && <>
                <button type="button" className="btn sec !py-1" disabled={!canAudit || busy} onClick={() => { setOpen({ id: r.id, type: 'return_for_correction' }); setReason(''); setError('') }}><RotateCcw size={14} />ส่งกลับให้แก้ไข</button>
                <button type="button" className="btn sec !py-1 !border-red-200 !text-red-700" disabled={!canAudit || busy} onClick={() => { setOpen({ id: r.id, type: 'reject' }); setReason(''); setError('') }}><XCircle size={14} />ไม่อนุมัติ</button>
                </>}
              </div>}
              {form && <div className="mt-2 space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <label className="block text-xs font-semibold text-stone-800">{form.type === 'return_for_correction' ? 'สิ่งที่ต้องแก้ไข (เจ้าของกิจกรรมจะเห็นข้อความนี้)' : 'เหตุผลที่ไม่อนุมัติ (เจ้าของกิจกรรมจะเห็นข้อความนี้)'}
                  <textarea autoFocus className="inp mt-1 min-h-16 w-full !cursor-text" value={reason} onChange={e => setReason(e.target.value)} placeholder="อย่างน้อย 5 ตัวอักษร" /></label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={'btn !py-1 ' + (form.type === 'reject' ? 'red' : '')} disabled={busy} onClick={submit}><CheckCircle2 size={14} />{busy ? 'กำลังบันทึก…' : form.type === 'return_for_correction' ? 'ยืนยันส่งกลับและแจ้งเตือน' : 'ยืนยันไม่อนุมัติและแจ้งเตือน'}</button>
                  <button type="button" className="btn sec !py-1" disabled={busy} onClick={() => { setOpen(null); setReason('') }}>ยกเลิก</button>
                </div>
              </div>}
            </li>
          })}</ul>}
      </div>
    </section>
    {printData && PrintSheet && <PrintSheet sb={sb} person={printData.person} rows={rows} month={monthDate.slice(0, 7)} units={units || []} positions={positions || []}
      leaveDataOverride={printData.leave} onClose={() => setPrintData(null)} />}
  </div>
}
