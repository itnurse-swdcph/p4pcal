import { useEffect, useState } from 'react'

type Props = {
  sb: any
  members: any[]
  roster: any[]
  version: number
  busy: boolean
  runAction: (label: string, action: () => Promise<any>) => void
  setError: (message: string) => void
}

const PROFILE_COLUMNS = 'user_id,full_name,username,role,org_role,position,unit_id,staff_directory_id'

export default function RosterAdmin({ sb, members, roster, version, busy, runAction, setError }: Props) {
  const [available, setAvailable] = useState<any[]>([])
  const [manthanaStaff, setManthanaStaff] = useState<any>(null)
  const [manthanaPre, setManthanaPre] = useState<any>(null)
  const [selected, setSelected] = useState('')
  const active = members.filter(m => m.active)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const [profileResult, staffResult] = await Promise.all([
        sb.from('profiles').select(PROFILE_COLUMNS).eq('org_role', 'หัวหน้ากลุ่มงาน').order('full_name'),
        sb.from('staff_directory').select('source_row,prefix,first_name,last_name,position').eq('first_name', 'มัณฑนา').eq('last_name', 'เพชรคำ').eq('position', 'พยาบาลวิชาชีพชำนาญการพิเศษ').maybeSingle()
      ])
      if (!alive) return
      let candidates: any[] = profileResult.data || []
      if (!staffResult.error) {
        setManthanaStaff(staffResult.data || null)
        if (staffResult.data?.source_row) {
          const pre = await sb.from('p4p_committee_preappointments').select('staff_directory_source_row,active,linked_user_id,appointed_at').eq('staff_directory_source_row', staffResult.data.source_row).maybeSingle()
          if (!alive) return
          if (!pre.error) setManthanaPre(pre.data || null); else setError(pre.error.message || 'ไม่สามารถโหลดสถานะแต่งตั้งล่วงหน้าได้')
          const linked = await sb.from('profiles').select(PROFILE_COLUMNS).eq('staff_directory_id', staffResult.data.source_row).maybeSingle()
          if (!alive) return
          if (linked.data && !candidates.some(p => p.user_id === linked.data.user_id)) candidates = [...candidates, linked.data]
        }
      } else setError(staffResult.error.message || 'ไม่สามารถโหลดทะเบียนบุคลากรได้')
      // รวมกรรมการที่ถูกถอดออกไว้ในรายการเดียวกัน เพื่อคืนสถานะได้
      const inactiveIds = roster.filter(m => !m.active).map(m => m.user_id)
      if (inactiveIds.length) {
        const inactive = await sb.from('profiles').select(PROFILE_COLUMNS).in('user_id', inactiveIds)
        if (!alive) return
        for (const p of inactive.data || []) if (!candidates.some(c => c.user_id === p.user_id)) candidates = [...candidates, p]
      }
      if (!profileResult.error) setAvailable(candidates)
    }
    load()
    return () => { alive = false }
  }, [sb, version, roster, setError])

  const nameOf = (id: string) => roster.find(r => r.user_id === id)?.full_name?.trim() || 'ไม่พบชื่อ-สกุลในทะเบียนบุคลากร'
  const setMember = (userId: string, activeFlag: boolean) =>
    runAction('บันทึกทะเบียนกรรมการแล้ว', () => sb.rpc('p4p_set_committee_member', { p_user_id: userId, p_active: activeFlag, p_is_chair: false }))

  return <section className="card space-y-3">
    <div><h2 className="text-lg font-bold">จัดการรายชื่อคณะกรรมการ P4P</h2>
      <p className="text-xs text-stone-600">ทุกคนมีสิทธิ์เท่ากัน ไม่มีประธาน · การเพิ่ม/ถอดกรรมการระหว่างรอบรับรองจะทำให้ต้องเริ่มรับรองใหม่ · แต่งตั้งบุคลากรที่ยังไม่มีบัญชีไว้ล่วงหน้าได้ เมื่อสมัครแล้วระบบจะเชื่อมบัญชีให้อัตโนมัติ</p></div>
    <div className="flex flex-wrap gap-2">
      <select className="inp min-w-[16rem] !w-auto" value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">เลือกบัญชีบุคลากรเพื่อแต่งตั้ง</option>
        {available.filter(p => !members.some(m => m.user_id === p.user_id && m.active)).map(p => <option key={p.user_id} value={p.user_id}>{p.full_name || p.username || p.user_id}{p.position ? ` · ${p.position}` : ''}</option>)}
      </select>
      <button type="button" className="btn sec" disabled={!selected || busy} onClick={() => { setMember(selected, true); setSelected('') }}>เพิ่มกรรมการ</button>
      {manthanaStaff && <button type="button" className="btn sec" disabled={busy || !!manthanaPre?.active}
        onClick={() => runAction('แต่งตั้งนางสาวมัณฑนา เพชรคำ เป็นกรรมการล่วงหน้าแล้ว', () => sb.from('p4p_committee_preappointments').upsert({ staff_directory_source_row: manthanaStaff.source_row, active: true }).select().single())}>
        {manthanaPre?.active ? (manthanaPre.linked_user_id ? 'แต่งตั้งแล้วและเชื่อมบัญชีแล้ว' : 'แต่งตั้งกรรมการแล้ว · รอสมัครบัญชี') : 'แต่งตั้งนางสาวมัณฑนา เพชรคำ ล่วงหน้า'}</button>}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="border-b text-left"><th className="p-2">กรรมการ</th><th className="p-2">สถานะ</th><th className="p-2">จัดการ</th></tr></thead>
      <tbody>
        {manthanaStaff && manthanaPre?.active && !manthanaPre.linked_user_id && <tr className="border-b bg-amber-50"><td className="p-2">{[manthanaStaff.prefix, manthanaStaff.first_name, manthanaStaff.last_name].filter(Boolean).join(' ')}</td><td className="p-2">แต่งตั้งแล้ว · รอสมัครบัญชี</td><td className="p-2 text-xs">ระบบจะเชื่อมบัญชีอัตโนมัติ</td></tr>}
        {active.map(m => <tr key={m.user_id} className="border-b last:border-0"><td className="p-2">{nameOf(m.user_id)}</td><td className="p-2">ปฏิบัติหน้าที่</td>
          <td className="p-2"><button type="button" className="btn sec !py-1" disabled={busy} onClick={() => setMember(m.user_id, false)}>ถอดออก</button></td></tr>)}
        {!active.length && <tr><td colSpan={3} className="p-4 text-center text-stone-500">ยังไม่มีรายชื่อกรรมการที่ปฏิบัติหน้าที่</td></tr>}
      </tbody></table></div>
  </section>
}
