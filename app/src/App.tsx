import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import PersonnelPage from './PersonnelPage'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Printer, ShieldCheck, Menu, X, LayoutDashboard, ClipboardList, LibraryBig, ClipboardCheck, Users, Wallet, Settings, LogOut, ChevronLeft, CalendarDays, Building2, Shield } from 'lucide-react'

const DEFAULT_CFG = { url: 'https://foypareeazfzidwygolc.supabase.co', key: 'sb_publishable_8qxOgD-AHGnv9RWWAZTUQQ_I0MPIMv3' }
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง']
const FOOTER_TEXT = '© 2026 Developed By Natnarinthorn | Nursing Informatics System'
const SHIFTS: [string, string][] = [['ดึก', 'เวรดึก (00.00-08.00)'], ['เช้า', 'เวรเช้า (08.00-16.00)'], ['บ่าย', 'เวรบ่าย (16.00-24.00)']]
// สายงานกิจกรรม = ค่า positions.grp ตรงกับ activities.eligible (ผู้ช่วยช่างทั่วไปใช้ชุดเดียวกับผู้ช่วยเหลือคนไข้)
const LINE_ORDER = ['พยาบาล', 'ผู้ช่วยเหลือคนไข้', 'พนักงานประจำตึก', 'พนักงานธุรการ', 'พนักงานเปล', 'Paramedic', 'EMT']
const LINE_LABEL: Record<string, string> = { 'พยาบาล': 'พยาบาล (รวมหัวหน้า)', 'ผู้ช่วยเหลือคนไข้': 'ผู้ช่วยเหลือคนไข้ / ผู้ช่วยช่าง' }
const NO_LINE = 'ยังไม่กำหนดสายงาน'
// รหัสผู้ใช้ที่ล็อกอิน ใช้ตัดสินว่าปุ่ม ส่ง/แก้ไข/ลบ ของแบบร่างเป็นของใคร (ฐานข้อมูลบังคับกฎซ้ำอีกชั้น)
const MeCtx = createContext<string | null>(null)
// ลำดับการรับรอง: เจ้าหน้าที่ → หัวหน้างาน → หัวหน้ากลุ่มงาน → รักษาการหัวหน้าพยาบาล (ระดับมาจากทะเบียนบุคลากร org_role; ฐานข้อมูลบังคับซ้ำ และรับรองรายการของตนเองไม่ได้)
// ระดับ 0 เจ้าหน้าที่ 1 หัวหน้างาน 2 หัวหน้ากลุ่มงาน 3 รักษาการหัวหน้าพยาบาล
const approverLabel = (subjectLevel: number) => subjectLevel >= 3 ? 'ผู้ดูแลระบบ' : subjectLevel === 2 ? 'รักษาการหัวหน้าพยาบาล' : subjectLevel === 1 ? 'หัวหน้ากลุ่มงาน' : 'หัวหน้างาน'
const ApproverCtx = createContext<{ role: string; level: number; personUser: Record<string, string | null>; personLevel: Record<string, number> } | null>(null)
function canDecideRow(ap: any, me: string | null, r: any) {
  if (!ap || !r || !me) return false
  if (ap.personUser[r.person_id] === me) return false          // รับรองรายการของตนเองไม่ได้
  if (ap.role === 'admin') return true
  if (ap.role !== 'head' && ap.role !== 'group_head') return false
  const sl = ap.personLevel[r.person_id] ?? 0
  return (ap.level === 1 && sl === 0) || (ap.level === 2 && sl === 1) || (ap.level === 3 && sl === 2)
}
const ROLE_TH: any = { staff: 'เจ้าหน้าที่', head: 'หัวหน้างาน', group_head: 'หัวหน้ากลุ่มงาน', committee: 'กรรมการ P4P', admin: 'ผู้ดูแลระบบ' }
const ROLES = ['ประธาน', 'เลขานุการ/กรรมการ', 'สมาชิก/ผู้เข้าร่วม']
const nf = (n: any, d = 2) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d })
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
const formatThaiShortDate = (value: string) => { if (!value) return 'ไม่ได้ระบุวันที่'; const [y, m, d] = value.split('-').map(Number); const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; if (!y || !m || !d || m < 1 || m > 12) return value; return `${d} ${months[m - 1]} ${y + 543}` }

const thaiBahtText = (value: number) => {
  const digits = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  const units = ['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
  const group = (n: number): string => {
    if (!n) return '';
    const str = String(n); let out = '';
    for (let i = 0; i < str.length; i++) {
      const d = Number(str[i]), pos = str.length - i - 1;
      if (!d) continue;
      if (pos === 0 && d === 1 && str.length > 1) out += 'เอ็ด';
      else if (pos === 1 && d === 2) out += 'ยี่';
      else if (pos === 1 && d === 1) out += '';
      else out += digits[d];
      out += units[pos];
    }
    return out;
  };
  const read = (n: number): string => n >= 1000000 ? read(Math.floor(n / 1000000)) + 'ล้าน' + group(n % 1000000) : group(n);
  const amount = Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
  const baht = Math.floor(amount), satang = Math.round((amount - baht) * 100);
  return read(baht) + 'บาท' + (satang ? read(satang) + 'สตางค์' : 'ถ้วน');
};
const mRange = (m: string) => { const d = new Date(m + '-01'); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return [m + '-01', `${m}-${String(e.getDate()).padStart(2, '0')}`] }

export default function App() {
  const [cfg, setCfg] = useState(() => JSON.parse(localStorage.getItem('p4p_cfg') || 'null') || DEFAULT_CFG)
  const sb: any = useMemo(() => createClient(cfg.url, cfg.key), [cfg])
  const [session, setSession] = useState<any>(undefined)
  useEffect(() => {
    if (!sb) return
    // ตรวจกับเซิร์ฟเวอร์ว่าบัญชีใน session ยังมีอยู่จริง (กรณีผู้ดูแลลบบัญชีไปแล้ว แต่เบราว์เซอร์ยังจำ session เก่า)
    sb.auth.getSession().then(async ({ data }: any) => {
      if (!data.session) return setSession(null)
      const { data: u, error } = await sb.auth.getUser()
      if (error || !u?.user) { await sb.auth.signOut({ scope: 'local' }); return setSession(null) }
      setSession(data.session)
    })
    const { data } = sb.auth.onAuthStateChange((_e: any, s: any) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])
  if (session === undefined) return <p className="p-8">กำลังโหลด…</p>
  if (!session) return <Login sb={sb} reset={() => {}} />
  return <Main sb={sb} session={session} />
}

function Shell({ children }: any) {
  return <main className="auth-page">
    <span className="auth-orb auth-orb-one" aria-hidden="true" />
    <span className="auth-orb auth-orb-two" aria-hidden="true" />
    <section className="auth-card">{children}</section>
    <p className="auth-footnote">{FOOTER_TEXT}</p>
  </main>
}
function Login({ sb }: any) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [username, setUsername] = useState('')
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [staffQuery, setStaffQuery] = useState('')
  const [staffResults, setStaffResults] = useState<any[]>([])
  const [selectedStaff, setSelectedStaff] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState(false)
  useEffect(() => {
    if (mode !== 'up' || staffQuery.trim().length < 2 || selectedStaff) { setStaffResults([]); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const { data, error } = await sb.functions.invoke('p4p-staff-search', { body: { q: staffQuery.trim() } })
      if (!cancelled) setStaffResults(!error && Array.isArray(data?.results) ? data.results : [])
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [sb, mode, staffQuery, selectedStaff])
  const usernameValid = /^[a-z0-9][a-z0-9._-]{2,29}$/.test(username.trim().toLowerCase())
  const passwordsMatch = pw === confirmPw
  const ok = !busy && usernameValid && pw.length >= (mode === 'in' ? 1 : 6) && (mode === 'in' || (!!selectedStaff && passwordsMatch))
  const go = async () => {
    if (!ok) return
    setMsg(''); setSuccess(false); setBusy(true)
    const cleanUsername = username.trim().toLowerCase()
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email: cleanUsername + '@p4p.invalid', password: pw })
        if (error) setMsg('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน')
      } else {
        const { data, error } = await sb.functions.invoke('p4p-register', {
          body: { username: cleanUsername, password: pw, staff_id: selectedStaff.source_row }
        })
        if (error) {
          let detail = ''
          try { detail = (await error.context?.json?.())?.error || '' } catch { /* use fallback below */ }
          setMsg(detail || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        } else if (data?.error) {
          setMsg(data.error)
        } else {
          const { error: signInError } = await sb.auth.signInWithPassword({ email: cleanUsername + '@p4p.invalid', password: pw })
          if (signInError) setMsg('ลงทะเบียนสำเร็จแล้ว แต่เข้าสู่ระบบอัตโนมัติไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง')
          else setSuccess(true)
        }
      }
    } catch {
      setMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')
    } finally { setBusy(false) }
  }
  const passwordField = (label: string, value: string, setter: (v: string) => void, visible: boolean, toggle: () => void, placeholder: string, enter = false) =>
    <div className="space-y-1">
      <label className="field-label">{label}</label>
      <div className="password-wrap">
        <input className="inp" type={visible ? 'text' : 'password'} autoComplete={label === 'รหัสผ่าน' ? (mode === 'in' ? 'current-password' : 'new-password') : 'new-password'} placeholder={placeholder} value={value} onChange={e => setter(e.target.value)} onKeyDown={e => e.key === 'Enter' && enter && ok && go()} />
        <button type="button" className="password-toggle" aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} title={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} onClick={toggle}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
    </div>
  return <Shell>
    <div className="brand-mark"><img className="brand-mark-icon" src="https://raw.githubusercontent.com/itnurse-swdcph/p4pcal/main/icon.png" alt="P4P Nursing logo" /><div className="brand-caption">NURSING DEPARTMENT</div></div>
    <div className="auth-heading"><p className="hospital-name">กลุ่มการพยาบาล<br />โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</p><p className="eyebrow">P4P · SMART NURSING WORKFLOW</p><h1>{mode === 'in' ? 'ยินดีต้อนรับ' : 'สร้างบัญชีผู้ใช้งาน'}</h1><p>{mode === 'in' ? 'เข้าสู่ระบบบันทึกกิจกรรมและคำนวณแต้ม P4P' : 'กรอกข้อมูลเพื่อเริ่มใช้งานระบบ P4P'}</p></div>
    <div className="auth-form">
      {mode === 'up' && <>
        <div className="space-y-1">
          <label className="field-label">ค้นหาชื่อ–นามสกุลบุคลากร</label>
          <input className="inp" type="search" autoComplete="off" placeholder="พิมพ์ชื่อหรือนามสกุลอย่างน้อย 2 ตัวอักษร" value={selectedStaff ? selectedStaff.prefix + selectedStaff.first_name + ' ' + selectedStaff.last_name : staffQuery} onChange={e => { setSelectedStaff(null); setStaffQuery(e.target.value); setMsg('') }} />
          {staffResults.length > 0 && <div className="unit-check-list" role="listbox" aria-label="ผลการค้นหาบุคลากร">
            {staffResults.map((person: any) => <button type="button" key={person.source_row} className="unit-check text-left w-full" onClick={() => { setSelectedStaff(person); setStaffQuery(''); setStaffResults([]); setMsg('') }}>
              <span className="font-semibold">{person.prefix}{person.first_name} {person.last_name}</span>
              <span className="block text-xs text-stone-600">{person.position} · {person.unit_name || person.nursing_group}</span>
              <span className="block text-xs text-stone-500">{person.org_role} · {person.staff_group}</span>
            </button>)}
          </div>}
          {staffQuery.trim().length >= 2 && !selectedStaff && !staffResults.length && <p className="field-hint">ไม่พบรายชื่อที่ตรงกัน หรือกำลังค้นหา หากไม่พบกรุณาติดต่อผู้ดูแลระบบ</p>}
          {selectedStaff && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1 text-sm text-stone-800">
            <div className="flex items-start justify-between gap-2"><strong className="text-base">{selectedStaff.prefix}{selectedStaff.first_name} {selectedStaff.last_name}</strong><button type="button" className="text-xs underline" onClick={() => { setSelectedStaff(null); setStaffQuery('') }}>เปลี่ยนชื่อ</button></div>
            <p><b>ตำแหน่ง:</b> {selectedStaff.position}</p>
            <p><b>บทบาท:</b> {selectedStaff.org_role}</p>
            <p><b>กลุ่ม:</b> {selectedStaff.staff_group}</p>
            <p><b>ประเภทเจ้าหน้าที่:</b> {selectedStaff.staff_type}</p>
            <p><b>หน่วยงาน:</b> {selectedStaff.unit_name || 'ไม่ระบุในฐานข้อมูล'}</p>
            {selectedStaff.extra_unit_names && <p><b>หน่วยงานเพิ่มเติม:</b> {selectedStaff.extra_unit_names}</p>}
            <p><b>กลุ่มงาน:</b> {selectedStaff.nursing_group}</p>
            {selectedStaff.extra_nursing_group_names && <p><b>กลุ่มงานเพิ่มเติม:</b> {selectedStaff.extra_nursing_group_names}</p>}
            <p className="field-hint">ข้อมูลดึงจากฐานข้อมูลบุคลากร ไม่ต้องกรอกซ้ำ</p>
          </div>}
        </div>
      </>}
      <label className="field-label">ชื่อผู้ใช้ (Username)</label>
        <input className="inp" type="text" autoComplete="username" placeholder="เช่น nurse.somchai" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && mode === 'in' && ok && go()} />
        <p className="field-hint">ใช้ตัวอักษรภาษาอังกฤษ a–z ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–30 ตัว</p>{mode === 'up' && <p className="hrm-account-hint">คำแนะนำ: ตั้งชื่อผู้ใช้ (Username) และรหัสผ่านให้เหมือนกับที่ใช้เข้าสู่โปรแกรม HRM เพื่อให้จดจำได้ง่าย</p>}
      {passwordField('รหัสผ่าน', pw, setPw, showPw, () => setShowPw(v => !v), 'อย่างน้อย 6 ตัวอักษร', true)}
      {mode === 'up' && <>
        {passwordField('ยืนยันรหัสผ่าน', confirmPw, setConfirmPw, showConfirmPw, () => setShowConfirmPw(v => !v), 'กรอกรหัสผ่านอีกครั้ง', true)}
        {confirmPw && !passwordsMatch && <p className="field-error">รหัสผ่านทั้งสองช่องไม่ตรงกัน</p>}
      </>}
      <button className="btn auth-submit" disabled={!ok} onClick={go}>{busy ? 'กำลังดำเนินการ…' : mode === 'in' ? 'เข้าสู่ระบบ' : 'ลงทะเบียนและเข้าใช้งาน'}</button>
      {msg && <p role="alert" className="form-message">{msg}</p>}
      {success && <p role="status" className="form-message success">ลงทะเบียนสำเร็จ กำลังเข้าสู่ระบบ</p>}
    </div>
    <div className="auth-switch"><span>{mode === 'in' ? 'ยังไม่มีบัญชีใช่ไหม?' : 'มีบัญชีอยู่แล้ว?'}</span><button type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); setSuccess(false); setConfirmPw(''); setPw('') }}>{mode === 'in' ? 'ลงทะเบียนผู้ใช้ใหม่' : 'กลับไปเข้าสู่ระบบ'}</button></div>
    <div className="auth-security"><ShieldCheck size={15} /><span>ระบบภายในสำหรับบุคลากรทางการพยาบาล</span><span className="security-dot" /></div>
  </Shell>
}

