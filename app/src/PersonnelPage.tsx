import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, X, Pencil, Filter, Users, RefreshCw } from 'lucide-react'

type Staff = {
  source_row: number
  prefix: string
  first_name: string
  last_name: string
  position: string
  org_role: string
  staff_group: string
  staff_type: string
  unit_name: string | null
  extra_unit_names: string | null
  nursing_group: string
  extra_nursing_group_names: string | null
  active: boolean
  imported_at?: string
}
const PREFIX_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง']
const ROLE_OPTIONS = ['เจ้าหน้าที่', 'หัวหน้างาน', 'หัวหน้ากลุ่มงาน', 'หัวหน้าพยาบาล', 'ผู้ดูแลระบบ', 'อื่นๆ']
const blank = (): Partial<Staff> => ({ prefix: 'นางสาว', first_name: '', last_name: '', position: '', org_role: 'เจ้าหน้าที่', staff_group: '', staff_type: '', unit_name: '', extra_unit_names: '', nursing_group: '', extra_nursing_group_names: '', active: true })

export default function PersonnelPage({ sb, positions = [], units = [], reload }: any) {
  const [rows, setRows] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')
  const [editing, setEditing] = useState<Partial<Staff> | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = async () => {
    setLoading(true)
    const { data, error } = await sb.from('staff_directory').select('*').order('first_name').order('last_name')
    setLoading(false)
    if (error) { setMessage('โหลดทะเบียนบุคลากรไม่สำเร็จ: ' + error.message); return }
    setRows((data || []) as Staff[])
  }
  useEffect(() => { void load() }, [])
  const options = (field: keyof Staff, fallback: string[] = []) => [...new Set([...fallback, ...rows.map(r => String(r[field] ?? '').trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'th'))
  const unitOptions = options('unit_name', (units || []).map((u: any) => u.name))
  const positionOptions = options('position', (positions || []).map((p: any) => p.name))
  const groupOptions = options('nursing_group')
  const staffGroupOptions = options('staff_group')
  const staffTypeOptions = options('staff_type')
  const orgRoleOptions = options('org_role', ROLE_OPTIONS)
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase('th').split(/\s+/).filter(Boolean)
    return rows.filter(r => {
      const full = [r.prefix, r.first_name, r.last_name, r.position, r.org_role, r.staff_group, r.staff_type, r.unit_name, r.extra_unit_names, r.nursing_group, r.extra_nursing_group_names, r.source_row].join(' ').toLocaleLowerCase('th')
      return terms.every(t => full.includes(t)) &&
        (!unitFilter || r.unit_name === unitFilter) &&
        (!groupFilter || r.nursing_group === groupFilter) &&
        (!roleFilter || r.org_role === roleFilter) &&
        (activeFilter === 'all' || (activeFilter === 'active' ? r.active : !r.active))
    })
  }, [rows, query, unitFilter, groupFilter, roleFilter, activeFilter])
  const openAdd = () => { setEditing(blank()); setIsNew(true); setMessage('') }
  const openEdit = (r: Staff) => { setEditing({ ...r }); setIsNew(false); setMessage('') }
  const save = async () => {
    if (!editing) return
    const required: (keyof Staff)[] = ['prefix', 'first_name', 'last_name', 'position', 'org_role', 'staff_group', 'staff_type', 'nursing_group']
    const missing = required.find(k => !String(editing[k] ?? '').trim())
    if (missing) { setMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบ โดยเฉพาะตำแหน่ง บทบาท กลุ่มบุคลากร ประเภท และกลุ่มงาน'); return }
    if (!String(editing.unit_name ?? '').trim() && editing.org_role !== 'หัวหน้ากลุ่มงาน') { setMessage('กรุณาเลือกหน่วยงานหลัก หรือระบุบทบาทหัวหน้ากลุ่มงานเพื่อคงสถานะเฉพาะกลุ่มงาน'); return }
    const payload: any = {
      prefix: String(editing.prefix).trim(), first_name: String(editing.first_name).trim(), last_name: String(editing.last_name).trim(),
      position: String(editing.position).trim(), org_role: String(editing.org_role).trim(), staff_group: String(editing.staff_group).trim(),
      staff_type: String(editing.staff_type).trim(), unit_name: String(editing.unit_name ?? '').trim() || null,
      extra_unit_names: String(editing.extra_unit_names ?? '').trim() || null, nursing_group: String(editing.nursing_group).trim(),
      extra_nursing_group_names: String(editing.extra_nursing_group_names ?? '').trim() || null, active: Boolean(editing.active)
    }
    setBusy(true); setMessage('')
    let error: any = null
    if (isNew) {
      const result = await sb.from('staff_directory').insert(payload).select().single()
      error = result.error
    } else {
      const result = await sb.from('staff_directory').update(payload).eq('source_row', editing.source_row)
      error = result.error
    }
    setBusy(false)
    if (error) { setMessage('บันทึกไม่สำเร็จ: ' + error.message); return }
    setMessage(isNew ? 'เพิ่มบุคลากรในทะเบียนแล้ว' : 'บันทึกการแก้ไขแล้ว')
    setEditing(null); await load(); if (reload) reload()
  }
  return <div className="space-y-4">
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <div className="card"><p className="text-sm text-stone-600">บุคลากรทั้งหมดในทะเบียน</p><p className="text-2xl font-bold">{rows.length.toLocaleString('th-TH')}</p></div>
      <div className="card"><p className="text-sm text-stone-600">ปฏิบัติงาน</p><p className="text-2xl font-bold text-teal-800">{rows.filter(r => r.active).length.toLocaleString('th-TH')}</p></div>
      <div className="card"><p className="text-sm text-stone-600">ไม่ใช้งาน</p><p className="text-2xl font-bold">{rows.filter(r => !r.active).length.toLocaleString('th-TH')}</p></div>
      <div className="card"><p className="text-sm text-stone-600">ผลลัพธ์ตามตัวกรอง</p><p className="text-2xl font-bold">{filtered.length.toLocaleString('th-TH')}</p></div>
    </div>
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold flex items-center gap-2"><Users size={20}/>ทะเบียนบุคลากร</h2><p className="text-sm text-stone-600">ข้อมูลจาก staff_directory โดยตรง ไม่จำเป็นต้องมีบัญชีผู้ใช้ในระบบ</p></div>
        <div className="flex gap-2"><button className="btn sec" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className="inline mr-1"/>รีเฟรช</button><button className="btn" onClick={openAdd}><Plus size={16} className="inline mr-1"/>เพิ่มบุคลากร</button></div>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2">
        <label className="relative"><span className="sr-only">ค้นหาบุคลากร</span><Search size={16} className="absolute left-3 top-3 text-stone-400"/><input className="inp pl-9" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อ ตำแหน่ง หน่วยงาน…"/></label>
        <select className="inp" value={unitFilter} onChange={e => setUnitFilter(e.target.value)}><option value="">ทุกหน่วยงาน</option>{unitOptions.map(x => <option key={x} value={x}>{x}</option>)}</select>
        <select className="inp" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}><option value="">ทุกกลุ่มงาน</option>{groupOptions.map(x => <option key={x} value={x}>{x}</option>)}</select>
        <select className="inp" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}><option value="">ทุกบทบาท/ตำแหน่งงาน</option>{orgRoleOptions.map(x => <option key={x} value={x}>{x}</option>)}</select>
        <select className="inp" value={activeFilter} onChange={e => setActiveFilter(e.target.value)}><option value="active">เฉพาะที่ปฏิบัติงาน</option><option value="inactive">เฉพาะไม่ใช้งาน</option><option value="all">ทั้งหมด</option></select>
      </div>
      <p className="text-xs text-stone-500"><Filter size={13} className="inline mr-1"/>แสดง {filtered.length.toLocaleString('th-TH')} จาก {rows.length.toLocaleString('th-TH')} รายชื่อ</p>
      {message && !editing && <p role="status" className="text-sm text-teal-800">{message}</p>}
      <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm">
        <thead><tr><th>รหัสแถว</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>บทบาท</th><th>กลุ่มบุคลากร</th><th>ประเภทบุคลากร</th><th>หน่วยงาน</th><th>หน่วยงานเพิ่มเติม</th><th>กลุ่มงาน</th><th>กลุ่มงานเพิ่มเติม</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
        <tbody>{filtered.map(r => <tr key={r.source_row}>
          <td>{r.source_row}</td><td className="min-w-44"><b>{r.prefix}{r.first_name} {r.last_name}</b></td><td className="min-w-40">{r.position}</td><td>{r.org_role}</td><td>{r.staff_group}</td><td>{r.staff_type}</td><td className="min-w-44">{r.unit_name || '—'}</td><td>{r.extra_unit_names || '—'}</td><td>{r.nursing_group}</td><td>{r.extra_nursing_group_names || '—'}</td><td><span className={r.active ? 'text-teal-800' : 'text-stone-500'}>{r.active ? 'ปฏิบัติงาน' : 'ไม่ใช้งาน'}</span></td><td><button className="btn sec !py-1 whitespace-nowrap" onClick={() => openEdit(r)}><Pencil size={14} className="inline mr-1"/>แก้ไข</button></td>
        </tr>)}
        {!filtered.length && <tr><td colSpan={12} className="text-center p-8 text-stone-500">{loading ? 'กำลังโหลดทะเบียน…' : 'ไม่พบรายชื่อที่ตรงกับตัวกรอง'}</td></tr>}</tbody>
      </table></div>
    </div>
    {editing && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="personnel-form-title">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3"><div><h3 id="personnel-form-title" className="text-lg font-bold">{isNew ? 'เพิ่มบุคลากรในทะเบียน' : 'แก้ไขข้อมูลบุคลากร'}</h3><p className="text-sm text-stone-600">ช่องที่เป็นข้อมูลมาตรฐานเลือกจาก dropdown เพื่อให้ตรงกับโครงสร้างฐานข้อมูล</p></div><button className="btn sec" aria-label="ปิดฟอร์ม" onClick={() => setEditing(null)}><X size={16}/></button></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="field-label">คำนำหน้า<select className="inp mt-1" value={editing.prefix || ''} onChange={e => setEditing({...editing, prefix:e.target.value})}>{PREFIX_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">ชื่อ<input className="inp mt-1" value={editing.first_name || ''} onChange={e=>setEditing({...editing,first_name:e.target.value})}/></label>
          <label className="field-label">นามสกุล<input className="inp mt-1" value={editing.last_name || ''} onChange={e=>setEditing({...editing,last_name:e.target.value})}/></label>
          <label className="field-label">ตำแหน่ง<select className="inp mt-1" value={editing.position || ''} onChange={e=>setEditing({...editing,position:e.target.value})}><option value="">เลือกตำแหน่ง</option>{positionOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">บทบาท/ตำแหน่งงาน<select className="inp mt-1" value={editing.org_role || ''} onChange={e=>setEditing({...editing,org_role:e.target.value})}><option value="">เลือกบทบาท</option>{orgRoleOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">กลุ่มบุคลากร<select className="inp mt-1" value={editing.staff_group || ''} onChange={e=>setEditing({...editing,staff_group:e.target.value})}><option value="">เลือกกลุ่มบุคลากร</option>{staffGroupOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">ประเภทบุคลากร<select className="inp mt-1" value={editing.staff_type || ''} onChange={e=>setEditing({...editing,staff_type:e.target.value})}><option value="">เลือกประเภท</option>{staffTypeOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">หน่วยงานหลัก<select className="inp mt-1" value={editing.unit_name || ''} onChange={e=>setEditing({...editing,unit_name:e.target.value})}><option value="">เลือกหน่วยงาน</option>{unitOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">กลุ่มงาน<select className="inp mt-1" value={editing.nursing_group || ''} onChange={e=>setEditing({...editing,nursing_group:e.target.value})}><option value="">เลือกกลุ่มงาน</option>{groupOptions.map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field-label">หน่วยงานเพิ่มเติม<input className="inp mt-1" placeholder="ระบุชื่อหน่วยงานเพิ่มเติม (ถ้ามี)" value={editing.extra_unit_names || ''} onChange={e=>setEditing({...editing,extra_unit_names:e.target.value})}/></label>
          <label className="field-label">กลุ่มงานเพิ่มเติม<input className="inp mt-1" placeholder="ระบุกลุ่มงานเพิ่มเติม (ถ้ามี)" value={editing.extra_nursing_group_names || ''} onChange={e=>setEditing({...editing,extra_nursing_group_names:e.target.value})}/></label>
          <label className="field-label flex items-center gap-2"><input type="checkbox" checked={Boolean(editing.active)} onChange={e=>setEditing({...editing,active:e.target.checked})}/>ปฏิบัติงานอยู่ / ใช้ในระบบ</label>
        </div>
        {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <div className="flex justify-end gap-2"><button className="btn sec" disabled={busy} onClick={()=>setEditing(null)}>ยกเลิก</button><button className="btn" disabled={busy} onClick={()=>void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div>
      </div>
    </div>}
  </div>
}
