import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Coins, RefreshCw, Send, XCircle } from 'lucide-react'

const money = (v: any) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthDate = (m: string) => /^\d{4}-\d{2}$/.test(m) ? m + '-01' : m

export default function P4PFundManagement({ sb, month, setMonth, units = [], isCentralAdmin = false }: any) {
  const [calc, setCalc] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [unitId, setUnitId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [reviewAmounts, setReviewAmounts] = useState<Record<string,string>>({})
  const [comments, setComments] = useState<Record<string,string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setError('')
      const [c,q] = await Promise.all([
        sb.rpc('p4p_calc', { p_month: monthDate(month) }),
        sb.rpc('p4p_fund_requests_list', { p_month: monthDate(month) })
      ])
      if (!alive) return
      if (c.error) setError('โหลดผลคำนวณไม่สำเร็จ: ' + c.error.message)
      else setCalc(c.data)
      if (q.error) setError((old: string) => [old, 'โหลดคำขอไม่สำเร็จ: ' + q.error.message].filter(Boolean).join(' · '))
      else setRequests(q.data || [])
    }
    void load()
    return () => { alive = false }
  }, [sb, month, version])

  const lines = Array.isArray(calc?.lines) ? calc.lines : []
  const ineligible = useMemo(() => lines.filter((x: any) => !x.eligible && Number(x.ineligible_amount || 0) > 0), [lines])
  const recipients = useMemo(() => lines.filter((x: any) => Number(x.unit_fund_extra || 0) > 0), [lines])
  const visibleUnits = isCentralAdmin ? units : units.filter((u: any) => lines.some((x: any) => Number(x.unit_id) === Number(u.id)))
  const filtered = ineligible.filter((x: any) => !unitId || String(x.unit_id) === unitId)
  const totalIneligible = ineligible.reduce((n: number,x: any) => n + Number(x.ineligible_amount || 0),0)
  const regularPool = (calc?.groups || []).reduce((n: number,x: any) => n + Number(x.pool_extra || 0),0)
  const reserved = (id: number) => requests.filter((q: any) => Number(q.staff_directory_id) === Number(id) && ['pending','approved'].includes(q.status))
    .reduce((n: number,q: any) => n + Number(q.status === 'approved' ? q.approved_amount || 0 : q.requested_amount || 0),0)
  const available = (x: any) => Math.max(0,Number(x.ineligible_amount || 0)-reserved(x.staff_directory_id))
  const selected = ineligible.find((x: any) => String(x.staff_directory_id) === staffId && String(x.unit_id) === unitId)
  const pendingTotal = requests.filter((q: any) => q.status === 'pending').reduce((n: number,q: any) => n+Number(q.requested_amount || 0),0)
  const approvedTotal = requests.filter((q: any) => q.status === 'approved').reduce((n: number,q: any) => n+Number(q.approved_amount || 0),0)
  const distributedTotal = recipients.reduce((n: number,x: any) => n+Number(x.unit_fund_extra || 0),0)
  const unusedApproved = Math.max(0, approvedTotal - distributedTotal)

  const submit = async () => {
    if (!selected || !(Number(amount)>0) || !reason.trim()) { setMessage('กรุณาเลือกบุคลากร ระบุจำนวนเงิน และเหตุผล'); return }
    setBusy(true); setMessage('')
    const { error: e } = await sb.rpc('p4p_fund_request_create', {
      p_month: monthDate(month), p_staff_directory_id: Number(selected.staff_directory_id),
      p_unit_id: Number(selected.unit_id), p_amount: Number(amount), p_reason: reason.trim()
    })
    setBusy(false)
    if (e) setMessage('ส่งคำขอไม่สำเร็จ: ' + e.message)
    else { setMessage('ส่งคำขอเรียบร้อย รอผู้มีอำนาจพิจารณา'); setStaffId(''); setAmount(''); setReason(''); setVersion(v=>v+1) }
  }
  const decide = async (q: any, decision: string) => {
    const value = decision === 'approved' ? Number(reviewAmounts[q.id] || q.requested_amount) : 0
    if (decision === 'approved' && (!(value>0) || value>Number(q.requested_amount))) { setMessage('ยอดอนุมัติต้องมากกว่า 0 และไม่เกินยอดที่ขอ'); return }
    setBusy(true); setMessage('')
    const { error: e } = await sb.rpc('p4p_fund_request_decide', {
      p_request_id:q.id, p_decision:decision, p_approved_amount:value, p_comment:comments[q.id] || null
    })
    setBusy(false)
    if (e) setMessage('บันทึกผลไม่สำเร็จ: ' + e.message)
    else { setMessage(decision === 'approved' ? 'อนุมัติแล้ว เงินจะเข้ากองกลางหน่วยงานต้นทางเท่านั้น' : 'ไม่อนุมัติคำขอแล้ว'); setVersion(v=>v+1) }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold">บริหารเงินกองกลางและเงินผู้ไม่มีสิทธิ์</h2><p className="text-sm text-stone-500">เงินผู้ไม่มีสิทธิ์แยกเต็มจำนวน 100% ไม่หัก 3% และไม่ยกยอดอัตโนมัติ</p></div>
      <div className="flex items-center gap-2"><label className="text-sm">เดือน</label><input type="month" className="inp" value={month} onChange={e=>setMonth(e.target.value)}/><button className="btn sec" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={15}/> รีเฟรช</button></div>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">{message}</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="card"><div className="flex items-center gap-2 text-sm text-stone-500"><Coins size={16}/> เงินกองกลางปกติ</div><div className="mt-2 text-2xl font-bold">{money(regularPool)} บาท</div><p className="mt-1 text-xs text-stone-500">เงินกัน 3% และส่วนต่างผู้มีสิทธิ์คะแนนต่ำกว่าเกณฑ์</p></div>
      <div className="card"><div className="text-sm text-stone-500">เงินผู้ไม่มีสิทธิ์เต็มจำนวน</div><div className="mt-2 text-2xl font-bold">{money(totalIneligible)} บาท</div><p className="mt-1 text-xs text-stone-500">{ineligible.length} รายการ แยกจากกองกลางปกติ</p></div>
      <div className="card"><div className="text-sm text-stone-500">คำขอรอพิจารณา</div><div className="mt-2 text-2xl font-bold">{money(pendingTotal)} บาท</div></div>
      <div className="card"><div className="text-sm text-stone-500">ยอดอนุมัติให้นำไปใช้</div><div className="mt-2 text-2xl font-bold">{money(approvedTotal)} บาท</div><p className="mt-1 text-xs text-stone-500">ใช้ได้เฉพาะหน่วยงานต้นทาง</p></div>\n      <div className="card"><div className="text-sm text-stone-500">ยอดอนุมัติที่ยังไม่ถูกจัดสรร</div><div className="mt-2 text-2xl font-bold">{money(unusedApproved)} บาท</div><p className="mt-1 text-xs text-stone-500">ไม่ยกยอดไปเดือนถัดไป</p></div>
    </div>
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">ทะเบียนเงินผู้ไม่มีสิทธิ์</h3><p className="text-xs text-stone-500">ยอดจัดสรรรายบุคคลเต็มจำนวนก่อนหักเงินใด ๆ</p></div>
      <select className="inp min-w-56" value={unitId} onChange={e=>{setUnitId(e.target.value);setStaffId('')}}><option value="">ทุกหน่วยงาน</option>{visibleUnits.map((u:any)=><option key={u.id} value={String(u.id)}>{u.name}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr><th className="text-left">บุคลากร</th><th className="text-left">หน่วยงาน</th><th className="text-right">เงินแยกเต็มจำนวน</th><th className="text-right">จอง/อนุมัติ</th><th className="text-right">คงเหลือขอใช้ได้</th><th></th></tr></thead><tbody>
      {filtered.map((x:any)=><tr key={String(x.staff_directory_id)+'-'+String(x.unit_id)}><td>{x.name}<div className="text-xs text-stone-500">{x.position || ''}</div></td><td>{x.unit_name || 'ไม่ระบุ'}</td><td className="text-right">{money(x.ineligible_amount)}</td><td className="text-right">{money(reserved(x.staff_directory_id))}</td><td className="text-right font-semibold">{money(available(x))}</td><td className="text-right"><button className="text-sm underline disabled:opacity-40" disabled={available(x)<=0 || calc?.closed} onClick={()=>{setUnitId(String(x.unit_id));setStaffId(String(x.staff_directory_id));setAmount(String(available(x)));document.getElementById('fund-request-form')?.scrollIntoView({behavior:'smooth',block:'center'})}}>ขอใช้เงิน</button></td></tr>)}
      {!filtered.length && <tr><td colSpan={6} className="py-6 text-center text-stone-500">ไม่พบเงินผู้ไม่มีสิทธิ์ในเดือนนี้</td></tr>}
      </tbody></table></div>
    </section>
    <section id="fund-request-form" className="card space-y-3">
      <div><h3 className="font-bold">ส่งคำขอนำเงินกลับมาใช้ในหน่วยงาน</h3><p className="text-xs text-stone-500">เช่น บุคลากรลาศึกษาต่อและหน่วยงานไม่ได้ขออัตราทดแทน</p></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>หน่วยงานต้นทาง</span><select className="inp w-full" value={unitId} onChange={e=>{setUnitId(e.target.value);setStaffId('')}}><option value="">เลือกหน่วยงาน</option>{visibleUnits.map((u:any)=><option key={u.id} value={String(u.id)}>{u.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>บุคลากรผู้ไม่มีสิทธิ์</span><select className="inp w-full" value={staffId} onChange={e=>{setStaffId(e.target.value);const row=ineligible.find((x:any)=>String(x.staff_directory_id)===e.target.value&&String(x.unit_id)===unitId);if(row)setAmount(String(available(row)))}}><option value="">เลือกบุคลากร</option>{ineligible.filter((x:any)=>String(x.unit_id)===unitId).map((x:any)=><option key={x.staff_directory_id} value={String(x.staff_directory_id)}>{x.name} · คงเหลือ {money(available(x))} บาท</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>จำนวนเงินที่ขอใช้ (บาท)</span><input className="inp w-full" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>เหตุผล/รายละเอียดประกอบคำขอ</span><textarea className="inp w-full min-h-20" value={reason} onChange={e=>setReason(e.target.value)} placeholder="ระบุเหตุผลที่หน่วยงานขอนำเงินส่วนนี้กลับมาใช้"/></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-stone-500">{selected ? 'ยอดเงินต้นทาง '+money(selected.ineligible_amount)+' บาท · คงเหลือ '+money(available(selected))+' บาท' : 'เลือกบุคลากรเพื่อแสดงยอดเงินคงเหลือ'}</span><button className="btn" disabled={busy || calc?.closed} onClick={()=>void submit()}><Send size={15}/> ส่งคำขอให้พิจารณา</button></div>
      {calc?.closed && <p className="text-sm text-amber-700">งวดนี้ปิดแล้ว ไม่สามารถส่งคำขอได้</p>}
    </section>
    <section className="card space-y-3">
      <h3 className="font-bold">ประวัติคำขอและผลการพิจารณา</h3>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr><th className="text-left">บุคลากร/หน่วยงาน</th><th className="text-left">เหตุผล</th><th className="text-right">ขอใช้</th><th className="text-right">อนุมัติ</th><th>สถานะ</th><th className="text-left">หมายเหตุ</th>{isCentralAdmin&&<th>ดำเนินการ</th>}</tr></thead><tbody>
      {requests.map((q:any)=><tr key={q.id}><td>{q.staff_name}<div className="text-xs text-stone-500">{q.unit_name}</div></td><td className="max-w-64 whitespace-normal">{q.reason}</td><td className="text-right">{money(q.requested_amount)}</td><td className="text-right">{money(q.approved_amount)}</td><td>{q.status==='pending'?<span className="inline-flex items-center gap-1 text-amber-700"><Clock3 size={14}/> รอพิจารณา</span>:q.status==='approved'?<span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14}/> อนุมัติ</span>:<span className="inline-flex items-center gap-1 text-red-700"><XCircle size={14}/> ไม่อนุมัติ</span>}</td><td className="whitespace-normal">{q.review_comment||'—'}</td>
      {isCentralAdmin&&<td>{q.status==='pending'&&!calc?.closed?<div className="flex min-w-48 flex-col gap-1"><input className="inp w-full" type="number" min="0.01" max={q.requested_amount} step="0.01" value={reviewAmounts[q.id]??String(q.requested_amount)} onChange={e=>setReviewAmounts(old=>({...old,[q.id]:e.target.value}))}/><input className="inp w-full" placeholder="หมายเหตุ (ถ้ามี)" value={comments[q.id]||''} onChange={e=>setComments(old=>({...old,[q.id]:e.target.value}))}/><div className="flex gap-1"><button className="btn text-xs" disabled={busy} onClick={()=>void decide(q,'approved')}><CheckCircle2 size={13}/> อนุมัติ</button><button className="btn danger text-xs" disabled={busy} onClick={()=>void decide(q,'rejected')}><XCircle size={13}/> ไม่อนุมัติ</button></div></div>:'—'}</td>}
      </tr>)}
      {!requests.length&&<tr><td colSpan={isCentralAdmin?7:6} className="py-5 text-center text-stone-500">ยังไม่มีคำขอในเดือนนี้</td></tr>}
      </tbody></table></div>
    </section>
    <section className="card space-y-2"><h3 className="font-bold">ผลการจัดสรรเงินที่อนุมัติแล้ว</h3><p className="text-xs text-stone-500">จัดสรรให้ผู้มีสิทธิ์ที่มีคะแนนเกินแต้มประกัน ภายในหน่วยงานต้นทางเท่านั้น</p><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr><th className="text-left">ผู้รับจัดสรร</th><th className="text-left">หน่วยงาน</th><th className="text-right">เงินเพิ่ม</th></tr></thead><tbody>
      {recipients.map((x:any)=><tr key={String(x.staff_directory_id)+'-'+String(x.unit_id)}><td>{x.name}</td><td>{x.unit_name}</td><td className="text-right font-semibold">{money(x.unit_fund_extra)} บาท</td></tr>)}
      {!recipients.length&&<tr><td colSpan={3} className="py-5 text-center text-stone-500">ยังไม่มีการจัดสรรเงินผู้ไม่มีสิทธิ์ที่ได้รับอนุมัติ</td></tr>}
    </tbody></table></div></section>
    <p className="px-1 text-xs text-stone-500">เงินผู้ไม่มีสิทธิ์ไม่รวมในกองกลางปกติ ไม่ข้ามหน่วยงาน และยอดที่ไม่ได้ใช้ภายในเดือนจะไม่ยกไปเดือนถัดไป</p>
  </div>
}
