import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, FilePlus2, RefreshCw, ShieldCheck, Users } from 'lucide-react'

const statusText: Record<string, string> = {
  pending: 'รอพิจารณา', needs_info: 'ขอข้อมูลเพิ่มเติม', approved: 'อนุมัติและเปิดสิทธิ์แล้ว',
  rejected: 'ไม่อนุมัติ', editing: 'กำลังแก้ไข', resubmitted: 'ส่งแก้ไขแล้ว', closed: 'ปิดคำอุทธรณ์'
}
const statusTone: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-800 border-red-200',
  closed: 'bg-stone-100 text-stone-700 border-stone-200',
  needs_info: 'bg-sky-50 text-sky-800 border-sky-200',
  editing: 'bg-teal-50 text-teal-800 border-teal-200',
  resubmitted: 'bg-indigo-50 text-indigo-800 border-indigo-200'
}

export default function P4PAppealsPage({ sb, month, setMonth }: any) {
  const [data, setData] = useState<any>({ staff: [], appeals: [], role: 'staff', is_admin: false, month_closed: false })
  const [selected, setSelected] = useState<number[]>([])
  const [unitFilter, setUnitFilter] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [direct, setDirect] = useState(false)
  const [days, setDays] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setError('')
    const { data: result, error: loadError } = await sb.rpc('p4p_appeal_dashboard', { p_month: month + '-01' })
    if (loadError) { setError(loadError.message || 'โหลดข้อมูลอุทธรณ์ไม่สำเร็จ'); return }
    setData(result || { staff: [], appeals: [], role: 'staff', is_admin: false, month_closed: false })
  }, [sb, month])

  useEffect(() => { void load() }, [load])
  const staff = data.staff || []
  const appeals = data.appeals || []
  const canDecide = !!data.is_admin || data.role === 'committee'
  const unitOptions = useMemo(() => Array.from(new Map<string, any>(staff.filter((p: any) => p.unit_id != null).map((p: any) => [String(p.unit_id), { id: String(p.unit_id), name: p.unit_name || 'หน่วยงาน' }])).values()), [staff])
  const visibleStaff = useMemo(() => {
    const q = staffSearch.trim().toLocaleLowerCase()
    return staff.filter((p: any) => {
      const inUnit = data.is_admin || !unitFilter || String(p.unit_id ?? '') === unitFilter
      const haystack = [p.name, p.position, p.unit_name].filter(Boolean).join(' ').toLocaleLowerCase()
      return inUnit && (!q || haystack.includes(q))
    })
  }, [staff, unitFilter, staffSearch, data.is_admin])
  useEffect(() => { if (!data.is_admin && !unitFilter && unitOptions.length) setUnitFilter(unitOptions[0].id) }, [unitFilter, unitOptions, data.is_admin])

  const submit = async () => {
    if (!selected.length || reason.trim().length < 5) { setError('กรุณาเลือกรายชื่อและระบุเหตุผลอย่างน้อย 5 ตัวอักษร'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const { data: result, error: actionError } = await sb.rpc('p4p_create_appeal', {
        p_month: month + '-01', p_staff_directory_ids: selected, p_reason: reason.trim(),
        p_details: details.trim(), p_direct: !!(direct && data.is_admin), p_days: days
      })
      if (actionError) throw actionError
      setMessage(result?.status === 'approved' ? 'เปิดสิทธิ์แก้ไขให้รายชื่อที่เลือกแล้ว' : 'ส่งคำอุทธรณ์เรียบร้อย รอการพิจารณา')
      setSelected([]); setReason(''); setDetails(''); setDirect(false)
      await load()
    } catch (e: any) { setError(e?.message || 'ส่งคำอุทธรณ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const decide = async (id: string, decision: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: actionError } = await sb.rpc('p4p_decide_appeal', {
        p_appeal_id: id, p_decision: decision, p_comment: comment.trim(), p_days: days
      })
      if (actionError) throw actionError
      setMessage(decision === 'approved' ? 'อนุมัติและเปิดสิทธิ์เฉพาะรายชื่อในคำขอแล้ว' : decision === 'rejected' ? 'บันทึกผลไม่อนุมัติแล้ว' : 'ส่งคำขอกลับเพื่อขอข้อมูลเพิ่มเติมแล้ว')
      setComment('')
      await load()
    } catch (e: any) { setError(e?.message || 'ดำเนินการไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const closeAppeal = async (id: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: actionError } = await sb.rpc('p4p_close_appeal', { p_appeal_id: id, p_comment: comment.trim() })
      if (actionError) throw actionError
      setMessage('ปิดคำอุทธรณ์และล็อกสิทธิ์เพิ่มเติมแล้ว')
      setComment('')
      await load()
    } catch (e: any) { setError(e?.message || 'ปิดคำอุทธรณ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <section className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800"><ShieldCheck size={18}/>ประกาศผลและอุทธรณ์คะแนน P4P</div>
          <h2 className="mt-1 text-xl font-bold">คำอุทธรณ์ประจำเดือน</h2>
          <p className="mt-1 text-sm text-stone-500">ยื่นได้หลังปิดยอดและประกาศผลแล้ว ระบบเปิดสิทธิ์เฉพาะเจ้าหน้าที่ที่ระบุในคำขอ</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="inp !w-40" value={month} onChange={e => e.target.value && setMonth(e.target.value)} aria-label="เลือกเดือน"/>
          <button type="button" className="btn sec" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/>รีเฟรช</button>
        </div>
      </div>
      <div className={'rounded-xl border p-3 text-sm ' + (data.month_closed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
        {data.month_closed ? <><CheckCircle2 className="inline mr-2" size={16}/>เดือนนี้ปิดยอดแล้ว สามารถยื่นอุทธรณ์ได้</> : <><AlertCircle className="inline mr-2" size={16}/>เดือนนี้ยังไม่ปิดยอด จึงยังไม่เปิดรับอุทธรณ์</>}
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      {data.month_closed && staff.length > 0 && <div className="space-y-3 border-t border-stone-200 pt-3">
        <div className="flex items-center gap-2 font-semibold text-stone-800"><FilePlus2 size={17}/>ยื่นอุทธรณ์ / ขอเปิดสิทธิ์บันทึกคะแนนเพิ่มเติม</div>
        <p className="text-xs text-stone-500">{data.is_admin ? 'Admin กลางค้นหาและเลือกเจ้าหน้าที่ข้ามหน่วยงานได้ในคำอุทธรณ์ครั้งเดียว' : data.role === 'head' || data.role === 'group_head' ? 'หัวหน้าหน่วยงานเลือกเจ้าหน้าที่ในขอบเขตที่รับผิดชอบได้หลายคน' : 'เจ้าหน้าที่สามารถยื่นอุทธรณ์คะแนนของตนเองได้'}</p>
        {!data.is_admin && unitOptions.length > 1 && <label className="block space-y-1 text-sm"><span className="font-semibold">เลือกหน่วยงาน (หัวหน้ายื่นได้เฉพาะหน่วยงานที่รับผิดชอบ)</span><select className="inp w-full" value={unitFilter} onChange={e => { setUnitFilter(e.target.value); setSelected([]) }}><option value="">เลือกหน่วยงาน</option>{unitOptions.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        {data.is_admin && <label className="block space-y-1 text-sm"><span className="font-semibold">ค้นหาชื่อเจ้าหน้าที่ทุกหน่วยงาน</span><input className="inp w-full" value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="พิมพ์ชื่อ นามสกุล ตำแหน่ง หรือหน่วยงาน…"/></label>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500"><span>เลือกแล้ว {selected.length} รายชื่อ · พบ {visibleStaff.length} รายชื่อ</span><div className="flex gap-2"><button type="button" className="underline" onClick={() => setSelected(old => [...new Set([...old, ...visibleStaff.map((p: any) => Number(p.staff_directory_id))])])}>เลือกทั้งหมดที่แสดง</button><button type="button" className="underline" onClick={() => setSelected([])}>ล้างรายชื่อ</button></div></div>
        <div className="max-h-64 overflow-auto rounded-xl border border-stone-200 p-2 space-y-1">
          {visibleStaff.map((p: any) => <label key={p.staff_directory_id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-stone-50 text-sm">
            <input type="checkbox" className="mt-1" checked={selected.includes(Number(p.staff_directory_id))}
              onChange={e => setSelected(old => e.target.checked ? [...old, Number(p.staff_directory_id)] : old.filter(x => x !== Number(p.staff_directory_id)))}/>
            <span><b>{p.name}</b><span className="block text-xs text-stone-500">{p.position} · {p.unit_name || 'ไม่ระบุหน่วยงาน'}</span></span>
          </label>)}
        </div>
        <label className="block space-y-1 text-sm"><span className="font-semibold">เหตุผลในการอุทธรณ์</span><textarea className="inp min-h-20 w-full" value={reason} onChange={e => setReason(e.target.value)} placeholder="ระบุเหตุผลที่ต้องการขอเพิ่มหรือแก้ไขคะแนน"/></label>
        <label className="block space-y-1 text-sm"><span className="font-semibold">รายละเอียดกิจกรรม/คะแนนที่ต้องการแก้ไข (ถ้ามี)</span><textarea className="inp min-h-20 w-full" value={details} onChange={e => setDetails(e.target.value)} placeholder="เช่น ลืมบันทึกกิจกรรมวันที่... รหัสกิจกรรม..."/></label>
        {data.is_admin && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-stone-50 p-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={direct} onChange={e => setDirect(e.target.checked)}/>อนุมัติและเปิดสิทธิ์ทันทีในฐานะ Admin กลาง</label>
          <label className="flex items-center gap-2">เปิดสิทธิ์ <select className="inp !w-20" value={days} onChange={e => setDays(Number(e.target.value))}>{[1,2,3,5,7,14].map(n => <option key={n} value={n}>{n}</option>)}</select> วัน</label>
        </div>}
        <button type="button" className="btn" onClick={() => void submit()} disabled={busy || !selected.length || reason.trim().length < 5}><FilePlus2 size={16}/>{busy ? 'กำลังบันทึก…' : direct && data.is_admin ? 'ยื่นและเปิดสิทธิ์ทันที' : 'ส่งคำอุทธรณ์'}</button>
      </div>}
    </section>
    <section className="card space-y-3">
      <div className="flex items-center gap-2 font-semibold text-stone-800"><Users size={18}/>รายการคำอุทธรณ์</div>
      {appeals.length === 0 ? <p className="text-sm text-stone-500">ยังไม่มีคำอุทธรณ์ในเดือนนี้</p> : appeals.map((a: any) => <article key={a.id} className="rounded-xl border border-stone-200 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><b>{a.unit_name || 'คำอุทธรณ์รายบุคคล'}</b><p className="text-xs text-stone-500">ผู้ยื่น: {a.submitter_name} · {new Date(a.created_at).toLocaleString('th-TH')}</p></div>
          <span className={'rounded-full border px-2.5 py-1 text-xs font-semibold ' + (statusTone[a.status] || 'bg-stone-50 text-stone-700')}>{statusText[a.status] || a.status}</span>
        </div>
        <div className="text-sm"><b>เหตุผล:</b> {a.reason}</div>
        {a.details && <div className="text-sm"><b>รายละเอียด:</b> {a.details}</div>}
        <div className="flex flex-wrap gap-2">{(a.people || []).map((p: any) => <span key={p.staff_directory_id} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs">{p.name}</span>)}</div>
        {a.expires_at && a.status === 'approved' && <p className="text-xs text-amber-700"><Clock3 className="inline mr-1" size={13}/>สิทธิ์หมดอายุ {new Date(a.expires_at).toLocaleString('th-TH')}</p>}
        {a.reviewer_name && <p className="text-xs text-stone-500">ผู้พิจารณา: {a.reviewer_name}{a.review_comment ? ' · '+a.review_comment : ''}</p>}
        {canDecide && ['pending','needs_info','resubmitted'].includes(a.status) && <div className="space-y-2 border-t pt-2">
          <input className="inp w-full" value={comment} onChange={e => setComment(e.target.value)} placeholder="ความเห็นประกอบการพิจารณา (ถ้ามี)"/>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={() => void decide(a.id,'approved')}>อนุมัติและเปิดสิทธิ์</button>
            <button className="btn danger" disabled={busy} onClick={() => void decide(a.id,'rejected')}>ไม่อนุมัติ</button>
          </div>
        </div>}
        {canDecide && ['approved','editing','resubmitted','rejected','needs_info'].includes(a.status) && <button className="btn sec" disabled={busy} onClick={() => void closeAppeal(a.id)}>ปิดคำอุทธรณ์และล็อกสิทธิ์</button>}
      </article>)}
    </section>
  </div>
}