function PersonalProfilePage({ sb, profile, role, units, groupOptions = [], positions, session, reload }: any) {
  const locked = role === 'admin'
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [payGroups, setPayGroups] = useState<any[]>([])
  useEffect(() => { sb.from('pay_groups').select('id,name').order('id').then((r: any) => setPayGroups(r.data || [])) }, [sb])
  const groupNames = [...new Set([...(groupOptions || []), ...(units || []).map((u: any) => String(u.parent_group || '').trim())].filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b, 'th'))
  const splitNames = (value: any) => String(value || '').split('|').map(x => x.trim()).filter(Boolean)
  const extraGroups = splitNames(form?.extra_nursing_group_names)
  const extraUnits = splitNames(form?.extra_unit_names)
  const groupUnits = (units || []).filter((u: any) => String(u.parent_group || '').trim() === String(form?.nursing_group || '').trim())
  const extraGroupUnits = (units || []).filter((u: any) => extraGroups.includes(String(u.parent_group || '').trim()))
  const setExtraGroups = (values: string[]) => {
    const validUnits = (units || []).filter((u: any) => values.includes(String(u.parent_group || '').trim())).map((u: any) => String(u.name || '').trim())
    setForm((old: any) => ({ ...old, extra_nursing_group_names: values.join(' | '), extra_unit_names: splitNames(old?.extra_unit_names).filter((name: string) => validUnits.includes(name)).join(' | ') }))
  }
  const setExtraUnits = (values: string[]) => setForm((old: any) => ({ ...old, extra_unit_names: values.join(' | ') }))
  const changePosition = (position: string) => {
    const selected = (positions || []).find((p: any) => String(p.name || '').trim() === position)
    const pg = payGroups.find((g: any) => Number(g.id) === Number(selected?.pay_group))
    setForm((old: any) => ({ ...old, position, staff_group: pg?.name || '' }))
  }
  useEffect(() => {
    if (!form || !positions?.length || !payGroups.length) return
    const selected = positions.find((p: any) => String(p.name || '').trim() === String(form.position || '').trim())
    const pg = payGroups.find((g: any) => Number(g.id) === Number(selected?.pay_group))
    if (pg?.name && form.staff_group !== pg.name) setForm((old: any) => ({ ...old, staff_group: pg.name }))
  }, [form?.position, form?.staff_group, positions, payGroups])
  useEffect(() => {
    if (!form || !units?.length) return
    const currentUnit = units.find((u: any) => String(u.name || '').trim() === String(form.unit_name || '').trim())
    if (currentUnit?.parent_group && form.nursing_group !== currentUnit.parent_group) {
      setForm((old: any) => ({ ...old, nursing_group: currentUnit.parent_group }))
    }
  }, [form?.unit_name, form?.nursing_group, units])
  useEffect(() => {
    let alive = true
    const load = async () => {
      if (locked) {
        setMessage('บัญชีผู้ดูแลระบบไม่สามารถแก้ไขทะเบียนบุคลากรผ่านเมนูนี้ได้')
        return
      }
      const sourceRow = profile.staff_directory_id
      if (!sourceRow) { setMessage('บัญชีนี้ยังไม่ได้เชื่อมกับทะเบียนบุคลากร กรุณาติดต่อผู้ดูแลระบบเพื่อผูกข้อมูลก่อน'); return }
      const { data: result, error } = await sb.rpc('get_my_staff_directory')
      if (!alive) return
      const data = result?.staff || result
      if (error || !data || data.error) { setMessage(data?.error || 'โหลดข้อมูลทะเบียนบุคลากรไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ'); return }
      setForm(data)
    }
    void load()
    return () => { alive = false }
  }, [sb, profile.staff_directory_id, locked])
  const set = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }))
  const field = (key: string, label: string, options?: string[]) => <label className="block space-y-1" key={key}><span className="field-label">{label}</span>{options ? <select className="inp w-full" value={form?.[key] ?? ''} disabled={locked} onChange={e => set(key,e.target.value)}><option value="">เลือก{label}</option>{options.map(x => <option key={x} value={x}>{x}</option>)}</select> : <input className="inp w-full" value={form?.[key] ?? ''} disabled={locked} onChange={e => set(key,e.target.value)} />}</label>
  const save = async () => {
    if (!form || locked) return
    if (![form.prefix,form.first_name,form.last_name,form.position,form.staff_group,form.staff_type,form.unit_name,form.nursing_group].every(x => String(x ?? '').trim())) { setMessage('กรุณากรอกชื่อ ตำแหน่ง กลุ่มบุคลากร ประเภทบุคลากร หน่วยงาน และกลุ่มงานให้ครบ'); return }
    setBusy(true); setMessage('')
    const payload = { prefix: String(form.prefix).trim(), first_name: String(form.first_name).trim(), last_name: String(form.last_name).trim(), position: String(form.position).trim(), staff_group: String(form.staff_group).trim(), staff_type: String(form.staff_type).trim(), unit_name: String(form.unit_name).trim(), extra_unit_names: String(form.extra_unit_names ?? '').trim() || null, nursing_group: String(form.nursing_group).trim(), extra_nursing_group_names: String(form.extra_nursing_group_names ?? '').trim() || null }
    const { data, error } = await sb.rpc('update_my_staff_directory', { p_payload: payload })
    if (!error && data?.success) {
      setMessage('บันทึกข้อมูลบุคลากรเรียบร้อยแล้ว'); reload?.()
    } else setMessage('บันทึกไม่สำเร็จ: ' + (error?.message || 'ระบบไม่ยืนยันการบันทึก'))
    setBusy(false)
  }
  if (!form) return <div className="card space-y-2"><h2 className="text-lg font-bold">แก้ไขข้อมูลส่วนตัว</h2><p>{message || 'กำลังโหลดข้อมูล…'}</p></div>
  return <div className="card space-y-4"><div><h2 className="text-lg font-bold">แก้ไขข้อมูลส่วนตัว</h2><p className="text-sm text-stone-600">ข้อมูลนี้เชื่อมกับทะเบียนบุคลากรของระบบ P4P</p></div>
    {locked && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">บัญชีผู้ดูแลระบบไม่สามารถแก้ไขข้อมูลบุคลากรผ่านเมนูนี้ได้</p>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {field('prefix','คำนำหน้า', ['นาย','นาง','นางสาว','ว่าที่ร้อยตรี','ว่าที่ร้อยตรีหญิง'])}
      {field('first_name','ชื่อ')}{field('last_name','นามสกุล')}
      <label className="block space-y-1"><span className="field-label">ตำแหน่ง</span><select className="inp w-full" value={form.position || ''} disabled={locked} onChange={e => changePosition(e.target.value)}><option value="">เลือกตำแหน่ง</option>{[...new Set([...(positions||[]).map((p:any)=>String(p.name||'').trim()),String(form.position||'')].filter(Boolean))].sort((a:string,b:string)=>a.localeCompare(b,'th')).map((x:string) => <option key={x} value={x}>{x}</option>)}</select></label>
      <label className="block space-y-1"><span className="field-label">กลุ่มบุคลากร (กำหนดอัตโนมัติตามตำแหน่ง)</span><input className="inp w-full bg-stone-100" value={form.staff_group || ''} readOnly disabled /></label>
      {field('staff_type','ประเภทบุคลากร')}
      <label className="block space-y-1"><span className="field-label">กลุ่มงาน</span><select className="inp w-full" value={form.nursing_group || ''} disabled={locked} onChange={e => { const group = e.target.value; const available = (units || []).filter((u:any) => String(u.parent_group || '').trim() === group); setForm((old:any) => ({ ...old, nursing_group: group, unit_name: available.some((u:any) => u.name === old?.unit_name) ? old.unit_name : '' })) }}><option value="">เลือกกลุ่มงานก่อน</option>{groupNames.map((x:string) => <option key={x} value={x}>{x}</option>)}</select></label>
      <label className="block space-y-1"><span className="field-label">หน่วยงาน</span><select className="inp w-full" value={form.unit_name || ''} disabled={locked || !form.nursing_group} onChange={e => set('unit_name',e.target.value)}><option value="">{form.nursing_group ? 'เลือกหน่วยงานในกลุ่มงาน' : 'กรุณาเลือกกลุ่มงานก่อน'}</option>{[...new Set(groupUnits.map((u:any)=>String(u.name||'').trim()).filter(Boolean))].sort((a:string,b:string)=>a.localeCompare(b,'th')).map((x:string) => <option key={x} value={x}>{x}</option>)}</select></label>
      <label className="block space-y-1"><span className="field-label">กลุ่มงานเพิ่มเติม</span><select className="inp w-full min-h-24" multiple value={extraGroups} disabled={locked} onChange={e => setExtraGroups(Array.from(e.target.selectedOptions, o => o.value))}>{groupNames.filter((x:string) => x !== form.nursing_group).map((x:string) => <option key={x} value={x}>{x}</option>)}</select><span className="field-hint">เลือกได้หลายกลุ่มงาน (กด Ctrl หรือ Cmd ค้างไว้เพื่อเลือกหลายรายการ)</span></label>
      <label className="block space-y-1"><span className="field-label">หน่วยงานเพิ่มเติม</span><select className="inp w-full min-h-24" multiple value={extraUnits} disabled={locked || extraGroups.length === 0} onChange={e => setExtraUnits(Array.from(e.target.selectedOptions, o => o.value))}><option value="" disabled>{extraGroups.length ? 'เลือกหน่วยงานในกลุ่มงานเพิ่มเติม' : 'กรุณาเลือกกลุ่มงานเพิ่มเติมก่อน'}</option>{[...new Set(extraGroupUnits.map((u:any) => String(u.name || '').trim()).filter(Boolean))].sort((a:string,b:string) => a.localeCompare(b,'th')).map((x:string) => <option key={x} value={x}>{x}</option>)}</select><span className="field-hint">แสดงเฉพาะหน่วยงานในกลุ่มงานเพิ่มเติมที่เลือกไว้</span></label>
    </div>
    <p className="text-xs text-stone-500">บทบาทการอนุมัติไม่สามารถเปลี่ยนจากหน้านี้ได้ เพื่อป้องกันการเปลี่ยนสิทธิ์ด้วยตนเอง</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    {!locked && <button className="btn" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลบุคลากร'}</button>}
  </div>
}

function Main({ sb, session }: any) {
  const [profile, setProfile] = useState<any>(null); const [noProfile, setNoProfile] = useState(false)
  const [people, setPeople] = useState<any[]>([]); const [acts, setActs] = useState<any[]>([]); const [units, setUnits] = useState<any[]>([])
  const [directoryUnitNames, setDirectoryUnitNames] = useState<string[] | null>(null)
  const [directoryGroupNames, setDirectoryGroupNames] = useState<string[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [actsVersion, setActsVersion] = useState(0)
  const reloadActs = () => setActsVersion(v => v + 1)
  const [month, setMonth] = useState(today().slice(0, 7)); const [tab, setTab] = useState(''); const [logPageActivation, setLogPageActivation] = useState(0)
  const [unit, setUnit] = useState<number | null>(null)
  const [reviewGroup, setReviewGroup] = useState('')
  const [myUnits, setMyUnits] = useState<number[]>([])
  // Hooks must run in the same order before any conditional return.
  const [showLogNotice, setShowLogNotice] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [compactNav, setCompactNav] = useState(false)
  const [myLevel, setMyLevel] = useState(0); const [personLevel, setPersonLevel] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!profile) return
    const initialTab = tab || (profile.role === 'admin' ? 'review' : profile.role === 'committee' ? 'activities' : 'log')
    if (initialTab === 'log') setShowLogNotice(true)
  }, [profile, tab, logPageActivation])
    const loadPeople = () => {
    sb.from('people').select('*').eq('active', true).order('name').then((r: any) => setPeople(r.data || []))
    sb.rpc('person_levels').then((r: any) => setPersonLevel(Object.fromEntries((r.data || []).map((x: any) => [x.person_id, Number(x.lvl)]))))
  }
  useEffect(() => {
    sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle().then((r: any) => { if (!r.data) { setNoProfile(true); return } setProfile(r.data); setUnit((r.data.role === 'admin' || r.data.role === 'group_head') ? null : (r.data.unit_id ?? null)) })
    sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
    // ใช้ชื่อหน่วยงานจาก staff_directory ที่ active เป็นแหล่งอ้างอิงของ dropdown
    // แล้วจับคู่กับ units.name เพื่อคง unit_id/foreign keys เดิมโดยไม่แก้ข้อมูลฐานข้อมูล
    sb.rpc('directory_unit_names').then((r: any) => {
      if (r.error || !Array.isArray(r.data)) { console.error('โหลดรายชื่อหน่วยงานจาก staff_directory ไม่สำเร็จ', r.error); setDirectoryUnitNames(null); return }
      setDirectoryUnitNames([...new Set(r.data.map((x: any) => String(typeof x === 'string' ? x : x?.unit_name ?? Object.values(x || {})[0] ?? '').trim()).filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b, 'th')))
    })
    // รวมกลุ่มงานจากทะเบียนบุคลากร เพื่อให้กลุ่มที่ยังไม่มีหน่วยงานใน units ปรากฏใน Dropdown ด้วย
    sb.from('staff_directory').select('nursing_group,extra_nursing_group_names').eq('active', true).then(({ data, error }: any) => {
      if (error) { console.error('โหลดรายชื่อกลุ่มงานจากทะเบียนบุคลากรไม่สำเร็จ', error); return }
      const names = (data || []).flatMap((d: any) => [d.nursing_group, ...String(d.extra_nursing_group_names || '').split(/[|,;]/)])
        .map((v: any) => String(v || '').trim()).filter(Boolean)
      setDirectoryGroupNames([...new Set(names)].sort((a: string, b: string) => a.localeCompare(b, 'th')))
    })
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.rpc('my_approval_level').then((r: any) => setMyLevel(Number(r.data || 0)))
    sb.rpc('my_units').then((r: any) => setMyUnits((r.data || []).map((x: any) => (typeof x === 'object' && x ? Object.values(x)[0] : x) as number)))
    loadPeople()
  }, [])
  useEffect(() => {
    if (profile?.role === 'group_head' && profile?.nursing_group) setReviewGroup(String(profile.nursing_group).trim())
  }, [profile?.role, profile?.nursing_group])

  useEffect(() => { sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || [])) }, [actsVersion])
  if (noProfile) return <div className="p-8 space-y-3"><p>ไม่พบข้อมูลบัญชีของคุณในระบบ (บัญชีอาจถูกลบแล้ว) กรุณาออกจากระบบแล้วลงทะเบียนใหม่</p><button className="btn" onClick={() => sb.auth.signOut({ scope: 'local' })}>ออกจากระบบ</button></div>
  if (!profile) return <p className="p-8">กำลังโหลดโปรไฟล์…</p>
  const role = profile.role; const isRev = role === 'committee' || role === 'admin'; const isHeadRole = role === 'head' || role === 'group_head'
  const tabs = [...(role !== 'committee' ? [['log', 'บันทึกกิจกรรม']] : []), ['activities', 'คลังกิจกรรม'], ...(isHeadRole || role === 'admin' ? [['certify', 'รับรองกิจกรรม'], ['review', 'สรุปรายงานหน่วยงาน']] : []), ...(role === 'admin' ? [['people', 'บุคลากร']] : []), ...(isRev ? [['audit', 'คกก. P4P ตรวจสอบ'], ['payout', 'จ่ายเงิน P4P']] : []), ...(role === 'admin' ? [['users', 'จัดการผู้ใช้'], ['settings', 'ตั้งค่า']] : [['personal', 'แก้ไขข้อมูลส่วนตัว']])]
  const cur = tab || (role === 'admin' ? 'review' : tabs[0]?.[0])  // แสดงเฉพาะหน่วยงานที่มีอยู่ใน staff_directory ล่าสุด และจับคู่ชื่อแบบตรงตัวกับ units
  // ไม่สร้าง/เปลี่ยน unit_id และไม่แก้หรือรวมข้อมูลในฐานข้อมูล
  // ซ่อนชื่อหน่วยงานเดิมเสมอ แม้โหลด staff_directory ไม่สำเร็จหรือมีข้อมูลเก่าค้างใน units
  const directoryUnits = units.filter(u => {
    const name = String(u.name || '').trim()
    return directoryUnitNames === null || directoryUnitNames.includes(name)
  }).slice().sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'th'))
  const allGroupNames = [...new Set([...units.map((u: any) => String(u.parent_group || '').trim()), ...directoryGroupNames].filter(Boolean))]
    .sort((a: string, b: string) => a.localeCompare(b, 'th'))
  const unitOptions = isHeadRole ? directoryUnits.filter(u => myUnits.includes(u.id) || (role === 'head' && u.id === profile.unit_id)) : isRev ? directoryUnits : directoryUnits.filter(u => u.id === profile.unit_id)
  const scope = people.filter(p => (isRev || isHeadRole ? (unit != null ? Number(p.unit_id) === Number(unit) : (cur === 'review' && !!reviewGroup && p.unit_id == null && String(p.org_role || '').includes('หัวหน้ากลุ่มงาน'))) : p.user_id === session.user.id))
  const navIcons: Record<string, any> = { log: ClipboardList, activities: LibraryBig, certify: ShieldCheck, review: ClipboardCheck, people: Users, audit: Shield, payout: Wallet, users: Users, settings: Settings, personal: Users }
  const pageTitle = tabs.find(([k]) => k === cur)?.[1] || 'ภาพรวมระบบ'
  const navigation = <>{tabs.map(([k, l]) => { const Icon = navIcons[k] || LayoutDashboard; return <button type="button" key={k} title={compactNav ? l : undefined} onClick={() => { if (k === 'log') setLogPageActivation(v => v + 1); setTab(k); setMobileNav(false) }} className={'sidebar-link ' + (cur === k ? 'active' : '')}><Icon size={19} strokeWidth={1.9}/><span>{l}</span>{cur === k && <span className="sidebar-active-dot"/>}</button> })}</>
  return <MeCtx.Provider value={session.user.id}><ApproverCtx.Provider value={{ role, level: myLevel, personUser: Object.fromEntries(people.map((p: any) => [p.id, p.user_id])), personLevel }}><div className={'p4p-shell ' + (compactNav ? 'nav-compact' : '')}>
    {mobileNav && <button aria-label="ปิดเมนู" className="sidebar-scrim" onClick={() => setMobileNav(false)}/>}
    <aside className={'app-sidebar ' + (mobileNav ? 'mobile-open' : '')}>
      <div className="sidebar-brand"><img src="https://raw.githubusercontent.com/itnurse-swdcph/p4pcal/main/icon.png" alt="P4P" /><div className="sidebar-brand-copy"><strong>P4P Nursing</strong><span>SMART WORKFLOW</span></div><button className="sidebar-icon mobile-close" aria-label="ปิดเมนู" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <div className="sidebar-org"><span className="sidebar-org-icon"><Building2 size={17}/></span><div><strong>กลุ่มการพยาบาล</strong><span>รพ.สมเด็จพระยุพราชสว่างแดนดิน</span></div></div>
      <div className="sidebar-section-label">เมนูหลัก</div><nav className="sidebar-navigation" aria-label="เมนูหลัก">{navigation}</nav>
      <div className="sidebar-bottom"><div className="sidebar-user"><span className="sidebar-avatar">{(profile.full_name || session.user.email || 'U').trim().charAt(0)}</span><div className="sidebar-user-copy"><strong>{profile.full_name || session.user.email}</strong><span>{ROLE_TH[role]}</span></div></div><button className="sidebar-link sidebar-logout" onClick={() => sb.auth.signOut()}><LogOut size={18}/><span>ออกจากระบบ</span></button><div className="sidebar-version">P4P · Nursing Informatics</div></div>
      <button className="sidebar-collapse" title={compactNav ? 'ขยายเมนู' : 'ย่อเมนู'} aria-label={compactNav ? 'ขยายเมนู' : 'ย่อเมนู'} onClick={() => setCompactNav(v => !v)}><ChevronLeft size={18}/><span>{compactNav ? 'ขยายเมนู' : 'ย่อเมนู'}</span></button>
    </aside>
    <div className="p4p-main">
      <header className="app-topbar"><button className="sidebar-icon menu-toggle" aria-label="เปิดเมนู" onClick={() => setMobileNav(true)}><Menu size={22}/></button><div className="topbar-heading"><span className="topbar-eyebrow">P4P NURSING SYSTEM</span><h1>{pageTitle}</h1></div><div className="topbar-actions">
      {(role === 'committee' || (role === 'head' && unitOptions.length > 1)) && <label className="topbar-unit"><Building2 size={16}/><select className="inp" aria-label="หน่วยงาน" value={unit ?? ''} onChange={e => setUnit(e.target.value ? +e.target.value : null)}>{role === 'admin' && <option value="">เลือกหน่วยงานก่อน</option>}{unitOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <label className="topbar-month"><CalendarDays size={17}/><input type="month" aria-label="เดือนที่แสดง" className="inp" value={month} onChange={e => setMonth(e.target.value)} /></label>
      </div></header>
      <main className="app-content">
      {showLogNotice && cur === 'log' && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation">
        <section role="alertdialog" aria-modal="true" aria-labelledby="log-notice-title" aria-describedby="log-notice-description" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><CalendarDays size={26}/></span>
            <h2 id="log-notice-title" className="text-xl font-bold text-stone-900">แจ้งเตือนการบันทึกกิจกรรม P4P</h2>
          </div>
          <p id="log-notice-description" className="text-base leading-8 text-stone-700">การบันทึกกิจกรรม P4P บันทึกได้เฉพาะวันปฏิบัติงานที่เป็นวันทำการ เวร OT ไม่อนุญาตให้นำมาคิดกิจกรรม กรุณาตรวจสอบวันปฏิบัติงานก่อนบันทึกกิจกรรม ขอบคุณค่ะ</p>
          <div className="flex justify-end"><button type="button" className="btn" onClick={() => setShowLogNotice(false)}>รับทราบ</button></div>
        </section>
      </div>}


    {tabs.length === 0 && <p>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน</p>}
    {cur === 'personal' && role !== 'admin' && <PersonalProfilePage sb={sb} profile={profile} role={role} units={directoryUnits} groupOptions={allGroupNames} positions={positions} session={session} reload={loadPeople} />}
    {cur === 'log' && (role === 'staff' && scope.length === 0
      ? <div className="card">ยังไม่พบชื่อของคุณในรายชื่อบุคลากร — แจ้งหัวหน้างานให้เพิ่มชื่อ "{profile.full_name}" แล้วสมัครใหม่ หรือให้ผู้ดูแลผูกบัญชีให้</div>
      : <LogPage key={logPageActivation} units={units} sb={sb} people={scope} allPeople={people} unitOptions={unitOptions} defaultUnit={unit ?? profile.unit_id} acts={acts} positions={positions} month={month} setMonth={setMonth} canApprove={role !== 'staff'} reloadPeople={loadPeople} profileOrgRole={profile.org_role} currentUserId={session.user.id} currentUserStaffDirectoryId={profile.staff_directory_id} groupOptions={allGroupNames} />)}
    {(cur === 'certify' || cur === 'review') && (role === 'admin' || isHeadRole) && <div className="space-y-3">
      <div className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1"><span className="field-label">กลุ่มงาน</span>
            <select className="inp w-full" value={reviewGroup} onChange={e => { const g = e.target.value; setReviewGroup(g); setUnit(null) }}>
              <option value="">เลือกกลุ่มงาน</option>
              {allGroupNames.map((g: string) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="block space-y-1"><span className="field-label">หน่วยงาน</span>
            <select className="inp w-full" value={unit ?? ''} disabled={!reviewGroup} onChange={e => setUnit(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{reviewGroup ? 'เลือกหน่วยงาน' : 'กรุณาเลือกกลุ่มงานก่อน'}</option>
              {unitOptions.filter((u: any) => String(u.parent_group || '').trim() === reviewGroup).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-stone-600">{role === 'admin' ? 'ผู้ดูแลระบบสามารถเลือกหน่วยงานได้ทั้งหมด' : 'แสดงเฉพาะหน่วยงานที่บัญชีของคุณได้รับมอบหมายให้รับผิดชอบ'}</p>
      </div>
      {reviewGroup ? (unit != null ? <ReviewPage units={units} sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} canPrint={cur === 'review'} reportOnly={cur === 'review'} certificationOnly={cur === 'certify'} /> : cur === 'certify' ? <GroupHeadsCertification sb={sb} groupName={reviewGroup} people={people} month={month} acts={acts} /> : <GroupHeadsReport sb={sb} groupName={reviewGroup} people={scope} allPeople={people} month={month} positions={positions} units={units} acts={acts} />) : <div className="card text-center text-sm text-stone-600">กรุณาเลือกกลุ่มงานเพื่อแสดง{cur === 'certify' ? 'รายการรอรับรอง' : 'รายงานหน่วยงาน'}</div>}
    </div>}
    {cur === 'people' && <PersonnelPage sb={sb} positions={positions} units={directoryUnits} reload={loadPeople} />}
    {cur === 'users' && <UsersPage sb={sb} units={units} />}
    {cur === 'payout' && <PayoutPage sb={sb} month={month} isAdmin={role === 'admin'} />}
    {cur === 'settings' && <SettingsPage sb={sb} />}
    {cur === 'activities' && <ActivityLibrary myLine={positions.find((x: any) => x.name === profile.position)?.grp} seeAll={role !== 'staff'} sb={sb} acts={acts} positions={positions} isAdmin={role === 'admin'} reloadActs={reloadActs} />}
    {cur === 'audit' && <div className="space-y-3">
      {role === 'admin' && <div className="card space-y-2"><label className="field-label" htmlFor="admin-audit-unit">หน่วยงานที่ต้องการตรวจสอบ</label><select id="admin-audit-unit" className="inp w-full" value={unit ?? ''} onChange={e => setUnit(e.target.value ? Number(e.target.value) : null)}><option value="">เลือกหน่วยงาน</option>{unitOptions.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>}
      {unit || role !== 'admin' ? <ReviewPage units={units} canPrint={role !== 'committee'} sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} audit /> : <div className="card text-center text-sm text-stone-600">กรุณาเลือกหน่วยงานเพื่อแสดงรายการตรวจสอบ</div>}
    </div>}
      </main>
      <footer className="app-footer">{FOOTER_TEXT}</footer>
    </div>
  </div></ApproverCtx.Provider></MeCtx.Provider>
}

// PostgREST จำกัดผลลัพธ์ต่อคำขอ (ปกติ 1,000 แถว) จึงดึงเป็นช่วงจนครบ
async function fetchPages(mk: (from: number, to: number) => any) {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await mk(i, i + 999)
    if (error || !data) break
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
function useLogs(sb: any, month: string, personIds: string[] | null, unit?: number | null) {
  const [rows, setRows] = useState<any[]>([]); const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    const [a, b] = mRange(month)
    ;(async () => {
      const baseRows = await fetchPages((x, y) => {
        let q = sb.from('v_logs').select('*').gte('work_date', a).lte('work_date', b).order('work_date', { ascending: true }).order('id', { ascending: true })
        if (unit) q = q.eq('unit_id', unit)
        if (personIds) q = q.in('person_id', personIds)
        return q.range(x, y)
      })
      if (!alive) return
      if (!baseRows.length) { setRows([]); return }
      const extraMap = new Map<any, any>()
      for (let i = 0; i < baseRows.length; i += 200) {
        const { data } = await sb.from('logs').select('id, sub_activity, evidence_image_path, entered_by, reject_reason, submitted_at, parent_log_id, supplemental_reason').in('id', baseRows.slice(i, i + 200).map((x: any) => x.id))
        ;(data || []).forEach((x: any) => extraMap.set(x.id, x))
      }
      if (alive) setRows(baseRows.map((x: any) => ({ ...x, ...(extraMap.get(x.id) || {}) })))
    })()
    return () => { alive = false }
  }, [month, n, unit, personIds?.join(',')])
  return [rows, () => setN(x => x + 1)] as const
}

function LogPage({ units, sb, people: peopleProp, allPeople, unitOptions, defaultUnit, acts, positions, month, setMonth, canApprove, reloadPeople, profileOrgRole, currentUserId, currentUserStaffDirectoryId, groupOptions = [] }: any) {
  const picker = !!canApprove
  const me = useContext(MeCtx)
  const personRecords = [...(allPeople || []), ...(peopleProp || [])].filter((p: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === p.id) === i)
  const ownPerson = personRecords.find((p: any) => p.user_id === currentUserId) || (currentUserStaffDirectoryId != null ? personRecords.find((p: any) => Number(p.staff_directory_id) === Number(currentUserStaffDirectoryId)) : null)
  const [entryMode, setEntryMode] = useState<'self' | 'other'>('self')
  const approver = useContext(ApproverCtx)
  const [printing, setPrinting] = useState(false) // หัวหน้า/แอดมิน: เลือกหน่วยงานและบุคลากรที่จะบันทึกให้
  const [uSel, setUSel] = useState<number | null>(defaultUnit ?? unitOptions?.[0]?.id ?? null)
  const [groupSel, setGroupSel] = useState<string>(() => (unitOptions || []).find((u: any) => u.id === (defaultUnit ?? unitOptions?.[0]?.id))?.parent_group || '')
  const [directoryStaff, setDirectoryStaff] = useState<any[]>([])
  const [locallyAddedPeople, setLocallyAddedPeople] = useState<any[]>([])
  const [selectingStaff, setSelectingStaff] = useState(false)
  const [peopleLoadError, setPeopleLoadError] = useState('')
  const people = useMemo(() => {
    if (!picker) return peopleProp
    if (entryMode === 'self') return ownPerson ? [ownPerson] : []
    const directoryIds = new Set(directoryStaff.map((d: any) => Number(d.source_row)))
    return [...(allPeople || []), ...locallyAddedPeople].filter((p: any, i: number, arr: any[]) =>
      arr.findIndex((x: any) => x.id === p.id) === i && (uSel ? Number(p.unit_id) === Number(uSel) : p.unit_id == null && directoryIds.has(Number(p.staff_directory_id)))
    )
  }, [picker, entryMode, ownPerson, allPeople, locallyAddedPeople, uSel, peopleProp, directoryStaff])
  const groupNames = useMemo(() => [...new Set([...(groupOptions || []), ...(unitOptions || []).map((u: any) => String(u.parent_group || '').trim())].filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b, 'th')), [groupOptions, unitOptions])
  useEffect(() => {
    if (!picker || entryMode !== 'other' || !groupSel) { setDirectoryStaff([]); setPeopleLoadError(''); return }
    let alive = true
    sb.rpc('directory_group_staff', { p_group_name: groupSel }).then(({ data, error }: any) => {
      if (!alive) return
      if (error) { console.error('โหลดทะเบียนบุคลากรตามกลุ่มงานไม่สำเร็จ', error); setPeopleLoadError('โหลดทะเบียนบุคลากรของกลุ่มงานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์'); setDirectoryStaff([]); return }
      setPeopleLoadError('')
      const list = Array.isArray(data) ? data : []
      setDirectoryStaff(uSel ? list.filter((d: any) => String(d.unit_name || '').trim() === String((unitOptions || []).find((u: any) => u.id === uSel)?.name || '').trim()) : list.filter((d: any) => !String(d.unit_name || '').trim()))
    })
    return () => { alive = false }
  }, [picker, entryMode, groupSel, uSel, sb, unitOptions])
  const pickerPeople = useMemo(() => {
    if (!picker) return people
    const result = [...people]
    for (const d of directoryStaff) {
      // จับคู่กับระเบียนเดิมด้วย person_id จากฐานข้อมูล (ชื่อรูปแบบเดียวกับตอนลงทะเบียน) เพื่อไม่สร้างซ้ำ
      const fullName = d.full_name
      const match = result.find((p: any) => p.id === d.person_id) || result.find((p: any) => p.unit_id === uSel && String(p.name || '').trim() === fullName)
      if (match) { match.org_role = match.org_role || d.org_role; match.staff_directory_id = match.staff_directory_id || d.source_row } else result.push({ id: 'dir:' + d.source_row, directory_source_row: d.source_row, prefix: d.prefix, first_name: d.first_name, last_name: d.last_name, name: fullName, position: d.position, org_role: d.org_role, unit_id: uSel, active: true, fromDirectory: true })
    }
    return result.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'th'))
  }, [picker, entryMode, people, directoryStaff, uSel])
  const ids = useMemo(() => pickerPeople.filter((p: any) => !String(p.id).startsWith('dir:')).map((p: any) => p.id), [pickerPeople])
  const [rows, reload] = useLogs(sb, month, ids.length ? ids : (picker ? [] : null), picker && entryMode === 'self' ? null : uSel)
  const [pid, setPid] = useState<any>(picker ? '' : people[0]?.id); const [date, setDate] = useState(today()); const [code, setCode] = useState('')
  const [q, setQ] = useState(''); const [activityDropdownOpen, setActivityDropdownOpen] = useState(false); const [role, setRole] = useState(ROLES[2]); const [qty, setQty] = useState('1'); const [ev, setEv] = useState(''); const [subActivity, setSubActivity] = useState(''); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [err, setErr] = useState(''); const [modalOpen, setModalOpen] = useState(false); const [duplicateRows, setDuplicateRows] = useState<any[]>([]); const [duplicateOpen, setDuplicateOpen] = useState(false); const [editTargetRow, setEditTargetRow] = useState<any>(null); const [supplementalTarget, setSupplementalTarget] = useState<any>(null); const [supplementalReason, setSupplementalReason] = useState('')
  const [notice, setNotice] = useState('')
  const [savingActivity, setSavingActivity] = useState(false)
  // Show immediate approval only after the loaded person-level map confirms the hierarchy; newly materialized directory staff trigger a refresh first.
  const canApproveImmediately = !!picker && !!pid && Object.prototype.hasOwnProperty.call(approver?.personLevel || {}, pid) && Object.prototype.hasOwnProperty.call(approver?.personUser || {}, pid) && canDecideRow(approver, me, { person_id: pid })
  const [shift, setShift] = useState('เช้า'); const [caps, setCaps] = useState<any>({ cap_shift_points: 90, cap_day_points: 180 })
  useEffect(() => { sb.from('app_settings').select('key,value').in('key', ['cap_shift_points', 'cap_day_points']).then((r: any) => setCaps(Object.fromEntries([['cap_shift_points', 90], ['cap_day_points', 180], ...(r.data || []).map((x: any) => [x.key, Number(x.value)])]))) }, [])
  useEffect(() => { if (!picker && !pid && people[0]) setPid(people[0].id) }, [people])
  useEffect(() => { if (picker && entryMode === 'self') setPid(ownPerson?.id || ''); else if (picker && entryMode === 'other') setPid('') }, [picker, entryMode, ownPerson?.id])
  useEffect(() => { setQ('') }, [pid])
  const person = pickerPeople.find((p: any) => p.id === pid); const pos = positions.find((x: any) => x.name === person?.position)
  const codeRank = (c: string) => ({ ADM: 0, SVC: 1, ACD: 2 } as any)[String(c).slice(0, 3)] ?? 3
  const byCode = (a: any, b: any) => codeRank(a.code) - codeRank(b.code) || String(a.code).localeCompare(String(b.code))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)   // พิมพ์หลายคำได้ ต้องพบครบทุกคำ ในรหัส/กิจกรรมหลัก/กิจกรรมย่อย
  const selectedUnitName = String((unitOptions || []).find((u: any) => Number(u.id) === Number(person?.unit_id))?.name || '').trim()
  const isMedicalCenterStaff = selectedUnitName === 'ศูนย์เครื่องมือแพทย์'
  const isMedicalCenterOnly = (a: any) => String(a?.title || '').startsWith('[เฉพาะศูนย์เครื่องมือแพทย์]')
  const specialCrossLineUnits = ['งานการพยาบาลผู้ป่วยห้องผ่าตัด', 'งานการพยาบาลวิสัญญี']
  const isSpecialCrossLineNurse = pos?.grp === 'พยาบาล' && specialCrossLineUnits.includes(selectedUnitName)
  const crossLineGroups = ['พยาบาล', 'ผู้ช่วยเหลือคนไข้', 'พนักงานประจำตึก']
  const eligibleActs = acts.filter((a: any) => ((!pos || a.eligible.includes(pos.grp)) || (isSpecialCrossLineNurse && crossLineGroups.some(g => a.eligible.includes(g)))) && (!isMedicalCenterOnly(a) || isMedicalCenterStaff))
  // แสดงกิจกรรมที่มีสิทธิ์เลือกทั้งหมดทันทีเมื่อเปิดช่อง และกรองตามคำค้นหาทันทีเมื่อเริ่มพิมพ์
  const list = eligibleActs.filter((a: any) => terms.every(t => [a.code, a.main_activity, a.title].join(' ').toLowerCase().includes(t))).sort(byCode)
  const act = acts.find((a: any) => a.code === code)
  const prev = act && pos ? act.minutes * Number(qty || 0) * pos.rate : 0
  const shown = pid ? rows.filter((r: any) => r.person_id === pid) : rows
  // ใช้ข้อมูลบุคลากรและชุดรายการแบบเดียวกับหน้าสรุปรายบุคคลก่อนเปิดใบพิมพ์
  const printPerson = person ? (() => {
    const canonical = personRecords.find((p: any) => p.id === person.id || (person.person_id && p.id === person.person_id))
    return {
      ...(canonical || {}),
      ...person,
      name: person.name || canonical?.name,
      position: person.position || canonical?.position,
      org_role: person.org_role || canonical?.org_role,
      unit_id: person.unit_id ?? canonical?.unit_id,
      sub_unit: person.sub_unit || canonical?.sub_unit,
    }
  })() : null
  const printRows = printPerson ? rows.filter((r: any) =>
    r.person_id === printPerson.id || (printPerson.person_id && r.person_id === printPerson.person_id)
  ) : []
  const myDrafts = shown.filter((r: any) => r.status === 'draft' && r.entered_by === me)
  const myRejected = shown.filter((r: any) => r.status === 'rejected' && r.entered_by === me)
  // เพดานคะแนนต่อเวรและต่อวัน (คำนวณตัดส่วนเกินที่ฐานข้อมูล ตรงนี้แสดงโควตาที่ใช้ไปแล้ว)
  const capS = Math.min(90, Number(caps.cap_shift_points) || 90), capD = Number(caps.cap_day_points) || 180
  const dayRows = rows.filter((r: any) => r.person_id === pid && r.work_date === date && r.status !== 'rejected')
  const usedShift = dayRows.filter((r: any) => r.shift === shift).reduce((t: number, r: any) => t + Number(r.shift_points || 0), 0)
  const dayUsed = dayRows.reduce((t: number, r: any) => t + Number(r.counted_points || 0), 0)
  const room = Math.max(0, Math.min(capS - usedShift, capD - dayUsed))
  const shiftName = shift === 'แสตนด์เช้า' ? 'แสตนด์เช้า' : 'เวร' + shift
  const chooseActivity = async (activity: any) => {
    setCode(activity.code); setErr('')
    if (String(activity?.title || '').startsWith('[เฉพาะศูนย์เครื่องมือแพทย์]') && !isMedicalCenterStaff) {
      setErr('กิจกรรมนี้ใช้ได้เฉพาะบุคลากรหน่วยงานศูนย์เครื่องมือแพทย์เท่านั้น')
      return
    }
    if (!pid) { setErr('กรุณาเลือกบุคลากรก่อน'); return }
    const { data, error } = await sb.from('logs')
      .select('id, person_id, work_date, activity_code, qty, status, evidence, sub_activity, evidence_image_path, parent_log_id, supplemental_reason')
      .eq('person_id', pid).eq('work_date', date).eq('activity_code', activity.code).eq('shift', shift)
      .order('id', { ascending: true })
    if (error) { setErr('ตรวจสอบรายการที่บันทึกไว้แล้วไม่สำเร็จ: ' + error.message); return }
    if (data?.length) {
      setDuplicateRows(data)
      setDuplicateOpen(true)
      setModalOpen(false)
      return
    }
    setDuplicateRows([])
    setQty('1'); setEv(''); setSubActivity(''); setEvidenceFile(null)
    setModalOpen(true)
  }
  const save = async (approveImmediately = false) => {
    setErr('')
    if (approveImmediately && !canApproveImmediately) { setErr('บัญชีนี้ไม่มีสิทธิ์รับรองกิจกรรมของบุคลากรที่เลือก'); return }
    setSavingActivity(true)
    if (!pid) { setSavingActivity(false); setErr('กรุณาเลือกบุคลากรก่อน'); return }
    if (!code || !act) { setSavingActivity(false); setErr('กรุณาค้นหาและเลือกกิจกรรม'); return }
    if (String(act?.title || '').startsWith('[เฉพาะศูนย์เครื่องมือแพทย์]') && !isMedicalCenterStaff) {
      setSavingActivity(false)
      setErr('บันทึกไม่ได้: กิจกรรมนี้ใช้ได้เฉพาะบุคลากรหน่วยงานศูนย์เครื่องมือแพทย์เท่านั้น')
      return
    }
    if (!qty || Number(qty) <= 0) { setSavingActivity(false); setErr('กรุณาระบุจำนวนให้มากกว่า 0'); return }
    if (!subActivity.trim()) { setSavingActivity(false); setErr('กรุณากรอกกิจกรรมย่อย / รายละเอียดการดำเนินงานก่อนบันทึก'); return }
    if (supplementalTarget && supplementalReason.trim().length < 5) { setSavingActivity(false); setErr('กรุณาระบุเหตุผลการขอเพิ่มจำนวนอย่างน้อย 5 ตัวอักษร'); return }
    if (act.need_evidence && !ev.trim() && !evidenceFile) { setSavingActivity(false); setErr(`กิจกรรมนี้ต้องมีหลักฐาน: ${act.definition || 'กรุณาระบุเอกสารหรือแนบรูปถ่ายประกอบ'}`); return }
    // Check the total for this person, date and activity across all previously saved rows.
    // The database trigger performs the same validation as a final safeguard against concurrent requests.
    if (act.max_day !== null && act.max_day !== undefined && act.max_day !== '') {
      const { data: sameDayRows, error: limitQueryError } = await sb.from('logs')
        .select('qty')
        .eq('person_id', pid)
        .eq('work_date', date)
        .eq('activity_code', code)
      if (limitQueryError) { setSavingActivity(false); setErr('ตรวจสอบจำนวนสะสมต่อวันไม่สำเร็จ จึงยังบันทึกรายการไม่ได้ กรุณาลองใหม่: ' + limitQueryError.message); return }
      const alreadyLogged = (sameDayRows || []).reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)
      const requestedQty = Number(qty)
      const dailyLimit = Number(act.max_day)
      if (alreadyLogged + requestedQty > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - alreadyLogged)
        setErr(`บันทึกไม่ได้: กิจกรรมนี้กำหนดไม่เกิน ${dailyLimit} ${act.uom || 'หน่วย'} ต่อวัน วันที่ ${formatThaiShortDate(date)} บันทึกสะสมไปแล้ว ${alreadyLogged} ${act.uom || 'หน่วย'} และกำลังเพิ่ม ${requestedQty} ${act.uom || 'หน่วย'} รวมเป็น ${alreadyLogged + requestedQty} เกินกำหนด เหลือบันทึกได้อีก ${remaining} ${act.uom || 'หน่วย'}`)
        setSavingActivity(false); return
      }
    }
    const { data: inserted, error } = await sb.from('logs').insert({ person_id: pid, work_date: date, activity_code: code, role: null, qty: +qty, evidence: ev.trim() || (evidenceFile ? 'แนบรูปถ่าย' : null), sub_activity: subActivity.trim() || null, shift, ...(supplementalTarget ? { parent_log_id: supplementalTarget.id, supplemental_reason: supplementalReason.trim() } : {}) }).select('id').single()
    if (error) {
      setSavingActivity(false);
      if (error.code === '23514' && /เกินจำนวนสูงสุดต่อวัน/.test(error.message || '')) {
        setErr('บันทึกไม่ได้: ' + error.message)
      } else {
        setErr(error.message)
      }
      return
    }
    if (evidenceFile && inserted?.id) {
      const safeName = evidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${pid}/${inserted.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await sb.storage.from('p4p-evidence').upload(path, evidenceFile, { contentType: evidenceFile.type, upsert: false })
      if (uploadError) { setSavingActivity(false); setErr(`บันทึกรายการแล้ว แต่แนบรูปไม่สำเร็จ: ${uploadError.message}`); reload(); return }
      const { error: pathError } = await sb.from('logs').update({ evidence_image_path: path }).eq('id', inserted.id)
      if (pathError) { setSavingActivity(false); setErr(`อัปโหลดรูปแล้ว แต่บันทึกการเชื่อมโยงรูปไม่สำเร็จ: ${pathError.message}`); reload(); return }
    }
    if (approveImmediately && inserted?.id) {
      const { error: pendingError } = await sb.from('logs').update({ status: 'pending' }).eq('id', inserted.id)
      if (pendingError) { setSavingActivity(false); setErr('บันทึกกิจกรรมแล้ว แต่ส่งเข้าขั้นตอนรับรองไม่สำเร็จ: ' + pendingError.message); reload(); return }
      const { error: approveError } = await sb.from('logs').update({ status: 'approved' }).eq('id', inserted.id)
      if (approveError) { setSavingActivity(false); setErr('บันทึกกิจกรรมและส่งเข้าคิวแล้ว แต่รับรองทันทีไม่สำเร็จ กรุณาให้ผู้มีสิทธิ์รับรองตรวจรายการ: ' + approveError.message); reload(); return }
    }
    setSavingActivity(false); setEv(''); setSubActivity(''); setEvidenceFile(null); setQty('1'); setErr(''); setModalOpen(false); setNotice(supplementalTarget ? 'บันทึกคำขอเพิ่มจำนวนเป็นแบบร่างแล้ว กรุณากดส่งให้ผู้มีสิทธิ์รับรอง โดยรายการต้นฉบับยังคงเดิม' : approveImmediately ? 'บันทึกและรับรองกิจกรรมให้บุคลากรที่เลือกเรียบร้อยแล้ว' : picker ? 'บันทึกเป็นแบบร่างแล้ว กิจกรรมยังไม่ถูกนับจนกว่าจะส่งให้ผู้มีสิทธิ์รับรอง' : 'บันทึกเป็นแบบร่างแล้ว กดปุ่ม "ส่ง" ในตารางเมื่อพร้อมให้หัวหน้ารับรอง (แบบร่างแก้ไขหรือลบได้ แต่เมื่อส่งแล้วจะล็อก)'); setSupplementalTarget(null); setSupplementalReason(''); reload()
  }
  return <div className="space-y-4">
    <div className="space-y-3">
      {person && <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn sec" onClick={() => setPrinting(true)}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์ใบสรุปประจำเดือน (A4)</button><button type="button" className="btn" onClick={() => document.getElementById('saved-activity-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ตรวจสอบรายการบันทึก</button></div>}
      {printing && printPerson && <PrintSheet sb={sb} person={printPerson} rows={printRows} month={month} units={units} positions={positions} onClose={() => setPrinting(false)} />}
      {myDrafts.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-300 bg-white p-3 text-sm"><span>แบบร่างที่ยังไม่ส่ง <b>{myDrafts.length}</b> รายการ (ยังไม่นับคะแนน)</span>
        <button type="button" className="btn" onClick={async () => { if (!confirm(`ส่ง ${myDrafts.length} รายการให้หัวหน้ารับรอง? เมื่อส่งแล้วจะแก้ไขหรือลบไม่ได้`)) return; const { error } = await sb.from('logs').update({ status: 'pending' }).in('id', myDrafts.map((r: any) => r.id)); if (error) alert('ส่งรายการไม่สำเร็จ: ' + error.message); else { setNotice(`ส่ง ${myDrafts.length} รายการให้หัวหน้ารับรองแล้ว`); reload() } }}>ส่งทั้งหมด ({myDrafts.length})</button></div>}
      <ActivitySummary sb={sb} rows={shown} person={person ? { ...person, org_role: person.org_role || profileOrgRole } : null} positions={positions} month={month} units={units} />
    </div>
    <div className="card activity-entry-card w-full max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">P4P · ACTIVITY ENTRY</p><h2 className="text-lg font-bold text-slate-900">เพิ่มรายการกิจกรรม</h2><p className="mt-1 text-sm text-slate-600">กรอกข้อมูลตามลำดับ แล้วตรวจสอบก่อนบันทึก</p></div><span className="hidden sm:inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">แบบฟอร์มบันทึก</span></div>
      {picker && <>
        <label className="field-label">รูปแบบการบันทึกกิจกรรม</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" className={'rounded-xl border p-3 text-left ' + (entryMode === 'self' ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600' : 'border-slate-200 bg-white')} onClick={() => { setEntryMode('self'); setErr(''); setGroupSel(''); setUSel(null) }}><span className="block font-semibold">บันทึกกิจกรรมของตนเอง</span><span className="mt-1 block text-xs">ดึงข้อมูลบุคลากรของบัญชีที่เข้าสู่ระบบอัตโนมัติ</span></button>
          <button type="button" className={'rounded-xl border p-3 text-left ' + (entryMode === 'other' ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600' : 'border-slate-200 bg-white')} onClick={() => { setEntryMode('other'); setErr(''); setUSel(defaultUnit ?? unitOptions?.[0]?.id ?? null); setGroupSel((unitOptions || []).find((u: any) => u.id === (defaultUnit ?? unitOptions?.[0]?.id))?.parent_group || '') }}><span className="block font-semibold">บันทึกกิจกรรมให้คนอื่น</span><span className="mt-1 block text-xs">เลือกกลุ่มงาน หน่วยงาน และบุคลากรเป้าหมาย</span></button>
        </div>
        {entryMode === 'self' && !ownPerson && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">ยังไม่พบระเบียนบุคลากรที่เชื่อมกับบัญชีนี้ จึงยังบันทึกกิจกรรมของตนเองไม่ได้ กรุณาให้ผู้ดูแลระบบผูกบัญชีกับทะเบียนบุคลากรก่อน</p>}
        {entryMode === 'other' && <>
        <label className="field-label">1. เลือกกลุ่มงาน</label>
        <select className="inp" value={groupSel} onChange={e => { setGroupSel(e.target.value); setUSel(null); setPid(''); setErr('') }}><option value="">— เลือกกลุ่มงาน —</option>{groupNames.map((g: string) => <option key={g} value={g}>{g}</option>)}</select>
        <label className="field-label">2. เลือกหน่วยงาน <span className="text-xs font-normal text-stone-500">(หากเป็นหัวหน้ากลุ่มงานที่ไม่มีหน่วยงาน ให้เว้นว่าง)</span></label>
        <select className="inp" value={uSel ?? ''} disabled={!groupSel} onChange={e => { setUSel(e.target.value ? +e.target.value : null); setPid(''); setErr('') }}><option value="">— ไม่เลือกหน่วยงาน / หัวหน้ากลุ่มงาน —</option>{(unitOptions || []).filter((u: any) => String(u.parent_group || '').trim() === groupSel).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <label className="field-label">3. เลือกชื่อบุคลากร</label>
        <select className="inp" value={pid} disabled={selectingStaff} onChange={async e => {
          const value = e.target.value; setErr(''); setPid(value)
          if (!value.startsWith('dir:')) return
          const d = directoryStaff.find((x: any) => String(x.source_row) === value.slice(4))
          if (!d) { setErr('ไม่พบข้อมูลบุคลากรในทะเบียน'); setPid(''); return }
          setSelectingStaff(true)
          const { data: newId, error } = await sb.rpc('ensure_person_from_directory', { p_source_row: d.source_row })
          if (error || !newId) { setSelectingStaff(false); setErr('เตรียมระเบียนบุคลากรเพื่อบันทึกกิจกรรมไม่สำเร็จ: ' + (error?.message || 'ไม่ทราบสาเหตุ')); setPid(''); return }
          const { data: inserted, error: readErr } = await sb.from('people').select('*').eq('id', newId).single()
          setSelectingStaff(false)
          if (readErr || !inserted) { setErr('อ่านระเบียนบุคลากรไม่สำเร็จ: ' + (readErr?.message || '')); setPid(''); return }
          setLocallyAddedPeople((prev: any[]) => [...prev, inserted])
          setPid(inserted.id)
          reloadPeople?.()
        }}><option value="">— เลือกบุคลากรในหน่วยงานนี้ —</option>{pickerPeople.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position}){p.fromDirectory ? ' · จากทะเบียนบุคลากร' : ''}</option>)}</select>
        {selectingStaff && <p className="text-xs text-teal-700">กำลังเตรียมระเบียนบุคลากร…</p>}
        {peopleLoadError && <p className="text-xs text-red-700">{peopleLoadError}</p>}
        {!pickerPeople.length && <p className="text-xs text-red-700">ไม่พบรายชื่อบุคลากรในกลุ่มงาน/หน่วยงานที่เลือกในทะเบียนบุคลากร</p>}
        </>}
      </>}
      {!picker && people.length > 1 && <select className="inp" value={pid} onChange={e => setPid(e.target.value)}>{people.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}</select>}
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label">วันที่ปฏิบัติงาน <span className="required-mark">*</span><input type="date" lang="th-TH" className="inp mt-1" value={date} onChange={e => setDate(e.target.value)} onKeyDown={e => e.preventDefault()} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }} aria-label="เลือกวันที่จากปฏิทินเท่านั้น" /></label>
        <label className="field-label">เวรที่ปฏิบัติ<select className="inp mt-1" value={shift} onChange={e => setShift(e.target.value)}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      {pid && <p role="status" className={'text-xs ' + (room <= 0 ? 'text-amber-800 font-bold' : 'text-stone-600')}>{shiftName}วันนี้ใช้ {nf(usedShift)}/{nf(capS, 0)} คะแนน · รวมทั้งวัน {nf(dayUsed)}/{nf(capD, 0)}{room <= 0 && ' · เต็มเพดาน บันทึกเพิ่มได้แต่ไม่นับคะแนน'}</p>}
      <div className="activity-step-grid"><div className="space-y-1 relative"><label className="field-label" htmlFor="activity-search">เลือกกิจกรรม</label><input id="activity-search" className="inp" autoComplete="off" placeholder="คลิกเพื่อเลือกรายการ หรือพิมพ์เพื่อค้นหา" value={q} onFocus={() => setActivityDropdownOpen(true)} onClick={() => setActivityDropdownOpen(true)} onBlur={() => setActivityDropdownOpen(false)} onChange={e => { setQ(e.target.value); setActivityDropdownOpen(true) }} onKeyDown={e => { if (e.key === 'Escape') setActivityDropdownOpen(false); if (e.key === 'ArrowDown') setActivityDropdownOpen(true) }} aria-expanded={activityDropdownOpen} aria-controls="activity-options-list" role="combobox" aria-autocomplete="list" />
        {activityDropdownOpen && <div id="activity-options-list" className="act-list absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox" aria-label="เลือกกิจกรรม">
          {list.map((a: any) => <button type="button" key={a.code} role="option" aria-selected={code === a.code} title={[a.main_activity, a.title].filter(Boolean).join(' › ')} onMouseDown={e => e.preventDefault()} onClick={() => { setQ([a.code, a.title].filter(Boolean).join(' — ')); setActivityDropdownOpen(false); void chooseActivity(a) }} className={'act-item' + (code === a.code ? ' on' : '')}><span className="act-code">{a.code}</span><span className="act-body">{a.main_activity && <span className="act-main">{a.main_activity}</span>}<span className="act-title">{a.title}</span></span><span className="act-uom">{a.minutes} นาที/{a.uom}</span></button> )}
          {!list.length && <p className="p-4 text-sm text-slate-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหาหรือสิทธิ์ของตำแหน่งนี้</p>}
          <div className="border-t border-slate-100 p-2 text-xs text-slate-500">{list.length} รายการ · คลิกกิจกรรมเพื่อเลือก</div>
        </div>}
      </div></div>
      {act && <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm"><b className="text-teal-900">เลือกแล้ว: {act.code} {[act.main_activity, act.title].filter(Boolean).join(' › ')}</b><p className="mt-1 text-xs text-teal-900">กดรายการกิจกรรมเพื่อเปิดแบบฟอร์มกรอกข้อมูล</p></div>}
      {duplicateOpen && act && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="duplicate-activity-title"><div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">ตรวจพบรายการซ้ำ</p><h2 id="duplicate-activity-title" className="text-lg font-bold text-slate-900">กิจกรรมนี้บันทึกไปแล้ว</h2><p className="mt-1 text-sm text-slate-700">{act.code} {act.title}</p><p className="mt-1 text-sm font-semibold text-amber-800">รายการนี้บันทึกไปแล้วจำนวน {duplicateRows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)} {act.uom || 'หน่วย'} ในวันที่ {formatThaiShortDate(date)}</p></div><button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setDuplicateOpen(false)}>ปิด</button></div>
        <p className="text-sm text-slate-700">ระบบไม่อนุญาตให้แก้ไขรายการที่รับรองแล้ว หากจำเป็นต้องเพิ่มจำนวน ให้สร้างคำขอเพิ่มแยกต่างหากและส่งรับรองตามลำดับเดิม</p>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-left">วันที่</th><th className="text-left">กิจกรรม</th><th className="text-right">จำนวน</th><th className="text-left">สถานะ</th><th className="text-left">หลักฐาน</th><th>ดำเนินการ</th></tr></thead><tbody>
          {duplicateRows.map((row: any) => <tr key={row.id} className="border-t"><td className="whitespace-nowrap">{formatThaiShortDate(row.work_date)}</td><td><b>{row.activity_code}</b> {act.title}{row.parent_log_id && <div className="text-xs font-semibold text-amber-800">คำขอเพิ่มจำนวน · อ้างอิงรายการ #{row.parent_log_id}</div>}{row.supplemental_reason && <div className="text-xs text-amber-800">เหตุผล: {row.supplemental_reason}</div>}{row.sub_activity && <div className="text-xs text-slate-500">{row.sub_activity}</div>}</td><td className="text-right whitespace-nowrap">{row.qty} {act.uom || 'หน่วย'}</td><td>{ST[row.status]?.[0] || row.status || 'ไม่ระบุ'}</td><td>{row.evidence || row.evidence_image_path ? <span className="text-teal-800">มีหลักฐาน{row.evidence_image_path ? ' / รูปภาพ' : ''}</span> : <span className="text-slate-500">ไม่มี</span>}</td><td className="text-center whitespace-nowrap">{row.status === 'pending' ? <button type="button" className="btn sec !py-1" onClick={() => { setDuplicateOpen(false); setEditTargetRow(row) }}>เข้าแก้ไขรายการ</button> : row.status === 'approved' ? <button type="button" className="btn !py-1" onClick={() => { setSupplementalTarget(row); setSupplementalReason(''); setQty('1'); setEv(''); setSubActivity(''); setEvidenceFile(null); setErr(''); setDuplicateOpen(false); setModalOpen(true) }}>ขอเพิ่มจำนวน</button> : <span className="text-xs text-slate-500">{row.status === 'rejected' ? 'ไม่รับรอง · ตรวจเหตุผลก่อนส่งใหม่' : 'รายการฉบับร่าง'}</span>}</td></tr>)}
        </tbody></table></div>
        <div className="flex justify-end"><button type="button" className="btn sec" onClick={() => setDuplicateOpen(false)}>กลับ</button></div>
      </div></div>}
      {modalOpen && act && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4"><div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{supplementalTarget ? 'คำขอเพิ่มจำนวนกิจกรรม' : 'บันทึกกิจกรรม P4P'}</p><h2 id="activity-modal-title" className="text-lg font-bold text-slate-900">{supplementalTarget ? 'ขอเพิ่มจำนวน · ' : ''}{act.code} {act.title}</h2><p className="mt-1 text-xs text-slate-600">{act.minutes} นาที/{act.uom}{act.max_day ? ` · สูงสุด ${act.max_day}/วัน` : ''}{act.max_month ? ` · ${act.max_month}/เดือน` : ''}</p><p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900"><span aria-hidden="true">📅</span> วันที่บันทึก: {formatThaiShortDate(date)}</p></div><button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setModalOpen(false); setErr('') }}>ปิด</button></div>
      {supplementalTarget && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2"><p className="font-bold text-amber-900">รายการต้นฉบับที่รับรองแล้ว</p><p className="text-sm text-amber-900">จำนวนเดิม {supplementalTarget.qty} {act.uom || 'หน่วย'} · {formatThaiShortDate(supplementalTarget.work_date)} · เวร{shift}</p><p className="text-xs text-amber-900">คำขอนี้จะเป็นรายการแยก ไม่แก้ไขจำนวนหรือหลักฐานของรายการต้นฉบับ และจะยังไม่นับคะแนนจนกว่าจะรับรองครบตามลำดับ</p></div>}
      {act.need_evidence ? <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3"><p className="font-bold text-amber-900">หลักฐานที่ต้องใช้สำหรับกิจกรรมนี้ (จำเป็น)</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{act.definition?.trim() || 'กรุณาตรวจสอบแนวทาง/เกณฑ์ P4P ของกิจกรรมนี้ และระบุหลักฐานอ้างอิงที่ตรวจสอบได้ก่อนบันทึก'}</p><p className="mt-2 text-xs text-amber-900">ต้องกรอกคำอธิบายหลักฐาน หรือแนบรูปถ่ายอย่างน้อย 1 อย่าง</p></div> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-slate-800">หลักฐานประกอบ</p><p className="text-sm text-slate-700">{act.definition?.trim() || 'หากมีเอกสารอ้างอิงหรือรูปถ่ายประกอบ สามารถระบุเพิ่มเติมได้'}</p></div>}
      
      <div className="space-y-1"><label className="field-label">จำนวน <span className="uom-chip">หน่วยนับ: {act.uom}</span></label><div className="qty-wrap"><input type="number" min="0" step="0.5" className="inp" value={qty} onChange={e => setQty(e.target.value)} placeholder="ระบุจำนวน" /><span className="qty-unit">{act.uom}</span></div></div>
      {supplementalTarget && <div className="space-y-1"><label className="field-label">เหตุผลที่ขอเพิ่มจำนวน <span className="required-mark">*</span></label><textarea className="inp min-h-20" required value={supplementalReason} onChange={e => setSupplementalReason(e.target.value)} placeholder="อธิบายความจำเป็นที่ต้องเพิ่มจำนวนจากรายการที่รับรองแล้ว" /><p className="field-hint">ระบุอย่างน้อย 5 ตัวอักษร เพื่อให้ผู้รับรองพิจารณาได้</p></div>}
      <div className="space-y-1"><label className="field-label">กิจกรรมย่อย / รายละเอียดการดำเนินงาน <span className="required-mark">*</span></label><textarea required aria-required="true" className="inp min-h-24" placeholder="จำเป็นต้องกรอก: ระบุชื่องานย่อย รายละเอียดสิ่งที่ทำ ผลลัพธ์ หรือขอบเขตงาน" value={subActivity} onChange={e => { setSubActivity(e.target.value); if (e.target.value.trim()) setErr('') }} /></div>
      <div className="space-y-1"><label className="field-label">รายละเอียดหลักฐาน {act.need_evidence && <span className="text-red-700">* จำเป็น</span>}</label><textarea className="inp min-h-24" placeholder={act.need_evidence ? 'ระบุหลักฐานตามรายการที่แสดงด้านบน เช่น เลขที่เอกสาร วันที่ ผู้รับรอง หรือชื่อเอกสาร' : 'ระบุเอกสารอ้างอิงหรือคำอธิบายหลักฐาน (ถ้ามี)'} value={ev} onChange={e => setEv(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">แนบรูปถ่ายหลักฐาน {act.need_evidence && <span className="text-slate-600">(หรือกรอกรายละเอียดหลักฐานด้านบน)</span>}</label><input className="inp" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0] || null; if (f && (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) { setErr('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); e.target.value = ''; setEvidenceFile(null); return } setErr(''); setEvidenceFile(f) }} /><p className="field-hint">แนบรูปถ่ายได้ 1 รูปต่อรายการ ขนาดไม่เกิน 5 MB</p>{evidenceFile && <p className="text-xs text-teal-800">ไฟล์ที่เลือก: {evidenceFile.name}</p>}</div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">แต้มโดยประมาณ: <b>{nf(prev)}</b>{prev > room && <span className="text-amber-800"> · {shiftName} นับได้ไม่เกิน {nf(room)} คะแนน (ส่วนที่เกินเพดานไม่นับ)</span>}</div>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn sec" disabled={savingActivity} onClick={() => { setModalOpen(false); setErr('') }}>ยกเลิก</button><button type="button" className="btn save-draft-btn" disabled={savingActivity || !pid || !code || !+qty} onClick={() => save(false)}>{savingActivity ? 'กำลังบันทึก…' : supplementalTarget ? 'บันทึกคำขอเพิ่มจำนวน' : 'บันทึก'}</button>{canApproveImmediately && !supplementalTarget && <button type="button" className="btn approve-now-btn" disabled={savingActivity || !pid || !code || !+qty} onClick={() => save(true)}>{savingActivity ? 'กำลังบันทึก…' : 'บันทึกและรับรอง'}</button>}</div></div></div>}
    </div>
    <div className="space-y-3">
      {notice && <p role="status" className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
      {myRejected.length > 0 && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><b>มี {myRejected.length} รายการที่หัวหน้าไม่รับรอง</b> ดูเหตุผลในตาราง แล้วกด "แก้ไข" หรือ "ส่งใหม่"</p>}
      <div id="saved-activity-table" className="scroll-mt-6"><LogTable sb={sb} rows={shown} reload={reload} canApprove={canApprove} showName={!pid && people.length > 1} acts={acts} month={month} setMonth={setMonth} editTargetRow={editTargetRow} clearEditTarget={() => setEditTargetRow(null)} /></div>
    </div>
  </div>
}

const DOMAINS = ['บริหาร', 'บริการ', 'วิชาการ']
const n2 = (v: any) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
const statusLabel = (st: any) => {
  const parts = [['approved', 'รับรองแล้ว'], ['pending', 'รอรับรอง'], ['rejected', 'ไม่รับรอง']].filter(([k]) => st[k] > 0)
  const total = st.approved + st.pending + st.rejected
  return parts.length === 1 ? parts[0][1] : parts.map(([k, l]) => `${l} ${st[k]}/${total}`).join(' · ')
}
// ใบสรุปผลงาน P4P รายบุคคล (A4) แสดงเป็นหน้าตัวอย่างก่อนพิมพ์ ผ่าน portal เพื่อให้สั่งพิมพ์เฉพาะใบนี้
function PrintSheet({ sb, person, rows: rowsIn, month, units, positions, onClose, autoPrint = false, leaveDataOverride = null }: any) {
  const rows = useMemo(() => (rowsIn || []).filter((r: any) => r.status === 'approved'), [rowsIn])
  const [head, setHead] = useState<any>(null)
  const [headLoaded, setHeadLoaded] = useState(false)
  const [leaveData, setLeaveData] = useState<any>({ personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 })
  const [leaveLoaded, setLeaveLoaded] = useState(false)
  useEffect(() => {
    const afterPrint = () => { document.body.classList.remove('print-individual-report'); onClose?.() }
    window.addEventListener('afterprint', afterPrint)
    return () => window.removeEventListener('afterprint', afterPrint)
  }, [onClose])
  useEffect(() => {
    let alive = true
    const staffId = person.staff_directory_id ?? person.directory_source_row
    setLeaveLoaded(false)
    if (leaveDataOverride != null) { setLeaveData(leaveDataOverride); setLeaveLoaded(true); return () => { alive = false } }
    if (!staffId) { setLeaveData({ personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }); setLeaveLoaded(true); return () => { alive = false } }
    sb.from('p4p_monthly_leave').select('personal_leave_days,sick_leave_days,annual_leave_days')
      .eq('staff_directory_id', staffId).eq('month', month + '-01').maybeSingle()
      .then(({ data, error }: any) => { if (alive) { setLeaveData(!error && data ? data : { personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }); setLeaveLoaded(true) } }).catch(() => { if (alive) { setLeaveData({ personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }); setLeaveLoaded(true) } })
    return () => { alive = false }
  }, [sb, person.staff_directory_id, person.directory_source_row, month, leaveDataOverride])
  useEffect(() => {
    let alive = true
    sb.rpc('approver_print_details_of', { p_person: person.id }).then(({ data, error }: any) => {
      if (!alive) return
      if (error) { console.error('โหลดข้อมูลหัวหน้าผู้รับรองไม่สำเร็จ:', error); setHead(null); setHeadLoaded(true); return }
      const h = data?.[0]
      if (!h?.approver_name) { setHead(null); setHeadLoaded(true); return }
      const role = String(h.approver_org_role || '').trim()
      const unitName = String(h.approver_unit_name || '').trim()
      const groupName = String(h.approver_nursing_group || '').trim()
      const normalizedRole = role.replace(/\\s+/g, '')
      const managerial = role.includes('หัวหน้ากลุ่มงาน')
        ? (groupName ? 'หัวหน้า' + groupName : role)
        : role.includes('หัวหน้างาน')
          ? (unitName && !role.includes(unitName) ? 'หัวหน้างาน' + unitName.replace(/^งาน/, '') : role)
          : role
      setHead({ name: h.approver_name, professional: h.approver_professional_position || '', managerial, label: role.includes('หัวหน้ากลุ่มงาน') ? 'หัวหน้ากลุ่มงาน' : role.includes('หัวหน้างาน') ? 'หัวหน้างาน' : 'หัวหน้าพยาบาล/รักษาการหัวหน้าพยาบาล' })
      setHeadLoaded(true)
    })
    return () => { alive = false }
  }, [sb, person.id])
  useEffect(() => {
    if (!autoPrint || !headLoaded || !leaveLoaded) return
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.body.classList.add('print-individual-report')
      window.print()
    }))
    return () => window.cancelAnimationFrame(frame)
  }, [autoPrint, headLoaded, leaveLoaded])
  const unit = units.find((u: any) => Number(u.id) === Number(person.unit_id))
  const monthStart = new Date(month + '-01T00:00:00')
  const dayCount = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const monthText = monthStart.toLocaleDateString('th-TH', { month: 'long' })
  const buddhistYear = monthStart.getFullYear() + 543
  const groupName = String(person.nursing_group || person.group_name || person.staff_group || '').trim() || String(unit?.parent_group || '').trim()
  const unitName = unit?.name || person.unit_name || person.sub_unit || ''
  const groups = useMemo(() => {
    const map = new Map<string, any>()
    rows.forEach((r: any) => {
      const key = String(r.activity_code || '')
      const item = map.get(key) || { code: key, title: r.title || key, uom: r.uom || '', minutes: Number(r.minutes || 0), rate: Number(r.rate || 0), days: {}, qty: 0, points: 0 }
      const day = Number(String(r.work_date || '').slice(8, 10))
      if (day >= 1 && day <= 31) item.days[day] = (item.days[day] || 0) + Number(r.qty || 0)
      item.qty += Number(r.qty || 0)
      item.points += Number(r.counted_points || 0)
      map.set(key, item)
    })
    const order: Record<string, number> = { บริหาร: 0, บริการ: 1, วิชาการ: 2 }
    return [...map.values()].sort((a, b) => {
      const ar = rows.find((r: any) => r.activity_code === a.code)
      const br = rows.find((r: any) => r.activity_code === b.code)
      return (order[ar?.domain] ?? 9) - (order[br?.domain] ?? 9) || a.code.localeCompare(b.code, 'th')
    })
  }, [rows])
  const startPrint = () => {
    document.body.classList.add('print-individual-report')
    // เรียกจากการคลิกปุ่มโดยตรง เพื่อให้เบราว์เซอร์เปิด print dialog ได้แน่นอน
    window.print()
  }
  return createPortal(<div className="print-overlay">
    <div className="print-toolbar no-print">
      <span className="text-sm text-stone-600 mr-auto self-center">ตัวอย่างเอกสาร A4 แนวนอน · แสดงเฉพาะรายการที่ผ่านการรับรอง</span>
      <button className="btn" disabled={!leaveLoaded} onClick={startPrint}><Printer size={16} className="inline mr-1 -mt-0.5" />{leaveLoaded ? "พิมพ์" : "กำลังโหลดข้อมูล…"}</button>
      <button className="btn sec" onClick={onClose}>ปิด</button>
    </div>
    <div className="print-sheet ps-individual-landscape">
      <table className="pt ps-individual-table">
        <colgroup>
          <col style={{ width: '5mm' }} />
          <col style={{ width: '38mm' }} />
          <col style={{ width: '8mm' }} />
          <col style={{ width: '7mm' }} />
          <col style={{ width: '7mm' }} />
          <col style={{ width: '6mm' }} />
          <col style={{ width: '7mm' }} />
          {Array.from({ length: dayCount }, (_, i) => <col key={i} style={{ width: `calc((100% - 105mm) / ${dayCount})` }} />)}
          <col style={{ width: '9mm' }} />
          <col style={{ width: '9mm' }} />
          <col style={{ width: '9mm' }} />
        </colgroup>
        <thead>
          <tr className="ps-repeat-heading"><th colSpan={dayCount + 10}><h1 className="ps-title">แบบบันทึกคะแนนผลการปฏิบัติงานรายบุคคล โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</h1></th></tr>
          <tr className="ps-repeat-meta"><th colSpan={dayCount + 10}><div className="ps-meta"><div>{groupName || '................................'} &nbsp;&nbsp; {unitName || '................................'} &nbsp;&nbsp; ประจำเดือน {monthText} พ.ศ. {buddhistYear}</div><div className="ps-person-meta"><span>ชื่อ-สกุล {person.name || '................................'}</span> &nbsp;&nbsp; <span>ตำแหน่ง {person.position || '................................'}</span> &nbsp;&nbsp; <span>ระดับการบริหาร {String(person.org_role || '').includes('หัวหน้ากลุ่มงาน') ? 'หัวหน้ากลุ่มงาน' : String(person.org_role || '').includes('หัวหน้างาน') ? 'หัวหน้างาน' : '—'}</span></div></div></th></tr>
          <tr className="ps-repeat-leave"><th colSpan={dayCount + 10}><div className="ps-leave-row">ลากิจ = {Number(leaveData.personal_leave_days || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} วัน &nbsp;&nbsp; ลาป่วย = {Number(leaveData.sick_leave_days || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} วัน &nbsp;&nbsp; ลาพักผ่อน = {Number(leaveData.annual_leave_days || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} วัน</div></th></tr>
          <tr>
          <th rowSpan={2}>ลำดับ</th><th rowSpan={2}>กิจกรรม</th><th rowSpan={2}>หน่วยนับ</th><th rowSpan={2}>เวลา<br/>(นาที)</th><th rowSpan={2}>คะแนน/<br/>นาที</th><th rowSpan={2}>ค่างาน</th><th rowSpan={2}>คะแนน<br/>ปรับ</th><th colSpan={dayCount}>วันที่</th><th rowSpan={2}>รวม<br/>หน่วย</th><th rowSpan={2}>รวม<br/>แต้ม</th><th rowSpan={2}>แหล่ง<br/>อ้างอิง</th>
          </tr><tr>{Array.from({length:dayCount},(_,i)=><th key={i} className="ps-day-cell">{i+1}</th>)}</tr>
        </thead>
        <tbody>
          {groups.map((g: any,i: number)=><tr key={g.code}>
            <td className="c">{i+1}</td><td className="ps-activity-name">{g.title}</td><td className="c">{g.uom || '—'}</td><td className="r">{nf(g.minutes,0)}</td><td className="r">{nf(g.rate,3)}</td><td className="r">1</td><td className="r">{nf(g.minutes*g.rate)}</td>
            {Array.from({length:dayCount},(_,d)=><td key={d} className="r ps-day-cell">{g.days[d+1] ? n2(g.days[d+1]) : ''}</td>)}
            <td className="r">{n2(g.qty)}</td><td className="r">{nf(g.points)}</td><td></td>
          </tr>)}
          {!groups.length && <tr><td colSpan={dayCount+10} className="c">ไม่มีรายการกิจกรรมที่ผ่านการรับรองในเดือนนี้</td></tr>}
          {groups.length>0 && <tr className="b"><td colSpan={dayCount+7} className="r">รวมทั้งหมด</td><td className="r">{n2(groups.reduce((v,g)=>v+g.qty,0))}</td><td className="r">{nf(groups.reduce((v,g)=>v+g.points,0))}</td><td></td></tr>}
        </tbody>
      </table>
      <div className="ps-certification">ขอรับรองว่าผู้มีรายนามข้างต้นได้ปฏิบัติงานจริง</div>
      <div className="ps-single-sign">
        <div>ลงชื่อ ........................................................</div>
        <div className="ps-sign-name">({head?.name || '................................................'})</div>
        <div>{head?.professional || '................................................'}</div>
        <div>{head?.managerial || head?.label || 'หัวหน้าผู้รับรอง'}</div>
      </div>
    </div>
  </div>, document.body)
}

function guaranteeForPosition(position: any, positions: any[] = [], orgRole?: any) {
  const name = String(position || '').replace(/\s+/g, '').trim()
  return Number(positions.find((x: any) => String(x.name || '').replace(/\s+/g, '').trim() === name)?.guarantee || 0)
}
function roleGuaranteeForPosition(position: any, positions: any[] = [], orgRole?: any) {
  const name = String(position || '').replace(/\s+/g, '').trim()
  const pos = positions.find((x: any) => String(x.name || '').replace(/\s+/g, '').trim() === name)
  if (Number(pos?.pay_group || 0) !== 1 && !name.includes('พยาบาลวิชาชีพ')) return 0
  const role = String(orgRole || '').replace(/\s+/g, '').trim()
  if (role.includes('หัวหน้ากลุ่มงาน') || name.includes('หัวหน้ากลุ่มงาน')) return 240
  if (role.includes('หัวหน้างาน') || name.includes('หัวหน้าหอผู้ป่วย') || name.includes('หัวหน้างาน')) return 120
  return 0
}
function scoreBreakdown(position: any, positions: any[] = [], orgRole?: any, activityPoints = 0) {
  const insurance = guaranteeForPosition(position, positions, orgRole)
  const roleGuarantee = roleGuaranteeForPosition(position, positions, orgRole)
  const performance = Number(activityPoints || 0) + roleGuarantee
  return { insurance, roleGuarantee, performance, excess: Math.min(Math.max(0, performance - insurance), insurance * 0.5) }
}

function ActivitySummary({ sb, rows, person, positions, month, units }: any) {
  const [unitRate, setUnitRate] = useState(0)
  const [payGroups, setPayGroups] = useState<any[]>([])
  useEffect(() => {
    let alive = true
    sb.from('pay_groups').select('id,name,full_amount,fixed_pay,guarantee,rate,reserve_pct').order('id')
      .then(({ data, error }: any) => { if (alive) setPayGroups(!error && Array.isArray(data) ? data : []) })
    return () => { alive = false }
  }, [sb])
  useEffect(() => {
    let alive = true
    if (!person?.unit_id) { setUnitRate(0); return }
    sb.from('unit_settings').select('baht_per_point').eq('unit_id', person.unit_id).eq('month', month + '-01').maybeSingle().then(({ data, error }: any) => {
      if (alive) setUnitRate(!error && data ? Number(data.baht_per_point || 0) : 0)
    })
    return () => { alive = false }
  }, [sb, person?.unit_id, month])
  if (!person) return null
  const position = (positions || []).find((x: any) => String(x.name || '').trim() === String(person.position || '').trim())
  const payGroupId = Number(position?.pay_group || 0)
  const payGroup = payGroups.find((g: any) => Number(g.id) === payGroupId)
  const allocation = Number(payGroup?.full_amount || 0)
  const guarantee = guaranteeForPosition(person.position, positions, person.org_role)
  const roleGuarantee = roleGuaranteeForPosition(person.position, positions, person.org_role)
  // แต้มปฏิบัติงานที่ได้ = รายการที่ส่งแล้วและยังรอรับรองหรือรับรองแล้ว
  // แต้มที่ยืนยัน = เฉพาะรายการที่หัวหน้ารับรองแล้ว
  const earned = (rows || []).filter((r: any) => r.status === 'pending' || r.status === 'approved').reduce((sum: number, r: any) => sum + Number(r.counted_points || 0), 0)
  const confirmed = (rows || []).filter((r: any) => r.status === 'approved').reduce((sum: number, r: any) => sum + Number(r.counted_points || 0), 0)
  const scoring = scoreBreakdown(person.position, positions, person.org_role, confirmed)
  const performanceTotal = scoring.performance
  const difference = performanceTotal - guarantee
  const basePercent = performanceTotal >= guarantee ? 0.97 : 0.77
  const basePay = allocation > 0 ? allocation * basePercent : 0
  const extraPay = scoring.excess * unitRate
  const payout = basePay + extraPay
  const cards = [
    { label: 'แต้มประกัน', value: nf(guarantee), color: 'text-slate-900' },
    { label: 'แต้มการันตี', value: nf(roleGuarantee), color: 'text-slate-900' },
    { label: 'แต้มผลงานรวม', value: nf(performanceTotal), color: 'text-slate-900' },
    { label: 'แต้มปฏิบัติงานที่ได้', value: nf(earned), color: 'text-slate-900' },
    { label: 'แต้มที่ยืนยัน', value: nf(confirmed), color: 'text-emerald-700' },
    { label: 'แต้มส่วนต่าง', value: (difference > 0 ? '+' : '') + nf(difference), color: difference > 0 ? 'text-green-700' : difference < 0 ? 'text-red-700' : 'text-slate-700' },
    { label: 'ประมาณเงินที่ได้', value: allocation > 0 ? nf(payout) + ' บาท' : 'รอตั้งค่ากลุ่มวิชาชีพ', color: 'text-slate-900' }
  ]
  return <div className="space-y-1" aria-label="สรุปแต้มและประมาณเงินประจำเดือน">
    <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
      {cards.map((item) => <div key={item.label} className="card !p-3 sm:!p-4 min-w-0"><div className="text-xs sm:text-sm text-stone-600">{item.label}</div><div className={'mt-1 text-xl sm:text-2xl font-bold tabular-nums ' + item.color}>{item.value}</div>
        {item.label === 'ประมาณเงินที่ได้' && <div className="mt-1 text-xs text-stone-500">{allocation > 0 ? <>เงินพื้นฐาน {nf(basePay)} บาท ({Math.round(basePercent * 100)}% ของยอดจัดสรร {nf(allocation)} บาท) + เงินเพิ่ม {nf(extraPay)} บาท{!position?.pay_group && <span className="block text-amber-700">ไม่พบการจับคู่กลุ่มวิชาชีพของตำแหน่งนี้</span>}</> : 'ไม่พบยอดจัดสรรของกลุ่มวิชาชีพ กรุณาตรวจสอบการจับคู่ตำแหน่ง'}</div>}
      </div>)}
    </div>
    <p className="px-1 text-xs leading-relaxed text-stone-600">หมายเหตุ: ประมาณการจากค่าคะแนนและยอดจัดสรรตามกลุ่มวิชาชีพที่มีการบันทึกข้อมูลในปัจจุบัน</p>
  </div>
}

function Totals({ rows, people, positions }: any) {
  if (people.length !== 1) return null
  const g = guaranteeForPosition(people[0].position, positions, people[0].org_role)
  const rg = roleGuaranteeForPosition(people[0].position, positions, people[0].org_role)
  const t = rows.reduce((s: number, r: any) => s + Number(r.counted_points), 0)
  const score = scoreBreakdown(people[0].position, positions, people[0].org_role, t)
  return <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
    {[['แต้มกิจกรรมเดือนนี้', t], ['แต้มประกัน', g], ['แต้มการันตี', rg], ['แต้มผลงานรวม', score.performance], ['แต้มส่วนเกิน (สูงสุด 600)', score.excess]].map(([l, v]: any) => <div key={l} className="card"><div className="text-xs text-stone-600">{l}</div><div className="text-2xl font-bold">{nf(v)}</div></div>)}
  </div>
}

const ST: any = { draft: ['แบบร่าง ยังไม่ส่ง', 'bg-stone-200'], pending: ['ส่งแล้ว รอรับรอง', 'bg-amber-100'], approved: ['รับรองแล้ว', 'bg-emerald-100'], rejected: ['ไม่รับรอง', 'bg-red-100'] }
async function openEvidence(sb: any, path: string) { const tab = window.open('about:blank', '_blank'); if (!tab) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง'); return } const { data, error } = await sb.storage.from('p4p-evidence').createSignedUrl(path, 300); if (error || !data?.signedUrl) { tab.close(); alert('เปิดรูปหลักฐานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือการตั้งค่า Storage'); return } tab.location.href = data.signedUrl }

function LogTable({ sb, rows: allRows, reload, canApprove, showName = true, readOnly = false, acts = [], month, setMonth, editTargetRow = null, clearEditTarget = () => {} }: any) {
  const me = useContext(MeCtx); const ap = useContext(ApproverCtx)
  // แบบร่างเป็นของผู้บันทึกเท่านั้น คนอื่น (รวมหัวหน้า) ไม่เห็นจนกว่าจะส่ง
  const rows = useMemo(() => (allRows || []).filter((r: any) => r.status !== 'draft' || r.entered_by === me), [allRows, me])
  const [rejecting, setRejecting] = useState<any>(null); const [reason, setReason] = useState('')
  const submitRows = async (ids: number[]) => {
    if (!ids.length) return
    const { error } = await sb.from('logs').update({ status: 'pending' }).in('id', ids)
    if (error) { alert('ส่งรายการไม่สำเร็จ: ' + error.message); return }
    reload()
  }
  const confirmReject = async () => {
    if (!reason.trim()) { alert('กรุณาระบุเหตุผลที่ไม่รับรอง เพื่อแจ้งผู้บันทึก'); return }
    const { error } = await sb.from('logs').update({ status: 'rejected', reject_reason: reason.trim() }).eq('id', rejecting.id)
    if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return }
    setRejecting(null); setReason(''); reload()
  }
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editEvidenceFile, setEditEvidenceFile] = useState<File | null>(null)
  const [editActivityQuery, setEditActivityQuery] = useState('')
  const [editActivityDropdownOpen, setEditActivityDropdownOpen] = useState(false)
  
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<number[]>([])
  const [bulkApproving, setBulkApproving] = useState(false)
  const sortedRows = useMemo(() => [...(rows || [])].sort((a: any, b: any) => {
    // เรียงตามวันที่ปฏิบัติงานล่าสุดก่อน ไม่ใช่เวลาที่กดบันทึก
    const dateOrder = String(b.work_date || '').localeCompare(String(a.work_date || ''))
    if (dateOrder !== 0) return dateOrder
    // หากเป็นวันเดียวกัน ให้รายการที่บันทึกล่าสุดอยู่ก่อน
    const at = a.created_at ? new Date(a.created_at).getTime() : 0
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0
    if (at !== bt) return bt - at
    const ai = Number(a.id) || 0; const bi = Number(b.id) || 0
    return bi - ai
  }), [rows])
  const displayedRows = useMemo(() => sortedRows.filter((r: any) => (!filterFrom || String(r.work_date || '') >= filterFrom) && (!filterTo || String(r.work_date || '') <= filterTo)), [sortedRows, filterFrom, filterTo])
  const approvableDisplayedRows = useMemo(() => displayedRows.filter((r: any) => r.status === 'pending' && canDecideRow(ap, me, r)), [displayedRows, ap, me])
  const selectedApprovableIds = useMemo(() => selectedApprovalIds.filter(id => approvableDisplayedRows.some((r: any) => Number(r.id) === Number(id))), [selectedApprovalIds, approvableDisplayedRows])
  const allApprovableSelected = approvableDisplayedRows.length > 0 && approvableDisplayedRows.every((r: any) => selectedApprovableIds.includes(Number(r.id)))
  const toggleApprovalSelection = (id: number, checked: boolean) => setSelectedApprovalIds(current => checked ? [...new Set([...current, Number(id)])] : current.filter(x => Number(x) !== Number(id)))
  const toggleAllApprovals = (checked: boolean) => setSelectedApprovalIds(current => checked ? [...new Set([...current, ...approvableDisplayedRows.map((r: any) => Number(r.id))])] : current.filter(id => !approvableDisplayedRows.some((r: any) => Number(r.id) === Number(id))))
  const approveSelected = async () => {
    const ids = selectedApprovableIds
    if (!ids.length || bulkApproving) return
    if (!confirm('ยืนยันรับรองกิจกรรมที่เลือกจำนวน ' + ids.length.toLocaleString('th-TH') + ' รายการ?')) return
    setBulkApproving(true)
    const result = await sb.from('logs').update({ status: 'approved' }).in('id', ids).eq('status', 'pending')
    setBulkApproving(false)
    if (result.error) { alert('รับรองรายการที่เลือกไม่สำเร็จ: ' + result.error.message); return }
    setSelectedApprovalIds(current => current.filter(id => !ids.includes(Number(id))))
    reload()
    alert('รับรองรายการเรียบร้อยแล้ว ' + ids.length.toLocaleString('th-TH') + ' รายการ')
  }
  const selectedEditActivity = (acts || []).find((a: any) => a.code === form.activity_code)
  const editPointsPerUnit = selectedEditActivity && editing ? Number(selectedEditActivity.minutes || 0) * Number(editing.rate || 0) : 0
  const editPointsTotal = editPointsPerUnit * Number(form.qty || 0)
  const editActivityTerms = editActivityQuery.toLowerCase().split(/\s+/).filter(Boolean)
  const editActivityOptions = (acts || []).filter((a: any) => a.active !== false && editActivityTerms.every((term: string) => [a.code, a.main_activity, a.title].join(' ').toLowerCase().includes(term))).sort((a: any, b: any) => String(a.code).localeCompare(String(b.code), 'th'))
  useEffect(() => { if (!editTargetRow) return; if (editTargetRow.status === 'pending') beginEdit(editTargetRow); else alert('รายการนี้รับรองแล้ว จึงไม่สามารถแก้ไขได้'); clearEditTarget() }, [editTargetRow, clearEditTarget])
  const beginEdit = (r: any) => {
    setEditing(r)
    setForm({ work_date: r.work_date || '', activity_code: r.activity_code || '', qty: String(r.qty ?? 1), role: r.role || '', evidence: r.evidence || '', sub_activity: r.sub_activity || '', shift: r.shift || 'เช้า' })
    setEditActivityQuery('')
    setEditActivityDropdownOpen(false)
    setEditEvidenceFile(null)
    setEditError('')
  }
  const set = async (id: number, status: string) => {
    const { error } = await sb.from('logs').update({ status }).eq('id', id)
    if (error) { alert('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message); return }
    reload()
  }
  const del = async (id: number) => { if (confirm('ลบรายการนี้?')) { const { error } = await sb.from('logs').delete().eq('id', id); if (error) alert('ลบรายการไม่สำเร็จ: ' + error.message); else reload() } }
  const saveEdit = async () => {
    setEditError('')
    if (!form.work_date || !form.activity_code || !form.qty || Number(form.qty) <= 0) { setEditError('กรุณาระบุวันที่ กิจกรรม และจำนวนให้ถูกต้อง'); return }
    if (!String(form.sub_activity || '').trim()) { setEditError('กรุณากรอกกิจกรรมย่อย / รายละเอียดการดำเนินงานก่อนบันทึก'); return }
    const activity = acts.find((a: any) => a.code === form.activity_code)
    if (!activity) { setEditError('ไม่พบกิจกรรมที่เลือกในคลังกิจกรรม'); return }
    if (activity.need_evidence && !String(form.evidence || '').trim() && !editing.evidence_image_path && !editEvidenceFile) { setEditError('กิจกรรมนี้ต้องมีหลักฐาน กรุณาระบุรายละเอียดหลักฐานหรือแนบรูปถ่าย'); return }
    if (editEvidenceFile && (!editEvidenceFile.type.startsWith('image/') || editEvidenceFile.size > 5 * 1024 * 1024)) { setEditError('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); return }
    setSaving(true)
    const payload = {
      work_date: form.work_date,
      activity_code: form.activity_code,
      qty: Number(form.qty),
      shift: form.shift || 'เช้า',
      role: null,
      evidence: String(form.evidence || '').trim() || ((editEvidenceFile || editing.evidence_image_path) ? 'แนบรูปถ่าย' : null),
      sub_activity: String(form.sub_activity || '').trim() || null
    }
    const { data: updatedRow, error } = await sb.from('logs').update(payload).eq('id', editing.id).eq('status', editing.status).select('id,work_date,activity_code,qty').maybeSingle()
    if (error) { setSaving(false); setEditError('บันทึกการแก้ไขไม่สำเร็จ: ' + error.message); return }
    if (!updatedRow) { setSaving(false); setEditError('ระบบไม่พบรายการที่แก้ไขได้ อาจมีการรับรองรายการไปแล้ว กรุณาปิดหน้าต่างแล้วโหลดรายการใหม่'); return }
    if (editEvidenceFile) {
      const safeName = editEvidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = editing.person_id + '/' + editing.id + '/' + crypto.randomUUID() + '-' + safeName
      const { error: uploadError } = await sb.storage.from('p4p-evidence').upload(path, editEvidenceFile, { contentType: editEvidenceFile.type, upsert: false })
      if (uploadError) { setSaving(false); setEditError('บันทึกข้อความแล้ว แต่แนบรูปไม่สำเร็จ: ' + uploadError.message); reload(); return }
      const { error: pathError } = await sb.from('logs').update({ evidence_image_path: path }).eq('id', editing.id).eq('status', editing.status)
      if (pathError) { setSaving(false); setEditError('อัปโหลดรูปแล้ว แต่เชื่อมโยงรูปกับรายการไม่สำเร็จ: ' + pathError.message); reload(); return }
    }
    setSaving(false)
    setEditing(null)
    setEditEvidenceFile(null)
    // Keep the edited row visible even when its date moves to another month.
    const savedMonth = String(updatedRow.work_date || form.work_date).slice(0, 7)
    if (savedMonth && savedMonth !== month && typeof setMonth === 'function') setMonth(savedMonth)
    setFilterFrom(''); setFilterTo('')
    reload()
    alert('บันทึกการแก้ไขเรียบร้อยแล้ว รายการและวันที่ล่าสุดได้รับการปรับปรุง')
  }
  return <div className="card overflow-x-auto p-0">
    <div className="flex flex-wrap items-end gap-3 border-b border-stone-200 p-3">
      <div><label className="field-label" htmlFor="log-filter-from">วันที่ตั้งแต่</label><input id="log-filter-from" type="date" lang="th-TH" className="inp mt-1 !w-auto" value={filterFrom} max={filterTo || undefined} onChange={e => setFilterFrom(e.target.value)} /></div>
      <div><label className="field-label" htmlFor="log-filter-to">ถึงวันที่</label><input id="log-filter-to" type="date" lang="th-TH" className="inp mt-1 !w-auto" value={filterTo} min={filterFrom || undefined} onChange={e => setFilterTo(e.target.value)} /></div>
      <button type="button" className="btn sec" onClick={() => { setFilterFrom(''); setFilterTo('') }}>ล้างตัวกรองวันที่</button>
      <p className="ml-auto text-xs text-stone-600">แสดง {displayedRows.length.toLocaleString('th-TH')} จาก {rows.length.toLocaleString('th-TH')} รายการ · เรียงตามวันที่ปฏิบัติงานล่าสุดก่อน</p>
    </div>
    {canApprove && !readOnly && approvableDisplayedRows.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-teal-50/60 p-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allApprovableSelected} onChange={e => toggleAllApprovals(e.target.checked)} />เลือกทั้งหมดที่รับรองได้ ({approvableDisplayedRows.length.toLocaleString('th-TH')} รายการ)</label>
      <span className="text-sm text-stone-600">เลือกแล้ว {selectedApprovableIds.length.toLocaleString('th-TH')} รายการ</span>
      <button type="button" className="btn" disabled={!selectedApprovableIds.length || bulkApproving} onClick={approveSelected}>{bulkApproving ? 'กำลังรับรอง…' : 'รับรองรายการที่เลือก (' + selectedApprovableIds.length.toLocaleString('th-TH') + ')'}</button>
      <button type="button" className="btn sec" disabled={!selectedApprovalIds.length || bulkApproving} onClick={() => setSelectedApprovalIds([])}>ล้างที่เลือก</button>
    </div>}
    <table className={`w-full log-table ${showName ? 'log-table-with-name' : ''}`}><thead><tr>{canApprove && !readOnly && <th className="log-col-select"><input aria-label="เลือกกิจกรรมที่รับรองได้ทั้งหมด" type="checkbox" checked={allApprovableSelected} onChange={e => toggleAllApprovals(e.target.checked)} disabled={!approvableDisplayedRows.length} /></th>}<th className="log-col-date">วันที่</th>{showName && <th className="log-col-name">ชื่อ</th>}<th className="log-col-activity">กิจกรรม</th><th className="log-col-qty">จำนวน</th><th className="log-col-points">แต้ม</th><th className="log-col-check">ผลตรวจ</th><th className="log-col-status">สถานะ</th><th className="log-col-reason">เหตุผลที่ไม่รับรอง</th><th className="log-col-actions"></th></tr></thead>
      <tbody>{displayedRows.map((r: any) => {
        // ตรวจซ้ำที่หน้าจอด้วย เพื่อไม่ให้แสดง "ผ่าน" หากข้อมูล validation จาก view ขาดหายหรือยังไม่อัปเดต
        const checkErrors = Array.isArray(r.errors) ? [...r.errors] : []
        const checkWarnings = Array.isArray(r.warnings) ? [...r.warnings] : []
        const addOnce = (arr: string[], message: string) => { if (!arr.includes(message)) arr.push(message) }
        if (r.work_date && r.work_date > today()) addOnce(checkErrors, 'วันที่อยู่ในอนาคต')
        if (Array.isArray(r.eligible) && !r.eligible.includes(r.grp)) addOnce(checkErrors, 'ตำแหน่งนี้บันทึกกิจกรรมนี้ไม่ได้')
        if (r.need_evidence && !String(r.evidence || '').trim() && !r.evidence_image_path) addOnce(checkWarnings, 'ไม่ระบุหลักฐาน')
        const sameActivityRows = rows.filter((x: any) => x.person_id === r.person_id && x.activity_code === r.activity_code)
        if (Number(r.max_day) > 0 && sameActivityRows.filter((x: any) => x.work_date === r.work_date).reduce((sum: number, x: any) => sum + Number(x.qty || 0), 0) > Number(r.max_day)) addOnce(checkWarnings, `เกินเพดาน/วัน (${r.max_day})`)
        if (Number(r.max_month) > 0 && sameActivityRows.filter((x: any) => String(x.work_date || '').slice(0, 7) === String(r.work_date || '').slice(0, 7)).reduce((sum: number, x: any) => sum + Number(x.qty || 0), 0) > Number(r.max_month)) addOnce(checkWarnings, `เกินเพดาน/เดือน (${r.max_month})`)
        return <tr key={r.id}>
        {canApprove && !readOnly && <td className="log-col-select text-center">{r.status === 'pending' && canDecideRow(ap, me, r) ? <input aria-label={'เลือกกิจกรรม ' + r.activity_code} type="checkbox" checked={selectedApprovableIds.includes(Number(r.id))} onChange={e => toggleApprovalSelection(Number(r.id), e.target.checked)} /> : null}</td>}
        <td className="log-col-date whitespace-nowrap">{formatThaiShortDate(r.work_date)}<div className="text-xs text-stone-500">{r.shift === 'เช้า' || r.shift === 'บ่าย' || r.shift === 'ดึก' ? 'เวร' + r.shift : 'แสตนด์เช้า'}</div></td>{showName && <td className="log-col-name">{r.person_name}</td>}
        <td className="log-col-activity whitespace-normal break-words"><div><b>{r.activity_code}</b> — {r.title}</div>{r.parent_log_id && <div className="mt-1 inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">คำขอเพิ่มจำนวน · อ้างอิงรายการ #{r.parent_log_id}</div>}{r.supplemental_reason && <div className="mt-1 rounded-md bg-amber-50 p-2 text-xs text-amber-900">เหตุผลที่ขอเพิ่ม: {r.supplemental_reason}</div>}{r.sub_activity?.trim() && <div className="text-sm mt-1 whitespace-pre-wrap break-words">กิจกรรมย่อย: {r.sub_activity}</div>}{r.evidence_image_path && <div className="mt-1"><button type="button" className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100" onClick={() => openEvidence(sb, r.evidence_image_path)} aria-label={`ดูรูปหลักฐานของกิจกรรม ${r.activity_code}`}>ดูหลักฐานแนบ</button></div>}</td>
        <td className="log-col-qty">{r.qty} {r.uom}</td><td className="log-col-points whitespace-nowrap">{nf(r.counted_points)}{Number(r.cap_cut) > 0 && Number(r.points_before_cap) > 0 ? <span className="text-xs text-amber-700"> (ตัดเพดาน −{nf(r.cap_cut)})</span> : Number(r.counted_points) !== Number(r.points) && <span className="text-xs text-red-700"> (ไม่นับ)</span>}</td>
        <td className="log-col-check text-xs">{checkErrors.map((e: string) => <div key={e} className="text-red-700">✗ {e}</div>)}{checkWarnings.map((e: string) => <div key={e} className="text-amber-700">! {e}</div>)}{!checkErrors.length && !checkWarnings.length && <span className="text-emerald-700">✓ ผ่าน</span>}</td>
        <td className="log-col-status"><span className={`px-1.5 py-0.5 text-xs ${ST[r.status][1]}`}>{ST[r.status][0]}</span>{r.status === 'pending' && <div className="mt-0.5 text-xs text-stone-500">รอ{approverLabel(ap?.personLevel?.[r.person_id] ?? 0)}</div>}</td><td className="log-col-reason whitespace-pre-wrap break-words text-xs">{r.status === 'rejected' ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-800">{String(r.reject_reason || '').trim() || 'ไม่พบเหตุผลที่บันทึกไว้ กรุณาติดต่อหัวหน้าผู้พิจารณา'}</div> : <span className="text-stone-400">—</span>}</td>
        <td className="log-col-actions whitespace-nowrap space-x-1">
          {!readOnly && me && r.entered_by === me && (r.status === 'draft' || r.status === 'rejected') && <>
            <button className="btn !py-0.5" onClick={() => submitRows([r.id])}>{r.status === 'rejected' ? 'ส่งใหม่' : 'ส่ง'}</button>
            <button className="btn sec !py-0.5" onClick={() => beginEdit(r)}>แก้ไข</button>
            <button className="text-xs underline text-red-700" onClick={() => del(r.id)}>ลบ</button></>}
          {!readOnly && r.status === 'pending' && canDecideRow(ap, me, r) && <><button className="btn !py-0.5" onClick={() => set(r.id, 'approved')}>รับรอง</button><button className="btn red !py-0.5" onClick={() => { setRejecting(r); setReason('') }}>ไม่รับรอง</button></>}
          {r.status === 'pending' && !canDecideRow(ap, me, r) && <span className="text-xs text-stone-500">ล็อก · รอ{approverLabel(ap?.personLevel?.[r.person_id] ?? 0)}รับรอง</span>}</td>
      </tr>})}{!displayedRows.length && <tr><td colSpan={canApprove && !readOnly ? 10 : 9} className="text-center text-stone-500 py-6">{rows.length ? 'ไม่พบรายการในช่วงวันที่ที่เลือก' : 'ยังไม่มีรายการในเดือนนี้'}</td></tr>}</tbody></table>
    {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-labelledby="reject-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-3">
      <h3 id="reject-title" className="text-lg font-bold">ไม่รับรองรายการ</h3>
      <p className="text-sm text-stone-700"><b>{rejecting.person_name}</b> · {formatThaiShortDate(rejecting.work_date)} · {rejecting.activity_code} {rejecting.title}</p>
      <label className="field-label block">เหตุผลที่ไม่รับรอง (ผู้บันทึกจะเห็นข้อความนี้)<textarea className="inp mt-1 min-h-[6rem]" value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="เช่น จำนวนไม่ตรงกับเอกสาร ไม่มีหลักฐานประกอบ" /></label>
      <div className="flex justify-end gap-2"><button className="btn sec" onClick={() => setRejecting(null)}>ยกเลิก</button><button className="btn red" disabled={!reason.trim()} onClick={confirmReject}>ยืนยันไม่รับรอง</button></div></div></div>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-log-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b pb-3"><div><h2 id="edit-log-title" className="text-lg font-bold">แก้ไขรายการที่รอรับรอง</h2><p className="text-xs text-stone-500">แก้ไขข้อมูลได้ก่อนรับรองรายการ ระบบจะคำนวณแต้มและตรวจเงื่อนไขใหม่จากข้อมูลล่าสุด</p></div><button className="btn sec" onClick={() => setEditing(null)}>ปิด</button></div>
      {editError && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{editError}</p>}
      <label className="field-label">เวรที่ปฏิบัติ<select className="inp mt-1" value={form.shift || 'เช้า'} onChange={e => setForm({ ...form, shift: e.target.value })}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field-label">วันที่ปฏิบัติงาน<input type="date" lang="th-TH" className="inp mt-1" value={form.work_date} onChange={e => setForm({...form, work_date:e.target.value})} onKeyDown={e => e.preventDefault()} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }} aria-label="เลือกวันที่ปฏิบัติงานจากปฏิทินเท่านั้น" /></label>
      <label className="field-label block">กิจกรรม
        <div className="relative mt-1">
          <input className="inp" type="search" autoComplete="off" value={editActivityQuery} onFocus={() => setEditActivityDropdownOpen(Boolean(editActivityQuery.trim()))} onChange={e => { setEditActivityQuery(e.target.value); setEditActivityDropdownOpen(Boolean(e.target.value.trim())) }} onKeyDown={e => { if (e.key === 'Escape') setEditActivityDropdownOpen(false); if (e.key === 'ArrowDown' && editActivityQuery.trim()) setEditActivityDropdownOpen(true) }} placeholder="พิมพ์รหัสหรือชื่อกิจกรรมเพื่อค้นหา" aria-expanded={editActivityDropdownOpen} aria-controls="edit-activity-options" role="combobox" aria-autocomplete="list" />
          {editActivityDropdownOpen && <div id="edit-activity-options" className="edit-activity-options absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox" aria-label="เลือกกิจกรรมที่จะแก้ไข">
            {editActivityOptions.length ? editActivityOptions.map((a: any) => <button type="button" key={a.code} role="option" aria-selected={form.activity_code === a.code} className="edit-activity-option" onMouseDown={e => e.preventDefault()} onClick={() => { setForm({ ...form, activity_code: a.code }); setEditActivityQuery(''); setEditActivityDropdownOpen(false) }}>
              <span className="edit-activity-code">{a.code}</span><span className="edit-activity-copy">{a.main_activity && <span className="edit-activity-main">{a.main_activity}</span>}<span className="edit-activity-title">{a.title}</span></span>
            </button>) : <p className="p-3 text-sm text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้น</p>}
          </div>}
        </div>
        {selectedEditActivity && <div className="edit-activity-selected mt-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm"><b>{selectedEditActivity.code}</b>{selectedEditActivity.main_activity && <div className="edit-activity-main">{selectedEditActivity.main_activity}</div>}<div className="edit-activity-title">{selectedEditActivity.title}</div></div>}
      </label>
      {(() => { const a = acts.find((x:any) => x.code === form.activity_code); return a ? <div className={`rounded-xl border p-3 text-sm ${a.need_evidence ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><b>{a.need_evidence ? 'หลักฐานที่ต้องใช้สำหรับกิจกรรมนี้ (จำเป็น)' : 'หลักฐานประกอบ'}</b><p className="mt-1 whitespace-pre-wrap">{a.definition || (a.need_evidence ? 'กรุณาระบุหลักฐานอ้างอิงที่ตรวจสอบได้' : 'สามารถระบุเอกสารหรือรูปถ่ายประกอบได้')}</p>{a.need_evidence && <p className="mt-2 text-xs">ต้องกรอกรายละเอียดหลักฐาน หรือมีรูปหลักฐานอย่างน้อย 1 อย่าง</p>}</div> : null })()}
      <label className="field-label">จำนวน ({acts.find((a:any) => a.code === form.activity_code)?.uom || editing.uom || 'หน่วย'})<input type="number" min="0.01" step="0.5" className="inp mt-1" value={form.qty} onChange={e => setForm({...form, qty:e.target.value})} /></label>
      {selectedEditActivity && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm" aria-live="polite"><b>คะแนนตามกิจกรรมและจำนวนที่เลือก</b><div className="mt-1">อัตราคะแนนต่อหน่วย: {nf(editPointsPerUnit)} คะแนน</div><div>คะแนนรวมก่อนตรวจเพดานและเงื่อนไข: <b>{nf(editPointsTotal)} คะแนน</b></div><p className="mt-1 text-xs text-stone-600">คะแนนคำนวณจากเวลามาตรฐานและคะแนนต่อนาทีของสายงาน โดยไม่ใช้ตัวคูณบทบาท โดยระบบยังตรวจเงื่อนไขและเพดานคะแนนตามปกติ</p></div>}
      
      <label className="field-label">รายละเอียดกิจกรรมย่อย / รายละเอียดการดำเนินงาน <span className="required-mark">*</span><textarea required aria-required="true" className="inp mt-1 min-h-24" value={form.sub_activity} onChange={e => setForm({...form, sub_activity:e.target.value})} placeholder="จำเป็นต้องกรอก: ระบุชื่องานย่อย รายละเอียดสิ่งที่ทำ ผลลัพธ์ หรือขอบเขตงาน" /></label>
      <label className="field-label">รายละเอียดหลักฐาน {acts.find((a:any) => a.code === form.activity_code)?.need_evidence && <span className="text-red-700">* จำเป็น</span>}<textarea className="inp mt-1 min-h-24" value={form.evidence} onChange={e => setForm({...form, evidence:e.target.value})} placeholder={acts.find((a:any) => a.code === form.activity_code)?.need_evidence ? 'ระบุหลักฐานตามรายการที่แสดงด้านบน เช่น เลขที่เอกสาร วันที่ ผู้รับรอง หรือชื่อเอกสาร' : 'ระบุเอกสารอ้างอิงหรือคำอธิบายหลักฐาน (ถ้ามี)'} /></label>
      <div className="space-y-1"><label className="field-label">แนบรูปถ่ายหลักฐาน {acts.find((a:any) => a.code === form.activity_code)?.need_evidence && <span className="text-slate-600">(หรือกรอกรายละเอียดหลักฐานด้านบน)</span>}</label>
        <input className="inp" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0] || null; if (f && (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) { setEditError('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); e.target.value = ''; setEditEvidenceFile(null); return } setEditError(''); setEditEvidenceFile(f) }} />
        <p className="field-hint">แนบรูปใหม่ได้ 1 รูปต่อรายการ ขนาดไม่เกิน 5 MB</p>
        {editEvidenceFile && <p className="text-xs text-teal-800">ไฟล์ใหม่ที่เลือก: {editEvidenceFile.name}</p>}
      </div>
      {editing.evidence_image_path && <p className="text-xs text-stone-600">มีรูปหลักฐานเดิม: <button className="underline text-teal-800" onClick={() => openEvidence(sb, editing.evidence_image_path)}>ดูรูปหลักฐานเดิม</button>{editEvidenceFile ? ' · เมื่อบันทึก รูปใหม่จะถูกใช้แทนรูปเดิมในรายการ' : ' · หากไม่เลือกรูปใหม่ รูปเดิมจะคงอยู่'}</p>}
      <div className="rounded-lg bg-slate-50 p-3 text-sm">แต้มจะคำนวณใหม่ตามกิจกรรม จำนวน และบทบาทที่แก้ไข</div>
      <div className="flex flex-wrap gap-2"><button className="btn" disabled={saving} onClick={saveEdit}>{saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</button><button className="btn sec" disabled={saving} onClick={() => { setEditing(null); setEditEvidenceFile(null) }}>ยกเลิก</button></div>
    </div></div>}
  </div>
}

function ActivityLibrary({ sb, acts, positions, isAdmin, reloadActs, myLine, seeAll }: any) {
  const [query, setQuery] = useState('')
  const allLines = [...new Set([...(positions || []).map((p: any) => p.grp), ...(acts || []).flatMap((a: any) => a.eligible || [])])].filter((g: any) => g && g !== NO_LINE) as string[]
  const lines: string[] = seeAll ? [...LINE_ORDER.filter(l => allLines.includes(l)), ...allLines.filter(l => !LINE_ORDER.includes(l))] : ([myLine].filter((l: any) => l && l !== NO_LINE) as string[])
  const [line, setLine] = useState<string>(myLine && lines.includes(myLine) ? myLine : lines[0] || '')
  useEffect(() => { if (!lines.includes(line)) setLine(myLine && lines.includes(myLine) ? myLine : lines[0] || '') }, [lines.join('|')])
  const [showAdd, setShowAdd] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [printingActivities, setPrintingActivities] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const groups = [...new Set((positions || []).map((p: any) => p.grp).filter((g: any) => g && g !== NO_LINE))] as string[]
  const [formLine, setFormLine] = useState<string>(line || '')
  const emptyForm = (selectedLine: string = formLine) => ({ code: '', title: '', domain: 'บริการ', main_activity: '', uom: '', minutes: '1', max_day: '', max_month: '', eligible: selectedLine ? [selectedLine] : [], need_evidence: false, definition: '', note: '' })
  const [form, setForm] = useState<any>(() => emptyForm(line || ''))
  const codeRank = (c: string) => ({ ADM: 0, SVC: 1, ACD: 2 } as any)[String(c).slice(0, 3)] ?? 3
  const byCode = (a: any, b: any) => codeRank(a.code) - codeRank(b.code) || String(a.code).localeCompare(String(b.code))
  const inLine = (acts || []).filter((a: any) => (a.eligible || []).includes(line))
  const activityPrintSet = [...inLine].sort(byCode)
  const summaryHeaders = ['ลำดับ', 'กิจกรรม', 'หน่วยนับ', 'เวลามาตรฐาน (นาที)', 'คะแนนต่อนาที', 'คุณค่างาน', 'คะแนนปรับแล้ว (Workpoint)']
  const ratePerMinute = Number(positions.find((p: any) => p.grp === line)?.rate || 0)
  const activityDescription = (a: any) => [String(a.main_activity || '').trim(), String(a.title || '').trim().replace(/\s+(?=\d+\s*[.)]\s*\S)/g, '\n')].filter(Boolean).join('\n')
  const activityRows = (items: any[]) => items.map((a, index) => [index + 1, activityDescription(a), a.uom || '', Math.round(Number(a.minutes || 0)), ratePerMinute, 1, Math.round(Number(a.minutes || 0) * ratePerMinute * 100) / 100])
  const mainsOfLine = [...new Set(inLine.map((a: any) => a.main_activity).filter(Boolean))] as string[]
  const nextActivityCode = (selectedLine: string, selectedDomain: string) => {
    const prefix = ({ 'บริหาร': 'ADM', 'บริการ': 'SVC', 'วิชาการ': 'ACD' } as Record<string, string>)[selectedDomain] || 'ACT'
    const matching = (acts || []).filter((a: any) => (a.eligible || []).includes(selectedLine) && String(a.code || '').toUpperCase().startsWith(prefix + '-'))
    const structured = matching.map((a: any) => String(a.code || '').trim().match(/^([A-Z]+)-(\d+)-(\d+)$/i)).filter(Boolean)
    if (structured.length) {
      const latest = structured.map((m: any) => ({ group: Number(m[2]), item: Number(m[3]) })).sort((a: any, b: any) => b.group - a.group || b.item - a.item)[0]
      return prefix + '-' + String(latest.group).padStart(2, '0') + '-' + String(latest.item + 1).padStart(2, '0')
    }
    const simple = matching.map((a: any) => Number(String(a.code || '').match(/(\d+)$/)?.[1] || 0)).reduce((a: number, b: number) => Math.max(a, b), 0)
    return prefix + '-01-' + String(simple + 1).padStart(2, '0')
  }
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = inLine.filter((a: any) => terms.every(t => [a.code, a.main_activity, a.title, a.definition, a.note].join(' ').toLowerCase().includes(t))).sort(byCode)
  const exportActivitySet = () => {
    const esc = (value: any) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    const col = (n: number) => { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) } return s }
    const allRows: any[][] = [summaryHeaders, ...activityRows(activityPrintSet)]
    const xmlRows = allRows.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => {
      const ref = `${col(ci + 1)}${ri + 1}`
      const style = ri === 0 ? 1 : ci === 4 ? 4 : ci === 6 ? 3 : 2
      return typeof value === 'number' ? `<c r="${ref}" s="${style}"><v>${value}</v></c>` : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
    }).join('')}</row>`).join('')
    const sheetName = (LINE_LABEL[line] || line || 'กิจกรรม').replace(/[\\/?*:[\]]/g, ' ').slice(0, 31)
    const files: [string, string][] = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF404040"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF777777"/></left><right style="thin"><color rgb="FF777777"/></right><top style="thin"><color rgb="FF777777"/></top><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="55" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="7" width="18" customWidth="1"/></cols><sheetData>${xmlRows}</sheetData><autoFilter ref="A1:G${allRows.length}"/><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup orientation="portrait" paperSize="9"/></worksheet>`]
    ]
    const encoder = new TextEncoder()
    const crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
    const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunks: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0
    const u16 = (v: number) => [v & 255, (v >>> 8) & 255]; const u32 = (v: number) => [...u16(v & 65535), ...u16(Math.floor(v / 65536))]
    for (const [name, content] of files) {
      const nb = encoder.encode(name), data = encoder.encode(content), crc = crc32(data)
      const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...nb, ...data])
      const dir = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nb])
      chunks.push(local); central.push(dir); offset += local.length
    }
    const centralSize = central.reduce((n, a) => n + a.length, 0)
    chunks.push(...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), ...u16(0)]))
    const url = URL.createObjectURL(new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    const safeLine = (LINE_LABEL[line] || line || 'สายงาน').replace(/[\\/:*?"<>|]/g, '_')
    link.href = url
    link.download = `คลังกิจกรรม_P4P_${safeLine}_${today()}.xlsx`
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
  }
  useEffect(() => {
    if (!printingActivities) return
    const afterPrint = () => { document.body.classList.remove('print-activity-library'); setPrintingActivities(false) }
    window.addEventListener('afterprint', afterPrint)
    const timer = window.setTimeout(() => window.print(), 100)
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', afterPrint) }
  }, [printingActivities])
  const add = async () => {
    setMsg('')
    if (!formLine || !form.code.trim() || !form.title.trim() || !form.uom.trim() || !form.minutes || Number(form.minutes) <= 0 || !form.eligible.length) {
      setMsg('กรุณาเลือกสายงาน แล้วกรอกชื่อกิจกรรม หน่วยนับ และนาที/หน่วยให้ครบ')
      return
    }
    if (form.need_evidence && !form.definition.trim()) {
      setMsg('กิจกรรมที่บังคับใช้หลักฐาน ต้องระบุรายละเอียดหลักฐานให้ชัดเจนก่อนบันทึก')
      return
    }
    setBusy(true)
    const payload = {
      code: form.code.trim(), title: form.title.trim(), domain: form.domain, category: null, main_activity: form.main_activity.trim() || null, uom: form.uom.trim(),
      minutes: Number(form.minutes), max_day: form.max_day === '' ? null : Number(form.max_day),
      max_month: form.max_month === '' ? null : Number(form.max_month), eligible: form.eligible,
      need_evidence: form.need_evidence, definition: form.definition.trim() || null,
      use_role_mult: false, note: form.note.trim() || null, active: true
    }
    const { error } = await sb.from('activities').insert(payload)
    setBusy(false)
    if (error) { setMsg(error.code === '23505' ? 'รหัสกิจกรรมนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น' : 'เพิ่มกิจกรรมไม่สำเร็จ: ' + error.message); return }
    setForm(emptyForm()); setShowAdd(false); setMsg('เพิ่มกิจกรรมสำเร็จ'); reloadActs()
  }
  const beginEditActivity = (a: any) => {
    setEditingCode(a.code)
    setFormLine((a.eligible || [])[0] || line || '')
    setForm({ code: a.code, title: a.title || '', domain: a.domain || 'บริการ', main_activity: a.main_activity || '', uom: a.uom || '', minutes: String(a.minutes ?? 1), max_day: a.max_day == null ? '' : String(a.max_day), max_month: a.max_month == null ? '' : String(a.max_month), eligible: Array.isArray(a.eligible) ? a.eligible : [], need_evidence: Boolean(a.need_evidence), definition: a.definition || '', note: a.note || '' })
    setShowAdd(true)
    setMsg('')
  }
  const saveActivityEdit = async () => {
    setMsg('')
    if (!editingCode) return
    if (!form.title.trim() || !form.uom.trim() || !form.minutes || Number(form.minutes) <= 0 || !form.eligible.length) {
      setMsg('กรุณากรอกชื่อกิจกรรม หน่วยนับ นาที/หน่วย และเลือกกลุ่มตำแหน่งที่มีสิทธิ์ให้ครบ')
      return
    }
    if (form.need_evidence && !form.definition.trim()) {
      setMsg('กิจกรรมที่บังคับใช้หลักฐาน ต้องระบุรายละเอียดหลักฐานให้ชัดเจนก่อนบันทึก')
      return
    }
    setBusy(true)
    const payload = {
      title: form.title.trim(), domain: form.domain, category: null, main_activity: form.main_activity.trim() || null, uom: form.uom.trim(),
      minutes: Number(form.minutes), max_day: form.max_day === '' ? null : Number(form.max_day),
      max_month: form.max_month === '' ? null : Number(form.max_month), eligible: form.eligible,
      need_evidence: form.need_evidence, definition: form.definition.trim() || null,
      use_role_mult: false, note: form.note.trim() || null
    }
    const { error } = await sb.from('activities').update(payload).eq('code', editingCode)
    setBusy(false)
    if (error) { setMsg('แก้ไขกิจกรรมไม่สำเร็จ: ' + error.message); return }
    setForm(emptyForm()); setShowAdd(false); setEditingCode(null); setMsg(`บันทึกการแก้ไขกิจกรรม ${editingCode} สำเร็จ`); reloadActs()
  }
  const cancelForm = () => { setShowAdd(false); setEditingCode(null); setFormLine(line || ''); setForm(emptyForm(line || '')); setMsg('') }
  const deactivate = async (a: any) => {
    if (!confirm(`ยืนยันเพิกถอนกิจกรรม ${a.code} — ${a.title} หรือไม่? กิจกรรมจะไม่ปรากฏในรายการบันทึกใหม่ แต่ประวัติที่บันทึกไว้จะยังคงอยู่`)) return
    const { error } = await sb.from('activities').update({ active: false }).eq('code', a.code)
    if (error) { setMsg('เพิกถอนกิจกรรมไม่สำเร็จ: ' + error.message); return }
    setMsg(`เพิกถอนกิจกรรม ${a.code} แล้ว`); reloadActs()
  }
  return <div className="space-y-4">
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><h2 className="text-lg font-bold">คลังกิจกรรม P4P</h2><p className="text-sm text-stone-600">{seeAll ? 'ค้นหาและศึกษารายละเอียด เกณฑ์การนับแต้ม และหลักฐานประกอบ แยกตามสายงาน (เห็นทุกสายงาน)' : 'แสดงเฉพาะกิจกรรมของตำแหน่งของคุณ ค้นหาและศึกษาเกณฑ์การนับแต้มและหลักฐานประกอบ'}</p></div>
      {isAdmin && <button className="btn" onClick={() => { if (showAdd) cancelForm(); else { setFormLine(line || ''); setForm(emptyForm(line || '')); setShowAdd(true); setMsg('') } }}>{showAdd ? 'ปิดแบบฟอร์ม' : '+ เพิ่มกิจกรรม'}</button>}</div>
      {msg && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{msg}</p>}
      {showAdd && isAdmin && <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
        <h3 className="font-bold">{editingCode ? `แก้ไขกิจกรรม ${editingCode}` : 'เพิ่มกิจกรรมเข้าคลัง'}</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="field-label">1. เลือกตำแหน่งสายงาน<select className="inp mt-1" value={formLine} disabled={Boolean(editingCode)} onChange={e => { const l = e.target.value; setFormLine(l); setForm({...form, eligible: l ? [l] : [], code:l ? nextActivityCode(l,form.domain) : ''}) }}><option value="">-- เลือกสายงานก่อน --</option>{groups.map((g: string) => <option key={g} value={g}>{g}</option>)}</select></label>
          <label className="field-label">รหัสกิจกรรม (สร้างอัตโนมัติ)<input className="inp mt-1" value={form.code} readOnly placeholder="เลือกสายงานก่อน" /><span className="mt-1 block text-xs text-stone-500">ระบบสร้างรหัสต่อจากรายการล่าสุดของสายงานและด้านที่เลือก</span></label>
          <label className="field-label">กิจกรรมหลัก<input className="inp mt-1" list="main-options" value={form.main_activity} onChange={e => setForm({...form, main_activity:e.target.value})} placeholder="เช่น การเคลื่อนย้ายผู้ป่วย" /></label>
          <label className="field-label">ด้านในใบสรุปคะแนน<select className="inp mt-1" value={form.domain} onChange={e => setForm({...form, domain:e.target.value, code:formLine && !editingCode ? nextActivityCode(formLine,e.target.value) : form.code})}>{['บริหาร','บริการ','วิชาการ'].map(x => <option key={x}>{x}</option>)}</select></label>
          <datalist id="main-options">{mainsOfLine.map(c => <option key={c} value={c} />)}</datalist>
          <label className="field-label sm:col-span-2">ชื่อกิจกรรมย่อย (ใช้ค้นหาตอนบันทึก)<input className="inp mt-1" value={form.title} onChange={e => setForm({...form, title:e.target.value})} /></label>
          <label className="field-label">หน่วยนับ<input className="inp mt-1" value={form.uom} onChange={e => setForm({...form, uom:e.target.value})} placeholder="เช่น ครั้ง, ราย, ชั่วโมง" /></label>
          <label className="field-label">นาทีต่อหน่วย<input type="number" min="0.01" step="0.01" className="inp mt-1" value={form.minutes} onChange={e => setForm({...form, minutes:e.target.value})} /></label>
          <label className="field-label">จำกัดจำนวนต่อวัน (ถ้ามี)<input type="number" min="0" step="0.5" className="inp mt-1" value={form.max_day} onChange={e => setForm({...form, max_day:e.target.value})} /></label>
          <label className="field-label">จำกัดจำนวนต่อเดือน (ถ้ามี)<input type="number" min="0" step="0.5" className="inp mt-1" value={form.max_month} onChange={e => setForm({...form, max_month:e.target.value})} /></label>
        </div>
        <div><p className="field-label mb-2">สายงานที่มีสิทธิ์ทำกิจกรรม</p><p className="text-sm text-stone-700">{formLine || 'กรุณาเลือกสายงานด้านบนก่อน'}</p><p className="mt-1 text-xs text-stone-500">กิจกรรมใหม่จะผูกกับสายงานที่เลือกเพียงสายงานเดียว</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.need_evidence} onChange={e => setForm({...form, need_evidence:e.target.checked})} />บังคับแนบหลักฐานประกอบ</label>
        <label className="field-label">รายละเอียดกิจกรรม / หลักฐานที่ต้องใช้<textarea className="inp mt-1 min-h-24" value={form.definition} onChange={e => setForm({...form, definition:e.target.value})} placeholder="อธิบายขอบเขต เกณฑ์การนับ และเอกสาร/หลักฐานที่ต้องแนบให้ตรวจสอบได้" /></label>
        <label className="field-label">หมายเหตุ / เงื่อนไขเพิ่มเติม<textarea className="inp mt-1 min-h-16" value={form.note} onChange={e => setForm({...form, note:e.target.value})} /></label>
        
        <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={editingCode ? saveActivityEdit : add}>{busy ? 'กำลังบันทึก…' : editingCode ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรมใหม่'}</button><button className="btn sec" disabled={busy} onClick={cancelForm}>ยกเลิก</button></div>
      </div>}
      <div className="grid gap-3">
        {lines.length > 1 ? <div className="flex flex-wrap gap-2" role="tablist" aria-label="สายงาน">{lines.map(l => { const on = line === l; const n = (acts || []).filter((a: any) => (a.eligible || []).includes(l)).length
          return <button key={l} type="button" role="tab" aria-selected={on} onClick={() => setLine(l)} className={'rounded-lg border px-3 py-1.5 text-sm font-semibold ' + (on ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50')}>{LINE_LABEL[l] || l}<span className="ml-1.5 text-xs opacity-80">{n}</span></button> })}</div>
          : <p className="text-sm text-stone-700">ชุดกิจกรรมของตำแหน่งคุณ: <b className="text-teal-900">{LINE_LABEL[line] || line || 'ยังไม่กำหนด'}</b>{!line && ' · ตำแหน่งนี้ยังไม่มีชุดกิจกรรม โปรดแจ้งผู้ดูแลระบบ'}</p>}
        <div className="flex flex-wrap items-center gap-2"><input className="inp min-w-[220px] flex-1" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา: รหัส กิจกรรมหลัก กิจกรรมย่อย หรือหลักฐาน (พิมพ์หลายคำได้)…" /><button type="button" className="btn sec whitespace-nowrap" disabled={!line || !activityPrintSet.length} onClick={() => { document.body.classList.add('print-activity-library'); setPrintingActivities(true) }}>พิมพ์ชุดกิจกรรม</button><button type="button" className="btn sec whitespace-nowrap" disabled={!line || !activityPrintSet.length} onClick={exportActivitySet}>ส่งออก Excel (.xlsx)</button></div>
      </div>
      <p className="text-xs text-stone-500">สายงาน {LINE_LABEL[line] || line} · แสดง {filtered.length} รายการ</p>
    </div>
    {filtered.length === 0 ? <div className="card text-center text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหา</div> :
      <div className="card overflow-x-auto p-0">
        <table className={`activity-library-table w-full ${isAdmin ? 'admin-table min-w-[960px]' : 'min-w-[760px]'} border-collapse text-sm`}>
          <thead><tr>{summaryHeaders.map(h => <th key={h}>{h}</th>)}{isAdmin && <th>จัดการ</th>}</tr></thead>
          <tbody>{filtered.map((a: any, index: number) => <tr key={a.code} className="align-top">
            <td className="whitespace-nowrap text-center">{index + 1}</td>
            <td><div className="whitespace-pre-line font-medium">{activityDescription(a)}</div></td>
            <td>{a.uom || '—'}</td><td className="text-right">{Math.round(Number(a.minutes || 0))}</td><td className="text-right">{ratePerMinute.toFixed(3)}</td><td className="text-right">1</td><td className="text-right">{(Number(a.minutes || 0) * ratePerMinute).toFixed(2)}</td>
            {isAdmin && <td className="whitespace-nowrap"><div className="flex flex-col items-start gap-1"><button className="btn sec !py-0.5" onClick={() => beginEditActivity(a)}>แก้ไข</button><button className="btn sec !py-0.5 !text-red-700" onClick={() => deactivate(a)}>เพิกถอน</button></div></td>}
          </tr>)}</tbody>
        </table>
      </div>}
    {printingActivities && createPortal(<div className="activity-library-print"><h1>คลังกิจกรรม P4P</h1><h2>{LINE_LABEL[line] || line}</h2><p>รายการกิจกรรมทั้งหมดในชุดสายงาน · {activityPrintSet.length} รายการ · พิมพ์วันที่ {formatThaiShortDate(today())}</p><table><thead><tr>{summaryHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{activityRows(activityPrintSet).map((row, ri) => <tr key={ri}>{row.map((value, ci) => <td key={ci} className={ci === 1 ? 'activity-description' : 'activity-number'}>{value}</td>)}</tr>)}</tbody></table></div>, document.body)}
  </div>
}

function GroupHeadsReport({ sb, groupName, people = [], allPeople = [], month, positions = [], units = [], acts = [] }: any) {
  const [heads, setHeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [detailFor, setDetailFor] = useState<any>(null)
  const [printReport, setPrintReport] = useState(false)
  const [leaveReportOpen, setLeaveReportOpen] = useState(false)
  const [groupLeaveData, setGroupLeaveData] = useState<Record<string, any>>({})
  const [groupLeaveDrafts, setGroupLeaveDrafts] = useState<Record<string, any>>({})
  const [groupLeaveSaving, setGroupLeaveSaving] = useState<Record<string, boolean>>({})
  const [groupLeaveMessages, setGroupLeaveMessages] = useState<Record<string, string>>({})
  const [printingPerson, setPrintingPerson] = useState<any>(null)
  const [rates, setRates] = useState<Record<string, number>>({})
  const [rowsAll, reload] = useLogs(sb, month, null, null)
  useEffect(() => {
    let alive = true
    setLoading(true)
    sb.rpc('directory_group_staff', { p_group_name: groupName }).then(({ data, error }: any) => {
      if (!alive) return
      if (error) { console.error('โหลดหัวหน้ากลุ่มงานไม่สำเร็จ', error); setHeads([]) }
      else setHeads((Array.isArray(data) ? data : [])
        .filter((p: any) => String(p.org_role || '').includes('หัวหน้ากลุ่มงาน'))
        .map((p: any) => {
          const displayName = p.full_name || `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()
          const personRecords = [...(allPeople || []), ...(people || [])].filter((x: any, i: number, a: any[]) => a.findIndex((y: any) => y.id === x.id) === i)
          const normPersonKey = (v: any) => String(v || '').normalize('NFC').replace(/\s+/g, '').trim()
          const linked = personRecords.find((x: any) => (p.person_id && String(x.id) === String(p.person_id)) || (p.source_row != null && Number(x.staff_directory_id) === Number(p.source_row)) || normPersonKey(x.name) === normPersonKey(displayName))
          return { ...linked, ...p, id: linked?.id || p.person_id || null, name: displayName || linked?.name, displayName, group_name: groupName, staff_directory_id: p.source_row ?? linked?.staff_directory_id, unit_id: linked?.unit_id ?? p.unit_id ?? null, position: p.position || linked?.position, org_role: p.org_role || linked?.org_role, active: p.active !== false }
        })
        .filter((p: any) => p.displayName)
        .filter((p: any, i: number, a: any[]) => a.findIndex((x: any) => x.displayName === p.displayName) === i)
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName, 'th')))
      setLoading(false)
    })
    return () => { alive = false }
  }, [sb, groupName, people, allPeople])
  useEffect(() => {
    let alive = true
    const groupUnitIds = (units || []).filter((u: any) => String(u.parent_group || '').trim() === String(groupName || '').trim()).map((u: any) => Number(u.id)).filter(Number.isFinite)
    if (!groupUnitIds.length || !month) { setRates({}); return }
    sb.from('unit_settings').select('unit_id,baht_per_point').in('unit_id', groupUnitIds).eq('month', month + '-01').then(({ data, error }: any) => {
      if (!alive) return
      if (error) { console.error('โหลดอัตราเงินเพิ่มของกลุ่มงานไม่สำเร็จ', error); setRates({}); return }
      setRates(Object.fromEntries((data || []).map((x: any) => [String(x.unit_id), Number(x.baht_per_point || 0)])))
    })
    return () => { alive = false }
  }, [sb, groupName, month, units])
  const monthText = month ? new Date(month + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : ''
  useEffect(() => {
    let alive = true
    if (!groupName || !month) { setGroupLeaveData({}); setGroupLeaveDrafts({}); return () => { alive = false } }
    sb.from('p4p_group_monthly_leave').select('staff_directory_id,personal_leave_days,sick_leave_days,annual_leave_days')
      .eq('group_name', groupName).eq('month', month + '-01')
      .then(({ data, error }: any) => {
        if (!alive) return
        if (error) { console.error('โหลดข้อมูลวันลากลุ่มงานไม่สำเร็จ:', error); setGroupLeaveData({}); return }
        const mapped = Object.fromEntries((data || []).map((x: any) => [String(x.staff_directory_id), {
          personal_leave_days: Number(x.personal_leave_days || 0), sick_leave_days: Number(x.sick_leave_days || 0), annual_leave_days: Number(x.annual_leave_days || 0)
        }]))
        setGroupLeaveData(mapped)
        setGroupLeaveDrafts(Object.fromEntries(Object.entries(mapped).map(([k, v]) => [k, {
          personal_leave_days: String((v as any).personal_leave_days), sick_leave_days: String((v as any).sick_leave_days), annual_leave_days: String((v as any).annual_leave_days)
        }])))
      })
    return () => { alive = false }
  }, [sb, groupName, month])
  const saveGroupLeave = async (person: any) => {
    const staffId = Number(person.staff_directory_id ?? person.directory_source_row)
    if (!staffId) { alert('ไม่พบรหัสบุคลากรจากทะเบียนกลาง จึงยังบันทึกข้อมูลวันลาไม่ได้'); return }
    const key = String(staffId)
    const draft = groupLeaveDrafts[key] || { personal_leave_days: '0', sick_leave_days: '0', annual_leave_days: '0' }
    const values: any = {}
    for (const field of ['personal_leave_days', 'sick_leave_days', 'annual_leave_days']) {
      const raw = String(draft[field] ?? '0').trim()
      const value = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(value) || value < 0) { setGroupLeaveMessages(v => ({ ...v, [key]: 'กรุณากรอกจำนวนวันลาเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' })); return }
      values[field] = value
    }
    setGroupLeaveSaving(v => ({ ...v, [key]: true })); setGroupLeaveMessages(v => ({ ...v, [key]: '' }))
    const { error } = await sb.from('p4p_group_monthly_leave').upsert({ staff_directory_id: staffId, group_name: groupName, month: month + '-01', ...values }, { onConflict: 'staff_directory_id,group_name,month' })
    setGroupLeaveSaving(v => ({ ...v, [key]: false }))
    if (error) setGroupLeaveMessages(v => ({ ...v, [key]: 'บันทึกไม่สำเร็จ: ' + error.message }))
    else {
      setGroupLeaveData(v => ({ ...v, [key]: values }))
      setGroupLeaveMessages(v => ({ ...v, [key]: 'บันทึกแล้ว' }))
    }
  }
  const groupRate = Object.values(rates).find((n: number) => Number.isFinite(n)) || 0
  const sum = useMemo(() => heads.map((p: any, index: number) => {
    const rs = rowsAll.filter((r: any) => r.person_id === p.id || (p.person_id && r.person_id === p.person_id))
    const approved = rs.filter((r: any) => r.status === 'approved')
    const g = guaranteeForPosition(p.position, positions, p.org_role)
    const workPoints = approved.reduce((t: number, r: any) => t + Number(r.counted_points || 0), 0)
    const scoring = scoreBreakdown(p.position, positions, p.org_role, workPoints)
    const roleGuarantee = scoring.roleGuarantee
    const performancePoints = scoring.performance
    const excess = scoring.excess
    const rate = p.unit_id != null && rates[String(p.unit_id)] != null ? rates[String(p.unit_id)] : groupRate
    return { p, order: index + 1, g, roleGuarantee, workPoints, performancePoints, excess, rate, payout: excess * rate, rs }
  }), [heads, rowsAll, positions, rates, groupRate])
  useEffect(() => {
    if (!printReport) return
    const afterPrint = () => { document.body.classList.remove('print-unit-report', 'unit-report-preview-open'); setPrintReport(false) }
    window.addEventListener('afterprint', afterPrint)
    return () => window.removeEventListener('afterprint', afterPrint)
  }, [printReport])
  const openPrintReport = () => {
    if (!sum.length) { alert('ไม่พบข้อมูลรายงานของกลุ่มงาน'); return }
    document.body.classList.remove('print-unit-report', 'print-individual-report', 'unit-report-preview-open')
    document.body.classList.add('unit-report-preview-open')
    setPrintReport(true)
  }
  const startPrintReport = () => {
    document.body.classList.remove('unit-report-preview-open', 'print-individual-report')
    document.body.classList.add('print-unit-report')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
  }
  const closePrintReport = () => { document.body.classList.remove('print-unit-report', 'unit-report-preview-open'); setPrintReport(false) }
  return <div className="card space-y-3">
    <div><h2 className="text-lg font-bold">สรุปรายงานหน่วยงาน · {groupName}</h2><p className="text-sm text-stone-600">แสดงเฉพาะรายชื่อหัวหน้ากลุ่มงาน โดยไม่รวมบุคลากรของหน่วยงานย่อย · ประจำเดือน {monthText}</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn" onClick={openPrintReport} disabled={loading || !sum.length}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์รายงานกลุ่มงาน</button>
      <button type="button" className={leaveReportOpen ? 'btn sec' : 'btn'} onClick={() => setLeaveReportOpen(v => !v)} disabled={loading || !sum.length}>{leaveReportOpen ? 'กลับสรุปรายงานกลุ่มงาน' : 'สรุปผลการปฏิบัติงาน (เอกสารส่งเบิก)'}</button>
    </div>
    {leaveReportOpen && <div className="space-y-3">
      <div className="rounded-xl border border-stone-200 bg-white p-3"><h3 className="font-bold">สรุปผลการปฏิบัติงาน (เอกสารส่งเบิก)</h3><p className="text-sm text-stone-600">{groupName} · ประจำเดือน {monthText} · แสดงเฉพาะหัวหน้ากลุ่มงาน</p></div>
      <div className="overflow-x-auto rounded-xl border border-stone-200"><table className="w-full min-w-[900px] text-sm"><thead><tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>ตำแหน่งที่ปฏิบัติงาน</th><th>จำนวนวันปฏิบัติงาน</th><th>ลากิจ (วัน)</th><th>ลาป่วย (วัน)</th><th>ลาพักผ่อน (วัน)</th><th>บันทึกข้อมูล</th><th>พิมพ์</th></tr></thead><tbody>
        {sum.map((x: any) => {
          const staffId = Number(x.p.staff_directory_id ?? x.p.directory_source_row)
          const key = String(staffId || '')
          const saved = groupLeaveData[key] || { personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }
          const draft = groupLeaveDrafts[key] || { personal_leave_days: String(saved.personal_leave_days), sick_leave_days: String(saved.sick_leave_days), annual_leave_days: String(saved.annual_leave_days) }
          const workDays = new Set((x.rs || []).filter((r: any) => r.status !== 'draft').map((r: any) => String(r.work_date || '').slice(0, 10)).filter(Boolean)).size
          const setLeave = (field: string, value: string) => setGroupLeaveDrafts(v => ({ ...v, [key]: { ...(v[key] || draft), [field]: value } }))
          return <tr key={x.p.id || key}>
            <td className="p-2 text-center">{x.order}</td><td className="p-2 font-semibold">{x.p.displayName}</td><td className="p-2">{x.p.position || '—'}</td><td className="p-2 text-center font-semibold">{workDays}</td>
            <td className="p-2"><input aria-label={'ลากิจของ ' + x.p.displayName} type="number" min="0" step="0.5" className="inp !w-24" value={draft.personal_leave_days} onChange={e => setLeave('personal_leave_days', e.target.value)} /></td>
            <td className="p-2"><input aria-label={'ลาป่วยของ ' + x.p.displayName} type="number" min="0" step="0.5" className="inp !w-24" value={draft.sick_leave_days} onChange={e => setLeave('sick_leave_days', e.target.value)} /></td>
            <td className="p-2"><input aria-label={'ลาพักผ่อนของ ' + x.p.displayName} type="number" min="0" step="0.5" className="inp !w-24" value={draft.annual_leave_days} onChange={e => setLeave('annual_leave_days', e.target.value)} /></td>
            <td className="p-2"><button type="button" className="btn !py-1" disabled={!staffId || !!groupLeaveSaving[key]} onClick={() => saveGroupLeave(x.p)}>{groupLeaveSaving[key] ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button>{groupLeaveMessages[key] && <div className={'mt-1 text-xs ' + (groupLeaveMessages[key].startsWith('บันทึกแล้ว') ? 'text-emerald-700' : 'text-red-700')}>{groupLeaveMessages[key]}</div>}</td>
            <td className="p-2"><button type="button" className="btn sec !py-1" disabled={!x.p.id} onClick={() => setPrintingPerson({ ...x.p, name: x.p.displayName, group_name: groupName, staff_directory_id: staffId || x.p.staff_directory_id })}>พิมพ์</button></td>
          </tr>
        })}
        {!sum.length && <tr><td colSpan={9} className="py-6 text-center text-stone-500">ไม่พบรายชื่อหัวหน้ากลุ่มงาน</td></tr>}
      </tbody></table></div>
    </div>}
    {loading ? <p className="text-sm text-stone-500">กำลังโหลดรายชื่อ…</p> : sum.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2">ลำดับ</th><th className="p-2 text-left">ชื่อ-สกุล</th><th className="p-2 text-left">ตำแหน่ง</th><th className="p-2">แต้มประกัน/เดือน</th><th className="p-2">แต้มการันตี</th><th className="p-2">แต้มกิจกรรม</th><th className="p-2">แต้มส่วนต่าง</th><th className="p-2">อัตราเงินเพิ่ม</th><th className="p-2">รวมจำนวนเงินที่ได้รับ</th></tr></thead><tbody>{sum.map((x: any) => <tr key={x.p.id || x.p.displayName} className={x.p.id ? "border-t cursor-pointer hover:bg-teal-50" : "border-t"} title={x.p.id ? "คลิกแถวนี้เพื่อดูรายการกิจกรรมและสถานะ" : undefined} onClick={() => x.p.id && setDetailFor(x.p)}><td className="p-2 text-center">{x.order}</td><td className="p-2"><b>{x.p.displayName}</b></td><td className="p-2">{String(x.p.position || '').replace(/[\\s　]+/g, '').includes('พยาบาลวิชาชีพชำนาญการพิเศษ') ? <>พยาบาลวิชาชีพ<br/>ชำนาญการพิเศษ</> : String(x.p.position || '').replace(/[\\s　]+/g, '').includes('พยาบาลวิชาชีพชำนาญการ') ? <>พยาบาลวิชาชีพ<br/>ชำนาญการ</> : String(x.p.position || '').replace(/[\\s　]+/g, '').includes('พยาบาลวิชาชีพปฏิบัติการ') ? <>พยาบาลวิชาชีพ<br/>ปฏิบัติการ</> : (x.p.position || '—')}</td><td className="p-2 text-center">{nf(x.g, 0)}</td><td className="p-2 text-center">{nf(x.roleGuarantee, 0)}</td><td className="p-2 text-center">{nf(x.workPoints)}</td><td className="p-2 text-center">{nf(x.excess)}</td><td className="p-2 text-center">{nf(x.rate)}</td><td className="p-2 text-center font-semibold">{nf(x.payout)}</td></tr>)}<tr className="border-t font-bold"><td colSpan={3} className="p-2">รวมกลุ่มงาน</td><td className="p-2 text-center">{nf(sum.reduce((a: number, x: any) => a + x.g, 0))}</td><td className="p-2 text-center">{nf(sum.reduce((a: number, x: any) => a + x.roleGuarantee, 0))}</td><td className="p-2 text-center">{nf(sum.reduce((a: number, x: any) => a + x.workPoints, 0))}</td><td className="p-2 text-center">{nf(sum.reduce((a: number, x: any) => a + x.excess, 0))}</td><td className="p-2 text-center">—</td><td className="p-2 text-center">{nf(sum.reduce((a: number, x: any) => a + x.payout, 0))} บาท</td></tr></tbody></table></div> : <p className="text-sm text-stone-600">ไม่พบรายชื่อหัวหน้ากลุ่มงานในกลุ่มงานนี้</p>}
    {printReport && createPortal(<div className="unit-report-print"><div className="unit-report-toolbar no-print"><span>ตัวอย่างก่อนพิมพ์</span><button type="button" className="btn" onClick={startPrintReport}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์</button><button type="button" className="btn sec" onClick={closePrintReport}>ปิด</button></div><table className="unit-report-table"><colgroup><col className="unit-col-order" /><col className="unit-col-name" /><col className="unit-col-position" /><col className="unit-col-guarantee" /><col className="unit-col-work" /><col className="unit-col-work" /><col className="unit-col-excess" /><col className="unit-col-rate" /><col className="unit-col-payout" /></colgroup><thead><tr className="unit-report-heading-row"><th colSpan={9}><h1>แบบสรุปผลการปฏิบัติงาน (Pay for Performance: P4P)</h1><div className="unit-report-subtitle">กลุ่มงาน {groupName}　 ประจำเดือน {monthText}</div></th></tr><tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>แต้มประกัน/เดือน</th><th>แต้มการันตี</th><th>แต้มกิจกรรม</th><th>แต้มส่วนต่าง</th><th>อัตราเงินเพิ่ม</th><th>ยอดเงินรวม</th></tr></thead><tbody>{sum.map((x: any) => <tr key={x.p.id}><td>{x.order}</td><td>{x.p.displayName}</td><td>{(() => {
        const rawPosition = String(x.p.position || '')
        const normalizedPosition = rawPosition.normalize('NFC').replace(/[\s　]+/g, '').replace(/[()（）]/g, '')
        if (normalizedPosition.includes('พยาบาลวิชาชีพชำนาญการพิเศษ')) return <>พยาบาลวิชาชีพ<br/>ชำนาญการพิเศษ</>
        if (normalizedPosition.includes('นักวิชาการสาธารณสุข') && normalizedPosition.includes('พยาบาลวิชาชีพ')) return <>นักวิชาการสาธารณสุข<br/>(พยาบาลวิชาชีพ)</>
        if (normalizedPosition.includes('นักวิชาการสาธารณสุข') && normalizedPosition.includes('พาราเมดิก')) return <>นักวิชาการสาธารณสุข<br/>(พาราเมดิก)</>
        if (normalizedPosition.includes('เจ้าพนักงานสาธารณสุขชำนาญงาน') && normalizedPosition.includes('EMT')) return <>เจ้าพนักงานสาธารณสุข<br/>ชำนาญงาน (EMT)</>
        if (normalizedPosition.includes('เจ้าพนักงานสาธารณสุขปฏิบัติงาน') && normalizedPosition.includes('EMT')) return <>เจ้าพนักงานสาธารณสุข<br/>ปฏิบัติงาน (EMT)</>
        return rawPosition || '—'
      })()}</td><td>{nf(x.g, 0)}</td><td>{nf(x.roleGuarantee, 0)}</td><td>{nf(x.workPoints)}</td><td>{nf(x.excess)}</td><td>{nf(x.rate)}</td><td>{nf(x.payout)}</td></tr>)}<tr className="unit-report-total"><td colSpan={3}>รวมกลุ่มงาน</td><td>{nf(sum.reduce((a: number, x: any) => a + x.g, 0))}</td><td>{nf(sum.reduce((a: number, x: any) => a + x.roleGuarantee, 0))}</td><td>{nf(sum.reduce((a: number, x: any) => a + x.workPoints, 0))}</td><td>{nf(sum.reduce((a: number, x: any) => a + x.excess, 0))}</td><td>—</td><td>{nf(sum.reduce((a: number, x: any) => a + x.payout, 0))} บาท</td></tr></tbody></table></div>, document.body)}
    {detailFor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label={`รายการกิจกรรมของ ${detailFor.displayName || detailFor.name}`}><div className="w-full max-w-[96rem] max-h-[94vh] overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl sm:p-5 space-y-3"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">รายการกิจกรรมรายบุคคล</h2><p className="text-sm text-stone-600">{detailFor.displayName || detailFor.name} · ประจำเดือน {monthText} · แสดงทุกสถานะ ยกเว้นฉบับร่าง</p></div><button type="button" className="btn sec" onClick={() => setDetailFor(null)}>ปิด</button></div><LogTable sb={sb} rows={rowsAll.filter((r: any) => r.status !== 'draft' && detailFor.id != null && String(r.person_id) === String(detailFor.id))} reload={reload} canApprove={true} acts={acts} month={month} showName={false} /></div></div>}
    {printingPerson && <PrintSheet sb={sb} person={printingPerson} rows={rowsAll.filter((r: any) => String(r.person_id) === String(printingPerson.id))} month={month} units={units} positions={positions} leaveDataOverride={groupLeaveData[String(printingPerson.staff_directory_id ?? printingPerson.directory_source_row)] || { personal_leave_days: 0, sick_leave_days: 0, annual_leave_days: 0 }} onClose={() => setPrintingPerson(null)} />}
  </div>
}

function ReviewPage({ sb, people, unit, month, acts, positions, audit, units, canPrint, reportOnly = false, certificationOnly = false }: any) {
  const [detailFor, setDetailFor] = useState<any>(null)
  const [printingPerson, setPrintingPerson] = useState<any>(null)
  const [directoryPeople, setDirectoryPeople] = useState<any[]>([])
  const [signaturePeople, setSignaturePeople] = useState<any[]>([])
  const [unitRate, setUnitRate] = useState(0)
  const [payGroups, setPayGroups] = useState<any[]>([])
  const [actingChief, setActingChief] = useState<any>({ name: 'นางสาวมัณฑนา เพชรคำ', position: 'พยาบาลวิชาชีพชำนาญการพิเศษ' })
  const [printReport, setPrintReport] = useState(false)
  const [leaveReportOpen, setLeaveReportOpen] = useState(false)
  const [leaveDrafts, setLeaveDrafts] = useState<Record<string, any>>({})
  const [leaveSaving, setLeaveSaving] = useState<Record<string, boolean>>({})
  const [leaveMessages, setLeaveMessages] = useState<Record<string, string>>({})
  const [certificationSearch, setCertificationSearch] = useState('')
  const ap = useContext(ApproverCtx); const me = useContext(MeCtx)
  const [rowsAll, reload] = useLogs(sb, month, null, unit)
  useEffect(() => {
    let alive = true
    if (!unit || !month) { setLeaveDrafts({}); return () => { alive = false } }
    sb.from('p4p_monthly_leave').select('staff_directory_id,personal_leave_days,sick_leave_days,annual_leave_days')
      .eq('unit_id', unit).eq('month', month + '-01')
      .then(({ data, error }: any) => {
        if (!alive) return
        if (error) { console.error('โหลดข้อมูลวันลาไม่สำเร็จ:', error); setLeaveDrafts({}); return }
        setLeaveDrafts(Object.fromEntries((data || []).map((x: any) => [String(x.staff_directory_id), {
          personal_leave_days: String(x.personal_leave_days ?? 0), sick_leave_days: String(x.sick_leave_days ?? 0), annual_leave_days: String(x.annual_leave_days ?? 0)
        }])))
      })
    return () => { alive = false }
  }, [sb, unit, month])
  useEffect(() => { let alive = true; sb.from('pay_groups').select('id,full_amount').order('id').then(({ data, error }: any) => { if (alive) setPayGroups(!error && Array.isArray(data) ? data : []) }); return () => { alive = false } }, [sb])
  useEffect(() => {
    let alive = true
    const unitName = (units || []).find((u: any) => Number(u.id) === Number(unit))?.name
    const parentGroup = (units || []).find((u: any) => Number(u.id) === Number(unit))?.parent_group || ''
    if (!unit || !unitName) { setDirectoryPeople([]); setSignaturePeople([]); setUnitRate(0); return }
    const normalizeUnit = (v: any) => String(v || '').normalize('NFC').replace(/\s+/g, '').trim().toLocaleLowerCase('th')
    const unitKey = normalizeUnit(unitName)
    const splitNames = (v: any) => String(v || '').split(/[,;|]/).map(normalizeUnit).filter(Boolean)
    const loadDirectoryRoster = async () => {
      // ดึงทั้ง RPC และทะเบียนกลางโดยตรง เพื่อไม่ให้รายชื่อที่ไม่มีบัญชีใช้งานหายไปเมื่อ RPC ล้มเหลว
      const rpcPromise = sb.rpc('directory_staff', { p_unit_name: unitName })
        .then(({ data, error }: any) => {
          if (error) { console.error('โหลด directory_staff ไม่สำเร็จ', error); return [] }
          return Array.isArray(data) ? data.filter((d: any) => d.active !== false) : []
        }).catch((error: any) => { console.error('โหลด directory_staff ไม่สำเร็จ', error); return [] })
      const fetchAllActive = async () => {
        const all: any[] = []
        const pageSize = 1000
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await sb.from('staff_directory')
            .select('source_row,prefix,first_name,last_name,position,org_role,unit_name,extra_unit_names,nursing_group,extra_nursing_group_names,active')
            .eq('active', true).range(offset, offset + pageSize - 1)
          if (error) { console.error('โหลดทะเบียน staff_directory ไม่สำเร็จ', error); break }
          const page = Array.isArray(data) ? data : []
          all.push(...page)
          if (page.length < pageSize) break
        }
        // การจัดสังกัดยึดหน่วยงานหลักเท่านั้น ไม่ใช้หน่วยงาน/กลุ่มงานเพิ่มเติมในการจัดรายชื่อซ้ำ
        return all.filter((d: any) => normalizeUnit(d.unit_name) === unitKey)
      }
      const [rpcRows, directRows] = await Promise.all([rpcPromise, fetchAllActive()])
      if (!alive) return
      const personKey = (d: any) => normalizeUnit(d.full_name || `${d.prefix || ''}${d.first_name || ''} ${d.last_name || ''}`)
      const samePerson = (a: any, b: any) =>
        (a.source_row != null && b.source_row != null && Number(a.source_row) === Number(b.source_row)) ||
        (a.person_id != null && b.person_id != null && String(a.person_id) === String(b.person_id)) ||
        (!!personKey(a) && personKey(a) === personKey(b))
      // ใช้ทะเบียนหลักเป็นตัวกำหนดสมาชิกของหน่วยงาน แล้วรับข้อมูลจาก RPC เฉพาะคนที่อยู่ในทะเบียนหลักชุดเดียวกัน
      // เพื่อไม่ให้ RPC เพิ่มคนจาก extra_unit_names เข้ามาเป็นสมาชิกหน่วยงานอื่น
      const primaryRows = directRows.map((d: any) => {
        const extra = rpcRows.find((r: any) => samePerson(r, d))
        return extra ? { ...extra, ...d } : d
      })
      const unique = primaryRows.filter((d: any, i: number, arr: any[]) =>
        arr.findIndex((x: any) => samePerson(x, d)) === i
      )
      setDirectoryPeople(unique)
    }
    loadDirectoryRoster()
    // ใช้ทะเบียนบุคลากรเป็นแหล่งข้อมูลผู้ลงนาม ไม่ต้องมีบัญชีผู้ใช้ และใช้ RPC กลุ่มงานเพื่อรวมหัวหน้ากลุ่มงานที่ unit_name เป็น NULL
    const signerLookup = parentGroup
      ? sb.rpc('directory_group_staff', { p_group_name: parentGroup })
      : sb.rpc('directory_staff', { p_unit_name: unitName })
    // โหลดหัวหน้าทุกหน่วย/กลุ่มจากทะเบียนกลางด้วย เพื่อให้ลงนามได้แม้ผู้รับผิดชอบหลักอยู่อีกหน่วยหรืออีกกลุ่ม
    const allLeadersLookup = sb.from('staff_directory')
      .select('source_row,prefix,first_name,last_name,position,org_role,unit_name,extra_unit_names,nursing_group,extra_nursing_group_names,active')
      .eq('active', true)
      .or('org_role.ilike.%หัวหน้างาน%,org_role.ilike.%หัวหน้ากลุ่มงาน%')
    Promise.all([signerLookup, allLeadersLookup]).then(([groupResult, leadersResult]: any[]) => {
      if (!alive) return
      const local = !groupResult.error && Array.isArray(groupResult.data) ? groupResult.data : []
      const leaders = !leadersResult.error && Array.isArray(leadersResult.data) ? leadersResult.data : []
      const merged = [...local, ...leaders]
      setSignaturePeople(merged.filter((d: any, i: number, a: any[]) =>
        a.findIndex((x: any) => Number(x.source_row) === Number(d.source_row)) === i
      ))
    })
    sb.from('staff_directory').select('prefix,first_name,last_name,position,org_role,unit_name').eq('active', true).or('org_role.ilike.%รักษาการหัวหน้าภารกิจด้านการพยาบาล%,org_role.ilike.%รักษาการหัวหน้าพยาบาล%').limit(20).then(({ data, error }: any) => {
      if (!alive || error || !Array.isArray(data)) return
      const chief = data.find((d: any) => String(d.org_role || '').includes('รักษาการหัวหน้าภารกิจด้านการพยาบาล')) || data.find((d: any) => String(d.org_role || '').includes('รักษาการหัวหน้าพยาบาล'))
      if (chief) setActingChief({ name: `${chief.prefix || ''}${chief.first_name || ''} ${chief.last_name || ''}`.trim(), position: chief.position || '' })
    })
    const monthDate = month + '-01'
    sb.from('unit_settings').select('baht_per_point').eq('unit_id', unit).eq('month', monthDate).maybeSingle().then(({ data, error }: any) => {
      if (!alive) return
      setUnitRate(!error && data ? Number(data.baht_per_point || 0) : 0)
    })
    return () => { alive = false }
  }, [sb, unit, month, units])
  const roster = useMemo(() => {
    const result = (people || []).filter((p: any) => Number(p.unit_id) === Number(unit)).map((p: any) => ({ ...p }))
    for (const d of directoryPeople) {
      const fullName = String(d.full_name || `${d.prefix || ''}${d.first_name || ''} ${d.last_name || ''}`).trim()
      const found = result.find((p: any) => (d.person_id && p.id === d.person_id) || (p.staff_directory_id && Number(p.staff_directory_id) === Number(d.source_row)) || String(p.name || '').trim() === fullName)
      if (found) { found.org_role = found.org_role || d.org_role; found.staff_directory_id = found.staff_directory_id || d.source_row; found.fromDirectory = d.registered !== true; if (!found.position) found.position = d.position }
      else result.push({ id: d.person_id || `dir:${d.source_row}`, directory_source_row: d.source_row, staff_directory_id: d.source_row, name: fullName, prefix: d.prefix, first_name: d.first_name, last_name: d.last_name, position: d.position, org_role: d.org_role, unit_id: unit, active: true, fromDirectory: d.registered !== true })
    }
    return result.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'th'))
  }, [people, directoryPeople, unit])
  const rows = useMemo(() => rowsAll.filter((r: any) => r.status !== 'draft'), [rowsAll])   // แบบร่างยังไม่ถึงหัวหน้า
  const [sel, setSel] = useState<string>('')
  const sum = useMemo(() => {
    const positionRank = (p: any) => {
      // Normalize Unicode, whitespace and parentheses so DB labels with/without spaces match consistently.
      const normalize = (value: any) => String(value || '').normalize('NFC').replace(/[\s　]+/g, '').replace(/[()（）]/g, '').trim()
      const role = normalize(p.org_role)
      const pos = normalize(p.position)
      if (role.includes('หัวหน้ากลุ่มงาน')) return 0
      if (role.includes('หัวหน้างาน')) return 1
      if (pos.includes('พยาบาลวิชาชีพ') && !pos.includes('นักวิชาการสาธารณสุข')) {
        if (pos.includes('ชำนาญการพิเศษ')) return 2
        if (pos.includes('ชำนาญการ')) return 3
        if (pos.includes('ปฏิบัติการ')) return 4
        return 5
      }
      if (pos.includes('นักวิชาการสาธารณสุข')) {
        if (pos.includes('พยาบาลวิชาชีพ')) return 6
        if (pos.includes('พาราเมดิก')) return 7
        return 8
      }
      if (pos.includes('เจ้าพนักงานสาธารณสุขชำนาญงาน') && pos.includes('EMT')) return 9
      // ชื่อใน staff_directory จริงคือ "เจ้าพนักงานสาธารณสุขปฏิบัติงาน (EMT)"
      if (pos.includes('เจ้าพนักงานสาธารณสุขปฏิบัติงาน') && pos.includes('EMT')) return 10
      if (pos.includes('เจ้าพนักงานสาธารณสุข') && pos.includes('EMT')) return 11
      const ordered = ['พนักงานช่วยเหลือคนไข้','พนักงานประจำตึก','พนักงานเปล','พนักงานธุรการ','ผู้ช่วยช่างทั่วไป']
      const idx = ordered.findIndex((title) => pos.includes(normalize(title)))
      return idx < 0 ? 99 : idx + 12
    }
    const sortedRoster = [...roster].sort((a: any, b: any) => positionRank(a) - positionRank(b) || String(a.name || '').localeCompare(String(b.name || ''), 'th'))
    return sortedRoster.map((p: any, index: number) => {
    const rs = rows.filter((r: any) => r.person_id === p.id); const g = guaranteeForPosition(p.position, positions, p.org_role)
    const approved = rs.filter((r: any) => r.status === 'approved')
    const d = (x: string) => rs.filter((r: any) => r.domain === x).reduce((s: number, r: any) => s + Number(r.counted_points), 0)
    const tot = d('บริหาร') + d('บริการ') + d('วิชาการ')
    const workPoints = approved.reduce((t: number, r: any) => t + Number(r.counted_points || 0), 0)
    const scoring = scoreBreakdown(p.position, positions, p.org_role, workPoints)
    const roleGuarantee = scoring.roleGuarantee
    const performancePoints = scoring.performance
    const excess = scoring.excess
    const days = new Set(approved.map((r: any) => String(r.work_date || '').slice(0, 10)).filter(Boolean)).size
    const positionInfo = (positions || []).find((x: any) => String(x.name || '').replace(/\s+/g, '').trim() === String(p.position || '').replace(/\s+/g, '').trim())
    const allocation = Number(payGroups.find((x: any) => Number(x.id) === Number(positionInfo?.pay_group))?.full_amount || 0)
    const basePay = allocation * (performancePoints >= g ? 0.97 : 0.77)
    const payout = basePay + excess * unitRate
    return { p, order: index + 1, allocation, adm: d('บริหาร'), svc: d('บริการ'), acd: d('วิชาการ'), tot, workPoints, performancePoints, roleGuarantee, excess, days, rate: unitRate, basePay, payout, g, appr: workPoints, n: rs.length, err: rs.filter((r: any) => r.errors.length).length,
      warn: rs.filter((r: any) => r.warnings.length).length, pend: rs.filter((r: any) => r.status === 'pending').length }
    })
  }, [rows, roster, positions, unitRate, payGroups])
  const avg = (pos: string) => { const a = sum.filter((x: any) => x.p.position === pos && x.tot > 0); return a.length ? a.reduce((s: number, x: any) => s + x.tot, 0) / a.length : 0 }
  const saveLeaveData = async (person: any) => {
    const staffId = Number(person.staff_directory_id ?? person.directory_source_row)
    if (!staffId) { alert('ไม่พบรหัสบุคลากรจากทะเบียนกลาง จึงยังบันทึกข้อมูลวันลาไม่ได้'); return }
    const draft = leaveDrafts[String(staffId)] || {}
    const values: any = {}
    for (const field of ['personal_leave_days', 'sick_leave_days', 'annual_leave_days']) {
      const raw = String(draft[field] ?? '0').trim()
      const value = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(value) || value < 0) { setLeaveMessages(v => ({ ...v, [staffId]: 'กรุณากรอกจำนวนวันลาเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' })); return }
      values[field] = value
    }
    setLeaveSaving(v => ({ ...v, [staffId]: true })); setLeaveMessages(v => ({ ...v, [staffId]: '' }))
    const { error } = await sb.from('p4p_monthly_leave').upsert({ staff_directory_id: staffId, unit_id: Number(unit), month: month + '-01', ...values }, { onConflict: 'staff_directory_id,month' })
    setLeaveSaving(v => ({ ...v, [staffId]: false }))
    setLeaveMessages(v => ({ ...v, [staffId]: error ? 'บันทึกไม่สำเร็จ: ' + error.message : 'บันทึกแล้ว' }))
  }
  const selectedUnit = (units || []).find((u: any) => Number(u.id) === Number(unit))
  const unitName = selectedUnit?.name || ''
  const groupName = selectedUnit?.parent_group || ''
  const allocatedBudget = sum.reduce((v: number, x: any) => v + Number(x.allocation || 0), 0)
  const totalPaid = sum.reduce((v: number, x: any) => v + Number(x.payout || 0), 0)
  const signers = [...signaturePeople, ...directoryPeople]
  const monthText = month ? new Date(month + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : ''
  const unitHead = signers.find((d: any) => String(d.org_role || '').replace(/\s+/g, '').includes('หัวหน้างาน') && (String(d.unit_name || '').trim() === unitName || String(d.extra_unit_names || '').split(/[,;|]/).some((n: string) => n.trim() === unitName)))
  const groupHead = signers.find((d: any) => String(d.org_role || '').replace(/\s+/g, '').includes('หัวหน้ากลุ่มงาน') && [d.nursing_group, d.extra_nursing_group_names].some((groups: any) => String(groups || '').split(/[,;|]/).some((g: string) => g.trim() === groupName)))
  const signerName = (d: any) => d?.full_name || ((d?.prefix || '') + (d?.first_name || '') + ' ' + (d?.last_name || '')).trim()
  const unitHeadName = signerName(unitHead)
  const groupHeadName = signerName(groupHead)
  useEffect(() => {
    if (!printReport) return
    const afterPrint = () => { document.body.classList.remove('print-unit-report', 'unit-report-preview-open'); setPrintReport(false) }
    window.addEventListener('afterprint', afterPrint)
    return () => { window.removeEventListener('afterprint', afterPrint) }
  }, [printReport])
  const printUnitReport = () => {
    if (!unit || !sum.length) { alert('ไม่พบข้อมูลรายงานของหน่วยงาน กรุณาเลือกหน่วยงานและตรวจสอบข้อมูลก่อน'); return }
    // เปิดหน้าตัวอย่างโดยล้างคลาสพิมพ์เก่าทุกโหมดก่อน ป้องกัน CSS รายงานรายบุคคลมาบังรายงานหน่วยงาน
    document.body.classList.remove('print-unit-report', 'print-individual-report', 'unit-report-preview-open')
    document.body.classList.add('unit-report-preview-open')
    setPrintReport(true)
  }
  const startUnitReportPrint = () => {
    // แยกโหมดพิมพ์รายงานหน่วยงานออกจากรายงานรายบุคคล
    document.body.classList.remove('unit-report-preview-open', 'print-individual-report')
    document.body.classList.add('print-unit-report')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
  }
  const closeUnitReportPreview = () => {
    document.body.classList.remove('print-unit-report', 'unit-report-preview-open')
    setPrintReport(false)
  }
  const bulk = async () => {
    const ids = rows.filter((r: any) => r.status === 'pending' && !r.errors.length && !r.warnings.length && canDecideRow(ap, me, r)).map((r: any) => r.id)
    if (!ids.length) return alert('ไม่มีรายการ ✓ ที่รอรับรอง')
    if (confirm(`รับรอง ${ids.length} รายการที่ผ่านการตรวจอัตโนมัติ (✓) ทั้งหมด?`)) { await sb.from('logs').update({ status: 'approved' }).in('id', ids); reload() }
  }
  const csv = () => {
    const h = ['ลำดับ', 'ชื่อ-สกุล', 'ตำแหน่งที่ปฏิบัติงาน', 'แต้มประกัน/เดือน', 'วันทำการ/เดือน', 'แต้มการันตี', 'แต้มการปฏิบัติงาน', 'รวมผลการปฏิบัติงาน', 'แต้มที่ได้มากกว่าแต้มประกัน', 'จำนวนเงิน/แต้ม', 'จำนวนเงินตามผลงานที่ได้รับ', 'จำนวนเงินที่ได้รับ']
    const b = sum.map((x: any) => [x.order, x.p.name, x.p.position, x.g, x.days, x.roleGuarantee, x.workPoints, x.performancePoints, x.excess, x.rate, x.basePay, x.payout])
    const blob = new Blob(['\ufeff' + [h, ...b].map(r => r.join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `p4p_${month}.csv`; a.click()
  }
  const shown = sel ? rows.filter((r: any) => r.person_id === sel) : rows
  const stat = (l: string, v: any) => <div className="card text-center"><div className="text-xs text-stone-600">{l}</div><div className="text-xl font-bold">{v}</div></div>
  const certificationRows = useMemo(() => rows.filter((r: any) =>
    r.status === 'pending' &&
    canDecideRow(ap, me, r) &&
    (!certificationSearch.trim() || String(r.person_name || roster.find((p: any) => p.id === r.person_id)?.name || '').toLocaleLowerCase('th').includes(certificationSearch.trim().toLocaleLowerCase('th')))
  ), [rows, ap, me, roster, certificationSearch])
  return <div className="space-y-4">
    {!certificationOnly && <>
      {!reportOnly && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {stat('บุคลากร', roster.length)}{stat('รายการไม่นับแต้ม', rows.filter((r: any) => r.errors.length).length)}{stat('รายการต้องตรวจทาน', rows.filter((r: any) => r.warnings.length).length)}
        {stat('รายการรอรับรอง', rows.filter((r: any) => r.status === 'pending').length)}{stat('คะแนนที่รับรองแล้ว', nf(sum.reduce((t: number, x: any) => t + x.appr, 0)))}
      </div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={printUnitReport} disabled={!unit || !sum.length}>พิมพ์รายงานหน่วยงาน</button>
        <button type="button" className="btn sec" onClick={csv}>ส่งออก CSV</button>
        {reportOnly && <button type="button" className={leaveReportOpen ? 'btn sec' : 'btn'} onClick={() => setLeaveReportOpen(v => !v)}>{leaveReportOpen ? 'กลับสรุปรายงานหน่วยงาน' : 'สรุปผลการปฏิบัติงาน (เอกสารส่งเบิก)'}</button>}
      </div>
      {leaveReportOpen && reportOnly && <div className="space-y-3">
        <div className="card space-y-1"><h2 className="text-lg font-bold">สรุปผลการปฏิบัติงาน (เอกสารส่งเบิก)</h2><p className="text-sm text-stone-600">{unitName} · ประจำเดือน {monthText} · วันปฏิบัติงานนับจากวันที่มีการส่งบันทึกกิจกรรม (ไม่นับแบบร่าง)</p></div>
        <div className="card overflow-x-auto p-0"><table className="w-full min-w-[1050px]"><thead><tr><th>ลำดับ</th><th>ชื่อ-สกุล</th><th>ตำแหน่งที่ปฏิบัติงาน</th><th>จำนวนวันปฏิบัติงาน</th><th>ลากิจ (วัน)</th><th>ลาป่วย (วัน)</th><th>ลาพักผ่อน (วัน)</th><th>บันทึกข้อมูล</th><th>พิมพ์</th></tr></thead><tbody>
          {sum.map((x: any) => {
            const staffId = Number(x.p.staff_directory_id ?? x.p.directory_source_row)
            const key = String(staffId || '')
            const draft = leaveDrafts[key] || { personal_leave_days: '0', sick_leave_days: '0', annual_leave_days: '0' }
            const workDays = new Set(rows.filter((r: any) => String(r.person_id) === String(x.p.id)).map((r: any) => String(r.work_date || '').slice(0, 10)).filter(Boolean)).size
            const setLeave = (field: string, value: string) => setLeaveDrafts(v => ({ ...v, [key]: { ...(v[key] || draft), [field]: value } }))
            return <tr key={x.p.id}>
              <td className="text-center">{x.order}</td><td className="font-semibold">{x.p.name}</td><td>{x.p.position || '—'}</td><td className="text-center font-semibold">{workDays}</td>
              <td><input aria-label={'ลากิจของ ' + x.p.name} type="number" min="0" step="0.5" className="inp !w-24" value={draft.personal_leave_days} onChange={e => setLeave('personal_leave_days', e.target.value)} /></td>
              <td><input aria-label={'ลาป่วยของ ' + x.p.name} type="number" min="0" step="0.5" className="inp !w-24" value={draft.sick_leave_days} onChange={e => setLeave('sick_leave_days', e.target.value)} /></td>
              <td><input aria-label={'ลาพักผ่อนของ ' + x.p.name} type="number" min="0" step="0.5" className="inp !w-24" value={draft.annual_leave_days} onChange={e => setLeave('annual_leave_days', e.target.value)} /></td>
              <td><button type="button" className="btn !py-1" disabled={!staffId || !!leaveSaving[key]} onClick={() => saveLeaveData(x.p)}>{leaveSaving[key] ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button>{leaveMessages[key] && <div className={'mt-1 text-xs ' + (leaveMessages[key].startsWith('บันทึกแล้ว') ? 'text-emerald-700' : 'text-red-700')}>{leaveMessages[key]}</div>}</td>
              <td><button type="button" className="btn sec !py-1" onClick={() => setPrintingPerson({ ...x.p, staff_directory_id: staffId || x.p.staff_directory_id })}>พิมพ์</button></td>
            </tr>
          })}
          {!sum.length && <tr><td colSpan={9} className="py-6 text-center text-stone-500">ไม่พบรายชื่อบุคลากรในหน่วยงานนี้</td></tr>}
        </tbody></table></div>
      </div>}
      {!leaveReportOpen && <>
          <div className="card overflow-x-auto p-0"><table className="w-full min-w-[1250px]"><thead><tr><th rowSpan={2}>ลำดับ</th><th rowSpan={2}>ชื่อ-สกุล</th><th rowSpan={2}>ตำแหน่งที่ปฏิบัติงาน</th><th rowSpan={2}>แต้มประกัน/เดือน</th><th rowSpan={2}>วันทำการ/เดือน</th><th colSpan={2}>ผลการปฏิบัติงาน/เดือน</th><th rowSpan={2}>รวมผลการปฏิบัติงาน</th><th rowSpan={2}>แต้มที่ได้มากกว่า<br/>แต้มประกัน</th><th rowSpan={2}>จำนวนเงิน/แต้ม</th><th rowSpan={2} className="unit-col-base-pay">จำนวนเงิน<br/>ตามผลงาน</th><th rowSpan={2} className="unit-col-payout-received">จำนวนเงิน<br/>ที่ได้รับ</th></tr><tr><th>แต้มการันตี</th><th>แต้มการ<br/>ปฏิบัติงาน</th></tr></thead>
      <tbody>{sum.map((x: any) => <tr key={x.p.id} onClick={() => setDetailFor(x.p)} className="cursor-pointer hover:bg-teal-50">
          <td className="text-center">{x.order}</td><td><b>{x.p.name}</b>{x.p.fromDirectory && <div className="text-xs text-stone-500">ยังไม่ลงทะเบียนใช้งาน</div>}</td><td className="text-xs">{x.p.position || '—'}</td><td className="text-center">{nf(x.g, 0)}</td><td className="text-center">{nf(x.days, 0)}</td><td className="text-center">{nf(x.roleGuarantee)}</td><td className="text-center">{nf(x.workPoints)}</td><td className="text-center font-semibold">{nf(x.performancePoints)}</td><td className="text-center">{nf(x.excess)}</td><td className="text-center">{nf(x.rate)}</td><td className="text-center">{nf(x.basePay)}</td><td className="text-center font-semibold">{nf(x.payout)}</td>
        </tr>)}
        <tr className="font-bold"><td colSpan={3}>รวมทั้งหน่วย</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.g, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.days, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.roleGuarantee, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.workPoints, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.performancePoints, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.excess, 0))}</td><td className="text-center">—</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.basePay, 0))} บาท</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.payout, 0))} บาท</td></tr></tbody></table></div>
          {printReport && createPortal(<div className="unit-report-print">
      <div className="unit-report-toolbar no-print"><span>ตัวอย่างก่อนพิมพ์</span><button type="button" className="btn" onClick={startUnitReportPrint}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์</button><button type="button" className="btn sec" onClick={closeUnitReportPreview}>ปิด</button></div>
      <table className="unit-report-table"><colgroup><col className="unit-col-order" /><col className="unit-col-name" /><col className="unit-col-position" /><col className="unit-col-guarantee" /><col className="unit-col-days" /><col className="unit-col-role-guarantee" /><col className="unit-col-work" /><col className="unit-col-performance-total" /><col className="unit-col-excess" /><col className="unit-col-rate" /><col className="unit-col-base-pay" /><col className="unit-col-payout" /><col className="unit-col-signature" /><col className="unit-col-date" /></colgroup><thead><tr className="unit-report-heading-row"><th colSpan={14}><h1>แบบสรุปผลการปฏิบัติงาน งาน{unitName.replace(/^งาน/, '')} กลุ่มงาน{groupName.replace(/^กลุ่มงาน/, '')}</h1><div className="unit-report-subtitle"><span>ประจำเดือน {month ? new Date(month + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long' }) : '........................'} พ.ศ. {month ? Number(month.slice(0,4)) + 543 : '........'}</span><span>งบประมาณที่ได้จัดสรร ........................ บาท</span></div></th></tr><tr><th rowSpan={2}>ลำดับ</th><th rowSpan={2}>ชื่อ-สกุล</th><th rowSpan={2}>ตำแหน่งที่ปฏิบัติงาน</th><th rowSpan={2}>แต้มประกัน/เดือน</th><th rowSpan={2}>วันทำการ/เดือน</th><th colSpan={2}>ผลการปฏิบัติงาน/เดือน</th><th rowSpan={2}>รวมผลการปฏิบัติงาน</th><th rowSpan={2}>แต้มที่ได้มากกว่า<br/>แต้มประกัน</th><th rowSpan={2}>จำนวนเงิน/แต้ม</th><th rowSpan={2}>จำนวนเงิน<br/>ตามผลงาน</th><th rowSpan={2} className="unit-col-payout-received">จำนวนเงินที่ได้รับ</th><th rowSpan={2}>ลายมือชื่อผู้รับเงิน</th><th rowSpan={2} className="unit-col-date">วัน/เดือน/ปี<br/>ที่ได้รับเงิน</th></tr><tr><th>แต้มการันตี</th><th>แต้มการ<br/>ปฏิบัติงาน</th></tr></thead><tbody>{sum.map((x: any) => <tr key={x.p.id}><td>{x.order}</td><td className="unit-report-name">{x.p.name}</td><td className="unit-report-position">{String(x.p.position || '—').replace(/[\\s　]+/g, ' ').trim()}</td><td>{nf(x.g, 0)}</td><td>{nf(x.days, 0)}</td><td>{nf(x.roleGuarantee)}</td><td>{nf(x.workPoints)}</td><td>{nf(x.performancePoints)}</td><td>{nf(x.excess)}</td><td>{nf(x.rate)}</td><td>{nf(x.basePay)}</td><td>{nf(x.payout)}</td><td className="unit-report-sign-cell"></td><td className="unit-report-date-cell"></td></tr>)}<tr className="unit-report-total"><td colSpan={3}>รวมทั้งหน่วยงาน</td><td>{nf(sum.reduce((v: number, x: any) => v + x.g, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.days, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.roleGuarantee, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.workPoints, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.performancePoints, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.excess, 0))}</td><td>—</td><td>{nf(sum.reduce((v: number, x: any) => v + x.basePay, 0))}</td><td>{nf(sum.reduce((v: number, x: any) => v + x.payout, 0))}</td><td></td><td></td></tr></tbody></table>
      <div className="unit-report-grand-total">รวมจ่ายทั้งสิ้น {nf(totalPaid)} บาท ({thaiBahtText(totalPaid)})</div>
      <div className="unit-report-certification">ขอรับรองว่าผู้มีรายนามข้างต้น ได้ปฏิบัติงานจริง</div>
      <div className="unit-report-signatures">
        <div>ลงชื่อ ................................................<br/>({unitHeadName || '................................................'})<div>{unitHead?.position || ''}</div><b>หัวหน้า{unitName}</b></div>
        <div>ลงชื่อ ................................................<br/>({groupHeadName || '................................................'})<div>{groupHead?.position || ''}</div><b>หัวหน้ากลุ่มงาน{groupName.replace(/^กลุ่มงาน/, '')}</b></div>
        <div>ลงชื่อ ................................................<br/>(................................................)<div>ผู้จ่ายเงิน</div></div>
      </div>
      <div className="unit-report-approver">ลงชื่อ ........................................................ ผู้อนุมัติ<br/>(นายพันธ์นพ ควรดำรงธรรม)<br/>ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</div>
    </div>, document.body)}
      </>}
    </>}
    {certificationOnly && <>
      <div className="card space-y-3">
        <div><h2 className="font-bold text-lg">รายการกิจกรรมที่รอรับรอง</h2><p className="text-sm text-stone-600">แสดงรายการที่อยู่ในขอบเขตสิทธิ์การรับรองของคุณในหน่วยงานที่เลือก</p></div>
        <label className="block space-y-1"><span className="field-label">ค้นหาชื่อเจ้าหน้าที่</span><input className="inp w-full" type="search" value={certificationSearch} onChange={e => setCertificationSearch(e.target.value)} placeholder="พิมพ์ชื่อ-สกุลเจ้าหน้าที่ที่ต้องการค้นหา" /></label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>รายการที่รับรองได้ {certificationRows.length.toLocaleString('th-TH')} รายการ</span><button type="button" className="btn sec" onClick={() => setCertificationSearch('')}>ล้างคำค้นหา</button></div>
      </div>
      <LogTable sb={sb} rows={certificationRows} reload={reload} canApprove={!audit} readOnly={!!audit} acts={acts} month={month} />
    </>}
    {!reportOnly && !certificationOnly && <>
      <p className="text-sm text-stone-700">ลำดับการรับรอง: เจ้าหน้าที่ → หัวหน้างาน → หัวหน้ากลุ่มงาน → รักษาการหัวหน้าพยาบาล · <b>คุณรับรองได้เฉพาะรายการในขอบเขตสิทธิ์ของคุณ</b></p>
      <div className="flex gap-2">{!audit && <button className="btn" onClick={bulk}>รับรองทุกรายการที่ ✓ ผ่าน</button>}<button className="btn sec" onClick={csv}>ส่งออก CSV</button><button className="btn" onClick={printUnitReport} disabled={!unit || !sum.length}>พิมพ์รายงานหน่วยงาน</button></div>
          <div className="card overflow-x-auto p-0"><table className="w-full min-w-[1250px]"><thead><tr><th rowSpan={2}>ลำดับ</th><th rowSpan={2}>ชื่อ-สกุล</th><th rowSpan={2}>ตำแหน่งที่ปฏิบัติงาน</th><th rowSpan={2}>แต้มประกัน/เดือน</th><th rowSpan={2}>วันทำการ/เดือน</th><th colSpan={2}>ผลการปฏิบัติงาน/เดือน</th><th rowSpan={2}>รวมผลการปฏิบัติงาน</th><th rowSpan={2}>แต้มที่ได้มากกว่าแต้มประกัน</th><th rowSpan={2}>จำนวนเงิน/แต้ม</th><th rowSpan={2}>จำนวนเงินตามผลงานที่ได้รับ</th><th rowSpan={2}>จำนวนเงินที่ได้รับ</th></tr><tr><th>แต้มการันตี</th><th>แต้มการปฏิบัติงาน</th></tr></thead>
      <tbody>{sum.map((x: any) => <tr key={x.p.id} onClick={() => setDetailFor(x.p)} className="cursor-pointer hover:bg-teal-50">
          <td className="text-center">{x.order}</td><td><b>{x.p.name}</b>{x.p.fromDirectory && <div className="text-xs text-stone-500">ยังไม่ลงทะเบียนใช้งาน</div>}</td><td className="text-xs">{x.p.position || '—'}</td><td className="text-center">{nf(x.g, 0)}</td><td className="text-center">{nf(x.days, 0)}</td><td className="text-center">{nf(x.roleGuarantee)}</td><td className="text-center">{nf(x.workPoints)}</td><td className="text-center font-semibold">{nf(x.performancePoints)}</td><td className="text-center">{nf(x.excess)}</td><td className="text-center">{nf(x.rate)}</td><td className="text-center">{nf(x.basePay)}</td><td className="text-center font-semibold">{nf(x.payout)}</td>
        </tr>)}
        <tr className="font-bold"><td colSpan={3}>รวมทั้งหน่วย</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.g, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.days, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.roleGuarantee, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.workPoints, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.performancePoints, 0))}</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.excess, 0))}</td><td className="text-center">—</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.basePay, 0))} บาท</td><td className="text-center">{nf(sum.reduce((s: number, x: any) => s + x.payout, 0))} บาท</td></tr></tbody></table></div>
          {printReport && createPortal(<div className="unit-report-print">
      <div className="unit-report-toolbar no-print"><span>ตัวอย่างก่อนพิมพ์</span><button type="button" className="btn" onClick={startUnitReportPrint}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์</button><button type="button" className="btn sec" onClick={closeUnitReportPreview}>ปิด</button></div>
      <table className="unit-report-table"><colgroup><col className="unit-col-order" /><col className="unit-col-name" /><col className="unit-col-position" /><col className="unit-col-guarantee" /><col className="unit-col-days" /><col className="unit-col-role-guarantee" /><col className="unit-col-work" /><col className="unit-col-performance-total" /><col className="unit-col-excess" /><col className="unit-col-rate" /><col className="unit-col-base-pay" /><col className="unit-col-payout" /></colgroup><thead><tr className="unit-report-heading-row"><th colSpan={12}><h1>แบบสรุปผลการปฏิบัติงาน (Pay for Performance: P4P)</h1><div className="unit-report-subtitle">{unitName}　 {groupName || '................................'}　 ประจำเดือน {monthText}</div></th></tr><tr><th rowSpan={2}>ลำดับ</th><th rowSpan={2}>ชื่อ - สกุล</th><th rowSpan={2}>ตำแหน่งที่ปฏิบัติงาน</th><th rowSpan={2}>แต้มประกัน/เดือน</th><th rowSpan={2}>วันทำการ/เดือน</th><th colSpan={2}>ผลการปฏิบัติงาน/เดือน</th><th rowSpan={2}>รวมผลการปฏิบัติงาน</th><th rowSpan={2}>แต้มที่ได้มากกว่าแต้มประกัน</th><th rowSpan={2}>จำนวนเงิน/แต้ม</th><th rowSpan={2}>จำนวนเงินตามผลงานที่ได้รับ</th><th rowSpan={2}>จำนวนเงินที่ได้รับ</th></tr><tr><th>แต้มการันตี</th><th>แต้มการปฏิบัติงาน</th></tr></thead><tbody>{sum.map((x:any)=><tr key={x.p.id}><td>{x.order}</td><td className="unit-report-name">{x.p.name}</td><td>{x.p.position||'—'}</td><td>{nf(x.g,0)}</td><td>{nf(x.days,0)}</td><td>{nf(x.roleGuarantee)}</td><td>{nf(x.workPoints)}</td><td>{nf(x.performancePoints)}</td><td>{nf(x.excess)}</td><td>{nf(x.rate)}</td><td>{nf(x.basePay)}</td><td>{nf(x.payout)}</td></tr>)}<tr className="unit-report-total"><td colSpan={3}>รวมทั้งหน่วยงาน</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.g,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.days,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.roleGuarantee,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.workPoints,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.performancePoints,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.excess,0))}</td><td>—</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.basePay,0))}</td><td>{nf(sum.reduce((v:number,x:any)=>v+x.payout,0))}</td></tr></tbody></table>
      <div className="unit-report-signatures">
        <div>ลงชื่อ ........................................................<br/>({unitHeadName || '........................................................'})<div>{unitHead?.position || ''}</div><div><b>{'หัวหน้างาน' + String(unitName || '').replace(/^งาน/, '')}</b></div></div>
        <div>ลงชื่อ ........................................................<br/>({groupHeadName || '........................................................'})<div>{groupHead?.position || ''}</div><div><b>{'หัวหน้ากลุ่มงาน' + String(groupName || '').replace(/^กลุ่มงาน/, '')}</b></div></div>
        <div>ลงชื่อ ........................................................<br/>({actingChief.name})<div>{actingChief.position || 'พยาบาลวิชาชีพชำนาญการพิเศษ'}</div><div><b>รักษาการหัวหน้าภารกิจด้านการพยาบาล</b></div></div>
      </div>
    </div>, document.body)}
      <h2 className="font-bold">{sel ? 'รายการของ ' + roster.find((p: any) => p.id === sel)?.name + ' (คลิกแถวอีกครั้งเพื่อดูทั้งหมด)' : 'รายการทั้งหมดของหน่วยงาน'}</h2>
      <LogTable sb={sb} rows={shown} reload={reload} canApprove={!audit} readOnly={audit} acts={acts} />
    </>}
    {detailFor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label={`รายการกิจกรรมของ ${detailFor.name}`}><div className="w-full max-w-[96rem] max-h-[94vh] overflow-y-auto rounded-2xl bg-white p-3 shadow-2xl sm:p-5 space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">รายการกิจกรรมรายบุคคล</h2><p className="text-sm text-stone-600">{detailFor.name} · ประจำเดือน {monthText} · แสดงทุกสถานะ ยกเว้นฉบับร่าง</p></div><div className="flex flex-wrap gap-2">{canPrint && <button type="button" className="btn" onClick={() => setPrintingPerson(detailFor)}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์ใบสรุปรายบุคคล</button>}<button type="button" className="btn sec" onClick={() => setDetailFor(null)}>ปิด</button></div></div><LogTable sb={sb} rows={rows.filter((r: any) => r.status !== 'draft' && String(r.person_id) === String(detailFor.id))} reload={reload} canApprove={!audit} readOnly={!!audit} acts={acts} month={month} showName={false} /></div></div>}
    {printingPerson && <PrintSheet sb={sb} person={printingPerson} rows={rows.filter((r: any) => String(r.person_id) === String(printingPerson.id))} month={month} units={units} positions={positions} onClose={() => setPrintingPerson(null)} />}
  </div>
}

