import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react'

const money = (value: any) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const number = (value: any) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
const dateLabel = (month: string) => {
  const [year, m] = String(month || '').split('-').map(Number)
  const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
  return year && m ? `${names[m - 1]} พ.ศ. ${year + 543}` : month
}

export default function P4PCommitteePage({ sb, month, isAdmin, currentUserId }: any) {
  const [calc, setCalc] = useState<any>(null)
  const [review, setReview] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [votes, setVotes] = useState<any[]>([])
  const [committeeProfiles, setCommitteeProfiles] = useState<any[]>([])
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const monthDate = `${month}-01`

  const refresh = () => setVersion(v => v + 1)
  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError('')
      const [calcResult, reviewResult, memberResult, voteResult, rosterResult] = await Promise.all([
        sb.rpc('p4p_committee_calc', { p_month: monthDate }),
        sb.from('p4p_monthly_reviews').select('*').eq('month', monthDate).maybeSingle(),
        sb.from('p4p_committee_members').select('user_id,active,is_chair,appointed_at').order('appointed_at'),
        sb.from('p4p_monthly_review_votes').select('month,user_id,decision,comment,voted_at').eq('month', monthDate).order('voted_at'),
        sb.rpc('p4p_committee_roster')
      ])
      if (!alive) return
      if (calcResult.error) setError(calcResult.error.message || 'ไม่สามารถโหลดผลคำนวณ P4P ได้')
      else setCalc(calcResult.data)
      if (reviewResult.error) setError(reviewResult.error.message || 'ไม่สามารถโหลดสถานะการรับรองได้')
      else setReview(reviewResult.data)
      if (memberResult.error) setError(memberResult.error.message || 'ไม่สามารถโหลดรายชื่อกรรมการได้')
      else setMembers(memberResult.data || [])
      if (voteResult.error) setError(voteResult.error.message || 'ไม่สามารถโหลดผลลงมติได้')
      else setVotes(voteResult.data || [])
      if (rosterResult.error) setError(rosterResult.error.message || 'ไม่สามารถโหลดทะเบียนกรรมการได้')
      else setCommitteeProfiles(rosterResult.data || [])
      if (isAdmin) {
        const profileResult = await sb.from('profiles').select('user_id,full_name,username,role').eq('role', 'committee').order('full_name')
        if (!alive) return
        if (!profileResult.error) setAvailableProfiles(profileResult.data || [])
      }
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [sb, monthDate, isAdmin, version])

  const activeMembers = useMemo(() => members.filter(x => x.active), [members])
  const myMembership = activeMembers.find(x => x.user_id === currentUserId)
  const isChair = !!myMembership?.is_chair
  const isMember = !!myMembership
  const myVote = votes.find(x => x.user_id === currentUserId)
  const expectedVotes = Number(review?.expected_members?.length || 0)
  const approvedVotes = votes.filter(x => x.decision === 'approved').length
  const pendingCount = Number(calc?.warnings?.pending_rows ?? review?.pending_count ?? 0)
  const viewCalc = review?.status === 'reviewing' || review?.status === 'approved' ? (review.snapshot || calc) : calc
  const groups = viewCalc?.groups || []
  const lines = viewCalc?.lines || []
  const totals = useMemo(() => groups.reduce((acc: any, g: any) => {
    const eligible = Number(g.n_eligible || 0)
    const ineligible = Number(g.n_ineligible || 0)
    acc.allocation += Number(g.full_amount || 0) * (eligible + ineligible)
    acc.reserve += Number(g.reserve || 0) * eligible
    acc.carry += Number(g.carry_extra_in || 0)
    acc.byScore += Number(g.by_score || 0) * eligible
    acc.below += Number(g.below_threshold_difference || 0)
    acc.pool += Number(g.pool_extra || 0)
    acc.excess += Number(g.sum_excess || 0)
    return acc
  }, { allocation: 0, reserve: 0, carry: 0, byScore: 0, below: 0, pool: 0, excess: 0 }), [groups])

  const runAction = async (label: string, action: () => Promise<any>) => {
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await action()
      if (result?.error) throw result.error
      const data = result?.data
      if (data?.ok === false) {
        setError(data.reason === 'pending_items' ? `ยังมีรายการรอรับรอง ${data.pending_count || 0} รายการ` :
          data.reason === 'snapshot_changed' ? 'ข้อมูลคะแนนเปลี่ยนหลังลงมติ ต้องเริ่มรับรองใหม่' :
          data.reason === 'committee_roster_changed' ? 'รายชื่อกรรมการเปลี่ยนแปลง ต้องเริ่มรับรองใหม่' : 'ไม่สามารถดำเนินการได้')
      } else {
        setMessage(label)
        setComment('')
      }
      refresh()
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally { setBusy(false) }
  }

  const startReview = () => {
    if (review?.status === 'approved' && !window.confirm('การเริ่มรับรองใหม่จะล้างมติเดิมทั้งหมด ต้องการดำเนินการต่อหรือไม่?')) return
    runAction('เริ่มกระบวนการรับรองผลแล้ว', () => sb.rpc('p4p_start_review', { p_month: monthDate }))
  }
  const castVote = (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && comment.trim().length < 5) {
      setError('กรุณาระบุเหตุผลที่ไม่เห็นชอบอย่างน้อย 5 ตัวอักษร')
      return
    }
    runAction(decision === 'approved' ? 'บันทึกมติอนุมัติแล้ว' : 'บันทึกมติไม่อนุมัติแล้ว', () =>
      sb.rpc('p4p_review_vote', { p_month: monthDate, p_decision: decision, p_comment: comment }))
  }
  const closeMonth = () => {
    if (!window.confirm('ยืนยันปิดงวด P4P เดือนนี้ในฐานะประธานคณะกรรมการใช่หรือไม่? เมื่อปิดแล้วผลเงินเพิ่มจะถูกเปิดเผยแก่บุคลากร')) return
    runAction('ปิดงวดสำเร็จ และเผยแพร่ผลตาม snapshot แล้ว', () => sb.rpc('p4p_close', { p_month: monthDate }))
  }
  const setMember = (userId: string, active: boolean, chair = false) =>
    runAction('บันทึกทะเบียนกรรมการแล้ว', () => sb.rpc('p4p_set_committee_member', {
      p_user_id: userId, p_active: active, p_is_chair: chair
    }))
  const profileName = (id: string) => {
    const p = committeeProfiles.find(x => x.user_id === id)
    return p?.full_name || p?.username || `บัญชี …${String(id).slice(-8)}`
  }
  const statusLabel: Record<string, string> = {
    reviewing: 'อยู่ระหว่างลงมติ', approved: 'กรรมการอนุมัติครบแล้ว', rejected: 'มีมติไม่เห็นชอบ',
    stale: 'ข้อมูลเปลี่ยน ต้องรับรองใหม่', closed: 'ปิดงวดแล้ว', reopened: 'เปิดงวดใหม่แล้ว'
  }

  return <div className="space-y-4">
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-teal-800"><ShieldCheck size={18}/> ศูนย์ควบคุมและรับรองผล P4P</div>
          <h2 className="mt-1 text-xl font-bold">ประมาณการจัดสรรค่าตอบแทนตามผลการปฏิบัติงาน</h2>
          <p className="text-sm text-stone-600">ประจำเดือน{dateLabel(month)} · แสดงผลคำนวณแยก 5 กลุ่มวิชาชีพ</p>
        </div>
        <button type="button" className="btn sec" onClick={refresh} disabled={loading || busy}><RefreshCw size={15} className="inline mr-1"/>รีเฟรชข้อมูล</button>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1">สถานะ: {statusLabel[review?.status] || 'ยังไม่เริ่มรับรอง'}</span>
        {review?.status === 'closed' && <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800"><LockKeyhole size={14} className="inline mr-1"/>ปิดงวดแล้ว</span>}
        <span className="rounded-full bg-slate-100 px-3 py-1">มติอนุมัติ {approvedVotes}/{expectedVotes || activeMembers.length} คน</span>
      </div>
    </div>

    {loading ? <div className="card text-sm text-stone-500">กำลังโหลดข้อมูลการจัดสรร…</div> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          ['ยอดเงินจัดสรรในเดือนนี้', totals.allocation, 'บาท'],
          ['เงินกัน 3% ในเดือนนี้', totals.reserve, 'บาท'],
          ['เงินสะสมงวดก่อน', totals.carry, 'บาท'],
          ['จำนวนเงินตามผลงาน', totals.byScore, 'บาท'],
          ['เงินส่วนต่างผู้ได้ต่ำกว่าเกณฑ์', totals.below, 'บาท'],
          ['เงินรอจัดสรรจากแต้มส่วนเกิน', totals.pool, 'บาท'],
          ['แต้มส่วนเกินรวม', totals.excess, 'แต้ม']
        ].map(([label, value, unit]: any) => <div key={label} className="card !p-3">
          <div className="text-xs text-stone-600">{label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{number(value)} <span className="text-xs font-normal text-stone-500">{unit}</span></div>
        </div>)}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 font-semibold"><ClipboardCheck size={18}/> สรุปการจัดสรรแยกตามกลุ่มวิชาชีพ</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2">กลุ่มวิชาชีพ</th><th className="p-2 text-right">บุคลากร</th><th className="p-2 text-right">ต่ำกว่าเกณฑ์</th>
              <th className="p-2 text-right">เงินกัน 3%</th><th className="p-2 text-right">ยอดยกมา</th>
              <th className="p-2 text-right">เงินส่วนต่าง</th><th className="p-2 text-right">แต้มส่วนเกิน</th>
              <th className="p-2 text-right">เงินจัดสรรส่วนเกิน</th><th className="p-2 text-right">บาท/แต้ม</th>
            </tr></thead>
            <tbody>{groups.map((g: any) => <tr key={g.pay_group} className="border-b last:border-0">
              <td className="p-2 font-medium">{g.name || `กลุ่ม ${g.pay_group}`}</td>
              <td className="p-2 text-right tabular-nums">{number(Number(g.n_eligible || 0) + Number(g.n_ineligible || 0))}</td>
              <td className="p-2 text-right tabular-nums">{number(g.n_below)}</td>
              <td className="p-2 text-right tabular-nums">{money(Number(g.reserve || 0) * Number(g.n_eligible || 0))}</td>
              <td className="p-2 text-right tabular-nums">{money(g.carry_extra_in)}</td>
              <td className="p-2 text-right tabular-nums">{money(g.below_threshold_difference)}</td>
              <td className="p-2 text-right tabular-nums">{number(g.sum_excess)}</td>
              <td className="p-2 text-right tabular-nums">{money(g.pool_extra)}</td>
              <td className="p-2 text-right tabular-nums">{money(g.rate_per_point)}</td>
            </tr>)}
            {!groups.length && <tr><td colSpan={9} className="p-5 text-center text-stone-500">ไม่พบข้อมูลกลุ่มวิชาชีพ</td></tr>}
          </tbody></table>
        </div>
        <p className="text-xs text-stone-500">อัตราเงินเพิ่มคำนวณจากเงินใน pool_extra หารด้วยแต้มส่วนเกินรวมของกลุ่ม ตามสูตรจัดสรรเดิม</p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 font-semibold"><Users size={18}/> รายชื่อบุคลากรและเงินเพิ่มประมาณการ (สำหรับคณะกรรมการ)</div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="sticky top-0 bg-white"><tr className="border-b text-left">
              <th className="p-2">ชื่อ-สกุล</th><th className="p-2">ตำแหน่ง</th><th className="p-2">หน่วยงาน</th>
              <th className="p-2 text-right">กลุ่ม</th><th className="p-2 text-right">คะแนนนับได้</th>
              <th className="p-2 text-right">เงินเพิ่มประมาณการ</th>
            </tr></thead>
            <tbody>{lines.map((line: any, index: number) => <tr key={line.id || index} className="border-b last:border-0">
              <td className="p-2">{line.name || '—'}</td><td className="p-2">{line.position || '—'}</td><td className="p-2">{line.unit_name || '—'}</td>
              <td className="p-2 text-right">{line.pay_group || '—'}</td><td className="p-2 text-right tabular-nums">{number(line.counted)}</td>
              <td className="p-2 text-right tabular-nums font-semibold">{money(line.extra)} บาท</td>
            </tr>)}
            {!lines.length && <tr><td colSpan={6} className="p-5 text-center text-stone-500">ไม่พบข้อมูลรายบุคคล</td></tr>}
          </tbody></table>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">การรับรองผลและปิดงวด</div>
          <div className="text-sm text-stone-600">รายการรอรับรอง: <b className={pendingCount > 0 ? 'text-red-700' : 'text-emerald-700'}>{number(pendingCount)}</b></div>
        </div>
        {pendingCount > 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={16} className="inline mr-1"/>ต้องรับรองรายการกิจกรรมทั้งหมดก่อน เริ่มลงมติและปิดงวดไม่ได้</div>}
        {pendingCount === 0 && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={16} className="inline mr-1"/>ไม่มีรายการรอรับรองค้างอยู่</div>}

        {isAdmin && review?.status !== 'closed' && <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={busy || pendingCount > 0 || activeMembers.length === 0 || activeMembers.filter(x => x.is_chair).length !== 1 || review?.status === 'reviewing'} onClick={startReview}>
            {review?.status === 'approved' ? 'เริ่มรับรองใหม่ (ล้างมติเดิม)' : 'เริ่มกระบวนการรับรอง'}
          </button>
          <span className="text-xs text-stone-500">Admin เริ่มกระบวนการได้ แต่ไม่มีสิทธิ์ยืนยันปิดงวด</span>
        </div>}

        {review?.status === 'reviewing' && isMember && !myVote && <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
          <p className="text-sm font-semibold">กรุณาตรวจสอบข้อมูลและลงมติในฐานะกรรมการ</p>
          <textarea className="inp min-h-20 w-full" value={comment} onChange={e => setComment(e.target.value)} placeholder="หมายเหตุ/เหตุผล (จำเป็นเมื่อไม่เห็นชอบ)" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={busy || pendingCount > 0} onClick={() => castVote('approved')}>อนุมัติผลการจัดสรร</button>
            <button type="button" className="btn sec" disabled={busy || pendingCount > 0 || comment.trim().length < 5} onClick={() => castVote('rejected')}>ไม่เห็นชอบ / ส่งกลับแก้ไข</button>
          </div>
        </div>}
        {myVote && <p className="text-sm text-teal-800">คุณลงมติแล้ว: {myVote.decision === 'approved' ? 'อนุมัติ' : 'ไม่เห็นชอบ'} · {myVote.voted_at ? new Date(myVote.voted_at).toLocaleString('th-TH') : ''}</p>}
        {review?.status === 'reviewing' && <div className="text-sm text-stone-600">รอกรรมการอนุมัติครบทุกคน: {approvedVotes}/{expectedVotes} คน</div>}
        {review?.status === 'approved' && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={16} className="inline mr-1"/>กรรมการอนุมัติครบทุกคนแล้ว รอประธานยืนยันปิดงวด</div>}
        {review?.status === 'approved' && isChair && <button type="button" className="btn" disabled={busy || pendingCount > 0} onClick={closeMonth}><LockKeyhole size={16} className="inline mr-1"/>ประธานยืนยันปิดงวด</button>}
        {review?.status === 'approved' && !isChair && <p className="text-sm text-stone-600">ขั้นตอนถัดไปให้ประธานคณะกรรมการยืนยันปิดงวดเพียงคนเดียว</p>}
        {review?.status === 'closed' && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">ปิดงวดแล้ว · บุคลากรสามารถเห็นผลเงินเพิ่มของตนเองได้</div>}
        {review?.status === 'rejected' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">มีกรรมการไม่เห็นชอบ Admin ต้องตรวจสอบและเริ่มกระบวนการรับรองใหม่</div>}
        {review?.status === 'stale' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">ข้อมูลหรือรายชื่อกรรมการเปลี่ยนแปลง ต้องเริ่มกระบวนการรับรองใหม่</div>}
      </div>

      {isAdmin && <div className="card space-y-3">
        <div className="font-semibold">จัดการรายชื่อคณะกรรมการ P4P</div>
        <p className="text-xs text-stone-500">เลือกได้เฉพาะบัญชีที่ตั้งสิทธิ์เป็น “กรรมการ P4P” ในเมนูจัดการผู้ใช้ก่อนแล้ว ต้องมีกรรมการที่ปฏิบัติหน้าที่และประธาน 1 คน จึงจะเริ่มรับรองงวดได้</p>
        <div className="flex flex-wrap gap-2">
          <select className="inp min-w-[16rem]" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">เลือกบัญชีกรรมการเพื่อเพิ่ม</option>
            {availableProfiles.filter(p => !members.some(m => m.user_id === p.user_id && m.active)).map(p => <option key={p.user_id} value={p.user_id}>{p.full_name || p.username || p.user_id}</option>)}
          </select>
          <button type="button" className="btn sec" disabled={!selectedUser || busy} onClick={() => { setMember(selectedUser, true, false); setSelectedUser('') }}>เพิ่มกรรมการ</button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="p-2">กรรมการ</th><th className="p-2">สถานะ</th><th className="p-2">ตำแหน่ง</th><th className="p-2">จัดการ</th></tr></thead>
          <tbody>{members.map(m => <tr key={m.user_id} className="border-b last:border-0">
            <td className="p-2">{profileName(m.user_id)}</td>
            <td className="p-2">{m.active ? 'ปฏิบัติหน้าที่' : 'ไม่ปฏิบัติหน้าที่'}</td>
            <td className="p-2">{m.active && m.is_chair ? <span className="font-semibold text-teal-800">ประธานคณะกรรมการ</span> : 'กรรมการ'}</td>
            <td className="p-2"><div className="flex flex-wrap gap-1">
              {m.active && !m.is_chair && <button type="button" className="btn sec !py-1" disabled={busy} onClick={() => setMember(m.user_id, true, true)}>กำหนดเป็นประธาน</button>}
              {m.active && <button type="button" className="btn sec !py-1" disabled={busy} onClick={() => setMember(m.user_id, false, false)}>ถอดออก</button>}
              {!m.active && <button type="button" className="btn sec !py-1" disabled={busy} onClick={() => setMember(m.user_id, true, false)}>คืนสถานะ</button>}
            </div></td>
          </tr>)}
          {!members.length && <tr><td colSpan={4} className="p-4 text-center text-stone-500">ยังไม่มีรายชื่อกรรมการในทะเบียนนี้</td></tr>}
          </tbody></table></div>
      </div>}
    </>}
  </div>
}