function GroupHeadsCertification({ sb, groupName, people, month, acts }: any) {
  const ap = useContext(ApproverCtx); const me = useContext(MeCtx)
  const [directoryRows, setDirectoryRows] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    sb.rpc('directory_group_staff', { p_group_name: groupName }).then(({ data, error }: any) => {
      if (!alive) return
      if (error) { console.error('โหลดหัวหน้ากลุ่มงานไม่สำเร็จ', error); setDirectoryRows([]) }
      else setDirectoryRows(Array.isArray(data) ? data.filter((d: any) => d.active !== false) : [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [sb, groupName])
  const norm = (v: any) => String(v || '').normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase('th')
  const groupHeads = useMemo(() => {
    const candidates = (people || []).filter((p: any) => Number(ap?.personLevel?.[p.id] || 0) === 2)
    return directoryRows.map((d: any) => {
      const name = d.full_name || `${d.prefix || ''}${d.first_name || ''} ${d.last_name || ''}`.trim()
      return candidates.find((p: any) =>
        (d.person_id && String(p.id) === String(d.person_id)) ||
        (d.source_row != null && p.staff_directory_id != null && Number(p.staff_directory_id) === Number(d.source_row)) ||
        (name && norm(p.name) === norm(name))
      )
    }).filter(Boolean).filter((p: any, i: number, a: any[]) => a.findIndex((x: any) => String(x.id) === String(p.id)) === i)
  }, [people, directoryRows, ap?.personLevel])
  const ids = useMemo(() => groupHeads.map((p: any) => String(p.id)), [groupHeads])
  const [rows, reload] = useLogs(sb, month, ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const filtered = rows.filter((r: any) => r.status === 'pending' && canDecideRow(ap, me, r) &&
    (!search.trim() || String(r.person_name || groupHeads.find((p: any) => String(p.id) === String(r.person_id))?.name || '').toLocaleLowerCase('th').includes(search.trim().toLocaleLowerCase('th'))))
  return <div className="space-y-4">
    <div className="card space-y-3">
      <div><h2 className="font-bold text-lg">รายการกิจกรรมของหัวหน้ากลุ่มงานที่รอรับรอง</h2><p className="text-sm text-stone-600">กลุ่มงาน {groupName} · รับรองได้โดยผู้มีสิทธิ์ระดับเหนือกว่าหัวหน้ากลุ่มงานเท่านั้น และไม่สามารถรับรองรายการของตนเอง</p></div>
      <input className="inp w-full" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อหัวหน้ากลุ่มงาน" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>หัวหน้ากลุ่มงาน {groupHeads.length} คน · รายการที่รับรองได้ {filtered.length.toLocaleString('th-TH')} รายการ</span><button type="button" className="btn sec" onClick={() => setSearch('')}>ล้างคำค้นหา</button></div>
      {loading && <p className="text-sm text-stone-500">กำลังโหลดรายชื่อหัวหน้ากลุ่มงาน…</p>}
      {!loading && groupHeads.length === 0 && <p className="text-sm text-amber-800">ไม่พบรายชื่อหัวหน้ากลุ่มงานที่เชื่อมโยงกับบัญชีบุคลากรในกลุ่มงานนี้ กรุณาตรวจสอบทะเบียนบุคลากรและสิทธิ์ระดับการรับรอง</p>}
      {!loading && groupHeads.length > 0 && filtered.length === 0 && <p className="text-sm text-stone-500">ไม่พบรายการกิจกรรมที่รอรับรองในขอบเขตสิทธิ์ของคุณ</p>}
    </div>
    <LogTable sb={sb} rows={filtered} reload={reload} canApprove={true} acts={acts} month={month} />
  </div>
}

function PeoplePage({ sb, people, unit, positions, reload }: any) {
  const [pf, setPf] = useState('นางสาว'); const [fn, setFn] = useState(''); const [ln, setLn] = useState(''); const [pos, setPos] = useState(''); const [sub, setSub] = useState(''); const [err, setErr] = useState('')
  const add = async () => {
    const { error } = await sb.from('people').insert({ prefix: pf, first_name: fn.trim(), last_name: ln.trim(), name: pf + fn.trim() + ' ' + ln.trim(), position: pos, unit_id: unit, sub_unit: sub || null })
    if (error) setErr(error.message); else { setFn(''); setLn(''); setSub(''); setErr(''); reload() }
  }
  const off = async (id: string) => { if (confirm('ปิดการใช้งานบุคลากรนี้ (ข้อมูลเดิมยังอยู่)?')) { await sb.from('people').update({ active: false }).eq('id', id); reload() } }
  return <div className="grid lg:grid-cols-[22rem_1fr] gap-4">
    <div className="card space-y-2 self-start"><h2 className="font-bold">เพิ่มบุคลากร</h2>
      <select className="inp" value={pf} onChange={e => setPf(e.target.value)}>{PREFIXES.map(x => <option key={x}>{x}</option>)}</select>
      <input className="inp" placeholder="ชื่อ" value={fn} onChange={e => setFn(e.target.value)} /><input className="inp" placeholder="สกุล" value={ln} onChange={e => setLn(e.target.value)} />
      <select className="inp" value={pos} onChange={e => setPos(e.target.value)}><option value="">เลือกตำแหน่ง</option>{positions.map((p: any) => <option key={p.name}>{p.name}</option>)}</select>
      <input className="inp" placeholder="งาน/หน่วยย่อย (ไม่บังคับ)" value={sub} onChange={e => setSub(e.target.value)} />
      <button className="btn" disabled={!fn || !ln || !pos} onClick={add}>เพิ่ม</button>{err && <p className="text-sm text-red-700">{err}</p>}
      <p className="text-xs text-stone-600">เมื่อเจ้าหน้าที่ลงทะเบียนด้วยชื่อ-สกุลและหน่วยงานที่ตรงกัน ระบบจะผูกบัญชีให้อัตโนมัติ</p></div>
    <div className="card p-0 overflow-x-auto"><table className="w-full"><thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>งานย่อย</th><th>บัญชี</th><th></th></tr></thead>
      <tbody>{people.map((p: any) => <tr key={p.id}><td>{p.name}</td><td>{p.position}</td><td>{p.sub_unit}</td><td>{p.user_id ? '✓ ผูกแล้ว' : '—'}</td><td><button className="text-xs underline" onClick={() => off(p.id)}>ปิดใช้งาน</button></td></tr>)}</tbody></table></div>
  </div>
}

const GLOBAL_SETTINGS: [string, string, string][] = [
  ['cap_shift_points', 'เพดานคะแนนต่อเวร (คะแนน) รวมแสตนด์เช้า', 'สูงสุด 90 คะแนนต่อเวร คะแนนเกินเพดานบันทึกได้แต่ไม่นับ นับรวมทุกด้าน (บริหาร บริการ วิชาการ)'],
  ['cap_day_points', 'เพดานคะแนนรวมต่อวัน (คะแนน)', 'เวรผลัดรวมทุกเวรในวันเดียวกัน (เวรดึก 00.00–08.00 นับเป็นวันที่นั้น)']
]

// ตั้งค่าระบบ (แอดมิน): ส่วนที่ 1 ใช้ทั้งระบบ  ส่วนที่ 2 ใช้ตามหน่วยงานและเดือน (เหมือนแผ่น "ตั้งค่า" ใน Excel)
function SettingsPage({ sb }: any) {
  const [g, setG] = useState<any>({}); const [gMsg, setGMsg] = useState('')
  useEffect(() => { sb.from('app_settings').select('key,value').then((r: any) => setG(Object.fromEntries((r.data || []).map((x: any) => [x.key, String(x.value)])))) }, [])
  const saveG = async () => {
    setGMsg('')
    for (const [k, l] of GLOBAL_SETTINGS) {
      const v = Number(g[k]); const ok = k === 'cap_shift_points' ? v > 0 && v <= 90 : k === 'cap_day_points' ? v > 0 && v <= 180 : v > 0 && v <= 10
      if (!(String(g[k] ?? '').trim() !== '' && ok)) { setGMsg(`ค่า "${l}" ไม่ถูกต้อง`); return }
    }
    if (!confirm('การเปลี่ยนค่าเหล่านี้มีผลกับการคำนวณแต้มของทุกหน่วยงานและทุกเดือน รวมรายการที่รับรองแล้วด้วย ยืนยันบันทึก?')) return
    const res = await Promise.all(GLOBAL_SETTINGS.map(([k]) => sb.from('app_settings').update({ value: Number(g[k]) }).eq('key', k)))
    const bad = res.find((r: any) => r.error)
    setGMsg(bad ? 'บันทึกไม่สำเร็จ: ' + bad.error.message : 'บันทึกแล้ว')
  }

  const gField = ([k, l, h]: [string, string, string]) => <label key={k} className="field-label block">{l}
    <input className="inp mt-1" inputMode="decimal" value={g[k] ?? ''} onChange={e => setG({ ...g, [k]: e.target.value })} />{h && <span className="field-hint block">{h}</span>}</label>
  return <div className="grid xl:grid-cols-2 gap-4 items-start">
    <div className="card space-y-3">
      <div><h2 className="text-lg font-bold">ตั้งค่าทั้งระบบ</h2><p className="text-sm text-stone-600">ใช้กับทุกหน่วยงานและทุกเดือน</p></div>
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">แต้มคำนวณสดจากค่าเหล่านี้ การแก้ตัวคูณมีผลกับแต้มของเดือนที่ผ่านมาและรายการที่รับรองแล้วด้วย ควรแก้เมื่อไม่มีการจ่ายเงินค้างอยู่</p>
      {GLOBAL_SETTINGS.map(gField)}
      <div className="flex items-center gap-3"><button className="btn" onClick={saveG}>บันทึกการตั้งค่า</button>{gMsg && <span role="status" className="text-sm text-teal-900">{gMsg}</span>}</div>
    </div>
    <PayGroupsCard sb={sb} />
  </div>
}

// กลุ่มวิชาชีพและยอดค่าตอบแทน (ตารางที่ 1 / 1ก / 1ข ของหลักเกณฑ์) + จับคู่ตำแหน่งกับกลุ่ม
function PayGroupsCard({ sb }: any) {
  const [gs, setGs] = useState<any[]>([]); const [pos, setPos] = useState<any[]>([]); const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [draft, setDraft] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const load = () => { sb.from('pay_groups').select('*').order('id').then((r: any) => setGs(r.data || [])); sb.from('positions').select('name,pay_group,grp,rate,guarantee').order('pay_group').then((r: any) => setPos(r.data || [])) }
  useEffect(load, [])
  const fields: [string, string][] = [['rate', 'แต้ม/นาที'], ['guarantee', 'แต้มประกัน'], ['cap_mult', 'เพดาน (เท่า)'], ['full_amount', 'ยอดจัดสรรต่อคน (บาท)'], ['reserve_pct', 'เงินกันเฉลี่ยคืน %']]
  const save = async () => {
    if (!editing || !draft) return
    const body: any = {}
    for (const [k, label] of fields) {
      const v = Number(draft[k])
      if (!(v > 0)) { setMsg(`กลุ่ม ${editing.id}: ค่า "${label}" ต้องมากกว่า 0`); return }
      body[k] = v
    }
    if (Number(draft.reserve_pct) > 100) { setMsg('เงินกันเฉลี่ยคืนต้องไม่เกิน 100%'); return }
    if (Number(draft.cap_mult) > 10) { setMsg('เพดานคะแนนต้องไม่เกิน 10 เท่า'); return }
    setBusy(true); setMsg('')
    if (editing.id === 1) body.fixed_pay = Math.round(Number(draft.full_amount) * 0.77 * 100) / 100
    const { error } = await sb.from('pay_groups').update(body).eq('id', editing.id)
    setBusy(false)
    if (error) { setMsg('บันทึกไม่สำเร็จ: ' + error.message); return }
    setMsg(`บันทึกกลุ่ม ${editing.id} แล้ว`); setEditing(null); setDraft(null); load()
  }
  const openEdit = (g: any, row: any) => { setEditing({ ...g, row }); setDraft({ ...g }) }
  const setPosLine = async (name: string, grp: string) => { const { error } = await sb.from('positions').update({ grp }).eq('name', name); setMsg(error ? 'บันทึกไม่สำเร็จ: ' + error.message : `กำหนดชุดกิจกรรมของ "${name}" เป็น ${grp} แล้ว`); load() }
  const setPosGroup = async (name: string, id: number) => { const { error } = await sb.from('positions').update({ pay_group: id }).eq('name', name); setMsg(error ? 'บันทึกไม่สำเร็จ: ' + error.message : `ย้าย "${name}" ไปกลุ่ม ${id} แล้ว`); load() }
  const groupOneRows = [
    { label: 'พยาบาลวิชาชีพ หัวหน้ากลุ่มงาน', guarantee: 1200, key: 'leader', roleGuarantee: 240 },
    { label: 'พยาบาลวิชาชีพหัวหน้างาน', guarantee: 1200, key: 'supervisor', roleGuarantee: 120 },
    { label: 'พยาบาลวิชาชีพ ผู้ปฏิบัติ', guarantee: 1200, key: 'staff', roleGuarantee: 0 },
  ]
  const minimumPay = (g: any) => Number((Number(g.full_amount) * 0.77).toFixed(2))
  return <div className="card xl:col-span-2 space-y-3">
    <div><h2 className="text-lg font-bold">กลุ่มวิชาชีพและยอดค่าตอบแทน</h2><p className="text-sm text-stone-600">ยอดจ่ายขั้นต่ำ = 77% ของยอดจัดสรรต่อคน เมื่อคะแนนต่ำกว่าแต้มประกัน · เมื่อคะแนนถึงเกณฑ์จ่าย 97% · เงินกันเฉลี่ยคืน 3% และยกเลิกการกันเงินคุณภาพ</p></div>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr><th>กลุ่มวิชาชีพ / ประเภทบุคลากร</th>{fields.map(([, l]) => <th key={l}>{l}</th>)}<th>เงินจ่ายขั้นต่ำ (บาท)</th><th>แต้มการันตี</th><th>จัดการ</th></tr></thead>
      <tbody>{gs.map(g => {
        const rows = g.id === 1 ? groupOneRows : [{ label: g.name, guarantee: Number(g.guarantee), key: 'group' }]
        return rows.map((row) => <tr key={`${g.id}-${row.key}`}>
          <td className="min-w-[16rem]"><b>{row.label}</b>{g.id === 1 && <div className="text-xs text-stone-500">กลุ่ม 1 พยาบาลวิชาชีพ</div>}</td>
          <td>{nf(g.rate, 3)}</td>
          <td>{nf(row.guarantee, 0)}</td>
          <td>{nf(g.cap_mult, 2)}</td>
          <td>{nf(g.full_amount)}</td>
          <td>{nf(g.reserve_pct, 0)}%</td>
          <td className="font-semibold whitespace-nowrap">{nf(minimumPay(g))}</td>
          <td>{nf(row.roleGuarantee || 0, 0)}</td>
          <td><button className="btn sec" onClick={() => openEdit(g, row)}>แก้ไข</button></td>
        </tr>)
      })}</tbody></table></div>
    {msg && <p role="status" className="text-sm text-teal-900">{msg}</p>}
    {editing && draft && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pay-group-edit-title">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3"><div className="flex-1"><h3 id="pay-group-edit-title" className="text-lg font-bold">แก้ไขรายละเอียดค่าตอบแทน</h3><p className="text-sm text-stone-600">{editing.row.label}</p></div><button type="button" className="btn sec" onClick={() => { setEditing(null); setDraft(null) }}>ปิด</button></div>
        <div className="rounded-xl bg-stone-50 p-3 text-sm"><div><b>กลุ่มวิชาชีพ:</b> {editing.name}</div><div><b>แต้มประกันของแถวนี้:</b> {nf(editing.row.guarantee, 0)} แต้ม</div><div><b>แต้มการันตีตามบทบาท:</b> {nf(editing.row.roleGuarantee || 0, 0)} แต้ม</div><div><b>แต้มการันตีตามบทบาท:</b> {nf(editing.row.roleGuarantee || 0, 0)} แต้ม</div><div><b>เงินจ่ายขั้นต่ำ:</b> {nf(Number(draft.full_amount) * 0.77)} บาท</div><p className="mt-1 text-xs text-stone-500">การแก้ไขข้อมูลกลุ่มจะมีผลกับการคำนวณของกลุ่มวิชาชีพนี้</p></div>
        <div className="grid sm:grid-cols-2 gap-3">{fields.map(([k, label]) => <label key={k} className="field-label">{label}<input className="inp mt-1" type="number" min="0.01" step={k === 'rate' ? '0.001' : '0.01'} value={draft[k] ?? ''} onChange={e => setDraft({ ...draft, [k]: e.target.value })} /></label>)}</div>
        <label className="field-label block">เงินจ่ายขั้นต่ำ (บาท)<input className="inp mt-1" type="number" min="0.01" step="0.01" value={Number((Number(draft.full_amount) * 0.77).toFixed(2))} readOnly /><span className="field-hint">คำนวณอัตโนมัติจากยอดจัดสรรต่อคน × 77%</span></label>
        <div className="flex justify-end gap-2"><button className="btn sec" disabled={busy} onClick={() => { setEditing(null); setDraft(null) }}>ยกเลิก</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</button></div>
      </div>
    </div>}
    <details><summary className="cursor-pointer text-sm font-bold">ตำแหน่ง: กลุ่มวิชาชีพ และชุดกิจกรรมที่บันทึกได้</summary>
      <div className="grid sm:grid-cols-2 gap-2 mt-2">{pos.map(x => <label key={x.name} className="flex items-center gap-2 text-sm"><span className="flex-1">{x.name}</span>
        <select className="inp !w-24" aria-label="กลุ่มวิชาชีพ" value={x.pay_group} onChange={e => setPosGroup(x.name, +e.target.value)}>{gs.map(g => <option key={g.id} value={g.id}>กลุ่ม {g.id}</option>)}</select>
        <select className="inp !w-56" aria-label="ชุดกิจกรรม" value={x.grp} onChange={e => setPosLine(x.name, e.target.value)}>{[...LINE_ORDER, NO_LINE].map(l => <option key={l} value={l}>{LINE_LABEL[l] || l}</option>)}</select></label>)}</div></details>
  </div>
}
function UsersPage({ sb, units }: any) {
  const [rows, setRows] = useState<any[]>([]); const [pu, setPu] = useState<any[]>([]); const [n, setN] = useState(0)
  useEffect(() => {
    sb.from('profiles').select('*').order('full_name').then((r: any) => setRows(r.data || []))
    sb.from('profile_units').select('*').then((r: any) => setPu(r.data || []))
  }, [n])
  const refresh = () => setN(x => x + 1)
  const upd = async (id: string, patch: any) => { await sb.from('profiles').update(patch).eq('user_id', id); refresh() }
  const addUnit = async (uid: string, unitId: number) => { if (unitId) { await sb.from('profile_units').upsert({ user_id: uid, unit_id: unitId, approved: true }, { onConflict: 'user_id,unit_id' }); refresh() } }
  const approve = async (uid: string, unitId: number) => { await sb.from('profile_units').update({ approved: true }).eq('user_id', uid).eq('unit_id', unitId); refresh() }
  const remove = async (uid: string, unitId: number) => { await sb.from('profile_units').delete().eq('user_id', uid).eq('unit_id', unitId); refresh() }
  const uname = (id: number) => units.find((u: any) => u.id === id)?.name || id
  const groupOf = (r: any) => units.find((u: any) => u.id === r.unit_id)?.parent_group
  return <div className="card p-0 overflow-x-auto"><table className="w-full"><thead><tr><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>หน่วยงานหลัก</th><th>สิทธิ์</th><th>หน่วยงานที่ดูแลเพิ่ม (หัวหน้างาน)</th></tr></thead>
    <tbody>{rows.map(r => { const mine = pu.filter(x => x.user_id === r.user_id); return <tr key={r.user_id}>
      <td><b>{r.full_name || '(ไม่ระบุ)'}</b>{r.username && <div className="text-xs text-stone-500">{r.username}</div>}</td><td className="text-xs">{r.position}</td>
      <td><select className="inp" value={r.unit_id ?? ''} onChange={e => upd(r.user_id, { unit_id: +e.target.value || null })}><option value="">-</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
      <td><select className="inp" value={r.role} onChange={e => upd(r.user_id, { role: e.target.value })}>{Object.keys(ROLE_TH).map(k => <option key={k} value={k}>{ROLE_TH[k]}</option>)}</select></td>
      <td className="min-w-[16rem]">
        {(r.org_role === 'หัวหน้ากลุ่มงาน' || r.position === 'หัวหน้ากลุ่มงานการพยาบาล') && <p className="text-xs text-teal-800 mb-1">ดูแลทุกหน่วยในกลุ่มงานอัตโนมัติ: {groupOf(r) || r.nursing_group || 'ยังไม่ระบุหน่วยหลัก'}{r.role !== 'group_head' && ' (ตั้งสิทธิ์เป็นหัวหน้ากลุ่มงาน)'}</p>}
        <div className="flex flex-wrap gap-1 mb-1">{mine.map(x => <span key={x.unit_id} className={'px-2 py-0.5 text-xs border ' + (x.approved ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-400')}>
          {uname(x.unit_id)}{!x.approved && ' · รออนุมัติ'}
          {!x.approved && <button className="ml-1 underline text-teal-800" onClick={() => approve(x.user_id, x.unit_id)}>อนุมัติ</button>}
          <button className="ml-1 text-red-700" aria-label="ลบ" onClick={() => remove(x.user_id, x.unit_id)}>×</button></span>)}</div>
        <select className="inp" value="" onChange={e => addUnit(r.user_id, +e.target.value)}><option value="">+ เพิ่มหน่วยงาน</option>{units.filter((u: any) => u.id !== r.unit_id && !mine.some(x => x.unit_id === u.id)).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </td></tr> })}</tbody></table></div>
}
