import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { createPortal } from 'react-dom'
import { Eye, EyeOff, Printer, ShieldCheck, Menu, X, LayoutDashboard, ClipboardList, LibraryBig, ClipboardCheck, Users, Wallet, Settings, LogOut, ChevronLeft, CalendarDays, Building2, Shield } from 'lucide-react'

const DEFAULT_CFG = { url: 'https://foypareeazfzidwygolc.supabase.co', key: 'sb_publishable_8qxOgD-AHGnv9RWWAZTUQQ_I0MPIMv3' }
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง']
const FOOTER_TEXT = '© 2026 Developed By Natnarinthorn | Nursing Informatics System'
const SHIFTS: [string, string][] = [['แสตนด์เช้า', 'แสตนด์เช้า (08.00–16.00 เวลาราชการ)'], ['เช้า', 'เวรเช้า'], ['บ่าย', 'เวรบ่าย'], ['ดึก', 'เวรดึก (00.00–08.00)']]
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
  if (ap.role !== 'head') return false
  const sl = ap.personLevel[r.person_id] ?? 0
  return (ap.level === 1 && sl === 0) || (ap.level === 2 && sl === 1) || (ap.level === 3 && sl === 2)
}
const ROLE_TH: any = { staff: 'เจ้าหน้าที่', head: 'หัวหน้างาน', committee: 'กรรมการ P4P', admin: 'ผู้ดูแลระบบ' }
const ROLES = ['ประธาน', 'เลขานุการ/กรรมการ', 'สมาชิก/ผู้เข้าร่วม']
const nf = (n: any, d = 2) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d })
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
const formatThaiShortDate = (value: string) => { if (!value) return 'ไม่ได้ระบุวันที่'; const [y, m, d] = value.split('-').map(Number); const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; if (!y || !m || !d || m < 1 || m > 12) return value; return `${d} ${months[m - 1]} ${y + 543}` }
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
        <p className="field-hint">ใช้ตัวอักษรภาษาอังกฤษ a–z ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–30 ตัว</p>
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

function Main({ sb, session }: any) {
  const [profile, setProfile] = useState<any>(null); const [noProfile, setNoProfile] = useState(false)
  const [people, setPeople] = useState<any[]>([]); const [acts, setActs] = useState<any[]>([]); const [units, setUnits] = useState<any[]>([])
  const [directoryUnitNames, setDirectoryUnitNames] = useState<string[] | null>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [actsVersion, setActsVersion] = useState(0)
  const reloadActs = () => setActsVersion(v => v + 1)
  const [month, setMonth] = useState(today().slice(0, 7)); const [tab, setTab] = useState('')
  const [unit, setUnit] = useState<number | null>(null)
  const [myUnits, setMyUnits] = useState<number[]>([])
  // Hooks must run in the same order before any conditional return.
  const [mobileNav, setMobileNav] = useState(false)
  const [compactNav, setCompactNav] = useState(false)
  const [myLevel, setMyLevel] = useState(0); const [personLevel, setPersonLevel] = useState<Record<string, number>>({})
  const loadPeople = () => {
    sb.from('people').select('*').eq('active', true).order('name').then((r: any) => setPeople(r.data || []))
    sb.rpc('person_levels').then((r: any) => setPersonLevel(Object.fromEntries((r.data || []).map((x: any) => [x.person_id, Number(x.lvl)]))))
  }
  useEffect(() => {
    sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle().then((r: any) => { if (!r.data) { setNoProfile(true); return } setProfile(r.data); setUnit(r.data.role === 'admin' ? null : (r.data.unit_id ?? null)) })
    sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
    // ใช้ชื่อหน่วยงานจาก staff_directory ที่ active เป็นแหล่งอ้างอิงของ dropdown
    // แล้วจับคู่กับ units.name เพื่อคง unit_id/foreign keys เดิมโดยไม่แก้ข้อมูลฐานข้อมูล
    sb.from('staff_directory').select('unit_name').eq('active', true).not('unit_name', 'is', null).then((r: any) => {
      if (r.error || !Array.isArray(r.data)) { console.error('โหลดรายชื่อหน่วยงานจาก staff_directory ไม่สำเร็จ', r.error); setDirectoryUnitNames(null); return }
      setDirectoryUnitNames([...new Set(r.data.map((x: any) => String(x.unit_name || '').trim()).filter(Boolean))].sort((a: string, b: string) => a.localeCompare(b, 'th')))
    })
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.rpc('my_approval_level').then((r: any) => setMyLevel(Number(r.data || 0)))
    sb.rpc('my_units').then((r: any) => setMyUnits((r.data || []).map((x: any) => (typeof x === 'object' && x ? Object.values(x)[0] : x) as number)))
    loadPeople()
  }, [])
  useEffect(() => { sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || [])) }, [actsVersion])
  if (noProfile) return <div className="p-8 space-y-3"><p>ไม่พบข้อมูลบัญชีของคุณในระบบ (บัญชีอาจถูกลบแล้ว) กรุณาออกจากระบบแล้วลงทะเบียนใหม่</p><button className="btn" onClick={() => sb.auth.signOut({ scope: 'local' })}>ออกจากระบบ</button></div>
  if (!profile) return <p className="p-8">กำลังโหลดโปรไฟล์…</p>
  const role = profile.role; const isRev = role === 'committee' || role === 'admin'
  const tabs = [...(role !== 'committee' ? [['log', 'บันทึกกิจกรรม']] : []), ['activities', 'คลังกิจกรรม'], ...(role === 'head' || role === 'admin' ? [['review', 'ตรวจ/รับรองหน่วยงาน'], ['people', 'บุคลากร']] : []), ...(isRev ? [['audit', 'คกก. P4P ตรวจสอบ'], ['payout', 'จ่ายเงิน P4P']] : []), ...(role === 'admin' ? [['users', 'จัดการผู้ใช้'], ['settings', 'ตั้งค่า']] : [])]
  const cur = tab || (role === 'admin' ? 'review' : tabs[0]?.[0])
  // แสดงเฉพาะหน่วยงานที่มีอยู่ใน staff_directory ล่าสุด และจับคู่ชื่อแบบตรงตัวกับ units
  // ไม่สร้าง/เปลี่ยน unit_id และไม่แก้หรือรวมข้อมูลในฐานข้อมูล
  // ซ่อนชื่อหน่วยงานเดิมเสมอ แม้โหลด staff_directory ไม่สำเร็จหรือมีข้อมูลเก่าค้างใน units
  const directoryUnits = units.filter(u => {
    const name = String(u.name || '').trim()
    return name !== 'คลินิกโรคเรื้อรัง' && (directoryUnitNames === null || directoryUnitNames.includes(name))
  })
    .slice().sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'th'))
  const unitOptions = role === 'head' ? directoryUnits.filter(u => myUnits.includes(u.id) || u.id === profile.unit_id) : isRev ? directoryUnits : directoryUnits.filter(u => u.id === profile.unit_id)
  const scope = people.filter(p => (isRev || role === 'head' ? p.unit_id === unit : p.user_id === session.user.id))
  const navIcons: Record<string, any> = { log: ClipboardList, activities: LibraryBig, review: ClipboardCheck, people: Users, audit: Shield, payout: Wallet, users: Users, settings: Settings }
  const pageTitle = tabs.find(([k]) => k === cur)?.[1] || 'ภาพรวมระบบ'
  const navigation = <>{tabs.map(([k, l]) => { const Icon = navIcons[k] || LayoutDashboard; return <button type="button" key={k} title={compactNav ? l : undefined} onClick={() => { setTab(k); setMobileNav(false) }} className={'sidebar-link ' + (cur === k ? 'active' : '')}><Icon size={19} strokeWidth={1.9}/><span>{l}</span>{cur === k && <span className="sidebar-active-dot"/>}</button> })}</>
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
      {(isRev || (role === 'head' && unitOptions.length > 1)) && <label className="topbar-unit"><Building2 size={16}/><select className="inp" aria-label="หน่วยงาน" value={unit ?? ''} onChange={e => setUnit(e.target.value ? +e.target.value : null)}>{role === 'admin' && <option value="">เลือกหน่วยงานก่อน</option>}{unitOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <label className="topbar-month"><CalendarDays size={17}/><input type="month" aria-label="เดือนที่แสดง" className="inp" value={month} onChange={e => setMonth(e.target.value)} /></label>
      </div></header>
      <main className="app-content">

    {tabs.length === 0 && <p>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน</p>}
    {cur === 'log' && (role === 'staff' && scope.length === 0
      ? <div className="card">ยังไม่พบชื่อของคุณในรายชื่อบุคลากร — แจ้งหัวหน้างานให้เพิ่มชื่อ "{profile.full_name}" แล้วสมัครใหม่ หรือให้ผู้ดูแลผูกบัญชีให้</div>
      : <LogPage units={units} sb={sb} people={scope} allPeople={people} unitOptions={unitOptions} defaultUnit={unit ?? profile.unit_id} acts={acts} positions={positions} month={month} canApprove={role !== 'staff'} />)}
    {cur === 'review' && role === 'admin' && !unit && <div className="card text-center space-y-2"><h2 className="font-bold">เลือกหน่วยงานเพื่อเริ่มตรวจ/รับรอง</h2><p className="text-sm text-stone-600">กรุณาเลือกหน่วยงานจากรายการด้านบน ระบบจะแสดงรายการทั้งหมดของหน่วยงานที่เลือก</p></div>}
    {cur === 'review' && !(role === 'admin' && !unit) && <ReviewPage units={units} canPrint={role !== 'committee'} sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} editable />}
    {cur === 'people' && <PeoplePage sb={sb} people={scope} unit={unit} positions={positions} reload={loadPeople} />}
    {cur === 'users' && <UsersPage sb={sb} units={units} />}
    {cur === 'payout' && <PayoutPage sb={sb} month={month} isAdmin={role === 'admin'} />}
    {cur === 'settings' && <SettingsPage sb={sb} />}
    {cur === 'activities' && <ActivityLibrary myLine={positions.find((x: any) => x.name === profile.position)?.grp} seeAll={role !== 'staff'} sb={sb} acts={acts} positions={positions} isAdmin={role === 'admin'} reloadActs={reloadActs} />}
    {cur === 'audit' && <ReviewPage units={units} canPrint={role !== 'committee'} sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} audit />}
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
        const { data } = await sb.from('logs').select('id, sub_activity, evidence_image_path, entered_by, reject_reason, submitted_at').in('id', baseRows.slice(i, i + 200).map((x: any) => x.id))
        ;(data || []).forEach((x: any) => extraMap.set(x.id, x))
      }
      if (alive) setRows(baseRows.map((x: any) => ({ ...x, ...(extraMap.get(x.id) || {}) })))
    })()
    return () => { alive = false }
  }, [month, n, unit, personIds?.join(',')])
  return [rows, () => setN(x => x + 1)] as const
}

function LogPage({ units, sb, people: peopleProp, allPeople, unitOptions, defaultUnit, acts, positions, month, canApprove }: any) {
  const picker = !!canApprove
  const me = useContext(MeCtx)
  const [printing, setPrinting] = useState(false) // หัวหน้า/แอดมิน: เลือกหน่วยงานและบุคลากรที่จะบันทึกให้
  const [uSel, setUSel] = useState<number | null>(defaultUnit ?? unitOptions?.[0]?.id ?? null)
  const people = useMemo(() => (picker ? (allPeople || []).filter((p: any) => p.unit_id === uSel) : peopleProp), [picker, allPeople, uSel, peopleProp])
  const ids = useMemo(() => people.map((p: any) => p.id), [people])
  const [rows, reload] = useLogs(sb, month, ids)
  const [pid, setPid] = useState<any>(picker ? '' : people[0]?.id); const [date, setDate] = useState(today()); const [code, setCode] = useState('')
  const [q, setQ] = useState(''); const [role, setRole] = useState(ROLES[2]); const [qty, setQty] = useState('1'); const [ev, setEv] = useState(''); const [subActivity, setSubActivity] = useState(''); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [err, setErr] = useState(''); const [modalOpen, setModalOpen] = useState(false); const [duplicateRows, setDuplicateRows] = useState<any[]>([]); const [duplicateOpen, setDuplicateOpen] = useState(false); const [editTargetRow, setEditTargetRow] = useState<any>(null)
  const [notice, setNotice] = useState('')
  const [shift, setShift] = useState('แสตนด์เช้า'); const [caps, setCaps] = useState<any>({ cap_shift_points: 90, cap_day_points: 180 })
  useEffect(() => { sb.from('app_settings').select('key,value').in('key', ['cap_shift_points', 'cap_day_points']).then((r: any) => setCaps(Object.fromEntries([['cap_shift_points', 90], ['cap_day_points', 180], ...(r.data || []).map((x: any) => [x.key, Number(x.value)])]))) }, [])
  useEffect(() => { if (!picker && !pid && people[0]) setPid(people[0].id) }, [people])
  const person = people.find((p: any) => p.id === pid); const pos = positions.find((x: any) => x.name === person?.position)
  const codeRank = (c: string) => ({ ADM: 0, SVC: 1, ACD: 2 } as any)[String(c).slice(0, 3)] ?? 3
  const byCode = (a: any, b: any) => codeRank(a.code) - codeRank(b.code) || String(a.code).localeCompare(String(b.code))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)   // พิมพ์หลายคำได้ ต้องพบครบทุกคำ ในรหัส/หมวด/กิจกรรมหลัก/กิจกรรมย่อย
  const list = acts.filter((a: any) => (!pos || a.eligible.includes(pos.grp)) && terms.every(t => [a.code, a.category, a.main_activity, a.title].join(' ').toLowerCase().includes(t))).sort(byCode)
  const catGroups: [string, any[]][] = (() => { const m = new Map<string, any[]>(); list.forEach((a: any) => { const k = a.category || 'อื่นๆ'; m.set(k, [...(m.get(k) || []), a]) }); return [...m.entries()] })()
  const act = acts.find((a: any) => a.code === code)
  const prev = act && pos ? act.minutes * Number(qty || 0) * pos.rate * (act.use_role_mult ? (role === ROLES[0] ? 2 : role === ROLES[1] ? 1.5 : 1) : 1) : 0
  const shown = pid ? rows.filter((r: any) => r.person_id === pid) : rows
  const myDrafts = shown.filter((r: any) => r.status === 'draft' && r.entered_by === me)
  const myRejected = shown.filter((r: any) => r.status === 'rejected' && r.entered_by === me)
  // เพดานคะแนนต่อเวรและต่อวัน (คำนวณตัดส่วนเกินที่ฐานข้อมูล ตรงนี้แสดงโควตาที่ใช้ไปแล้ว)
  const capS = Number(caps.cap_shift_points) || 90, capD = Number(caps.cap_day_points) || 180
  const dayRows = rows.filter((r: any) => r.person_id === pid && r.work_date === date && r.status !== 'rejected')
  const usedShift = dayRows.filter((r: any) => r.shift === shift).reduce((t: number, r: any) => t + Number(r.shift_points || 0), 0)
  const dayUsed = dayRows.reduce((t: number, r: any) => t + Number(r.counted_points || 0), 0)
  const room = Math.max(0, Math.min(capS - usedShift, capD - dayUsed))
  const shiftName = shift === 'แสตนด์เช้า' ? 'แสตนด์เช้า' : 'เวร' + shift
  const chooseActivity = async (activity: any) => {
    setCode(activity.code); setErr('')
    if (!pid) { setErr('กรุณาเลือกบุคลากรก่อน'); return }
    const { data, error } = await sb.from('logs')
      .select('id, person_id, work_date, activity_code, qty, status, evidence, sub_activity, evidence_image_path')
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
  const save = async () => {
    setErr('')
    if (!pid) { setErr('กรุณาเลือกบุคลากรก่อน'); return }
    if (!code || !act) { setErr('กรุณาค้นหาและเลือกกิจกรรม'); return }
    if (!qty || Number(qty) <= 0) { setErr('กรุณาระบุจำนวนให้มากกว่า 0'); return }
    if (act.need_evidence && !ev.trim() && !evidenceFile) { setErr(`กิจกรรมนี้ต้องมีหลักฐาน: ${act.definition || 'กรุณาระบุเอกสารหรือแนบรูปถ่ายประกอบ'}`); return }
    // Check the total for this person, date and activity across all previously saved rows.
    // The database trigger performs the same validation as a final safeguard against concurrent requests.
    if (act.max_day !== null && act.max_day !== undefined && act.max_day !== '') {
      const { data: sameDayRows, error: limitQueryError } = await sb.from('logs')
        .select('qty')
        .eq('person_id', pid)
        .eq('work_date', date)
        .eq('activity_code', code)
      if (limitQueryError) { setErr('ตรวจสอบจำนวนสะสมต่อวันไม่สำเร็จ จึงยังบันทึกรายการไม่ได้ กรุณาลองใหม่: ' + limitQueryError.message); return }
      const alreadyLogged = (sameDayRows || []).reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)
      const requestedQty = Number(qty)
      const dailyLimit = Number(act.max_day)
      if (alreadyLogged + requestedQty > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - alreadyLogged)
        setErr(`บันทึกไม่ได้: กิจกรรมนี้กำหนดไม่เกิน ${dailyLimit} ${act.uom || 'หน่วย'} ต่อวัน วันที่ ${formatThaiShortDate(date)} บันทึกสะสมไปแล้ว ${alreadyLogged} ${act.uom || 'หน่วย'} และกำลังเพิ่ม ${requestedQty} ${act.uom || 'หน่วย'} รวมเป็น ${alreadyLogged + requestedQty} เกินกำหนด เหลือบันทึกได้อีก ${remaining} ${act.uom || 'หน่วย'}`)
        return
      }
    }
    const { data: inserted, error } = await sb.from('logs').insert({ person_id: pid, work_date: date, activity_code: code, role: act?.use_role_mult ? role : null, qty: +qty, evidence: ev.trim() || (evidenceFile ? 'แนบรูปถ่าย' : null), sub_activity: subActivity.trim() || null, shift }).select('id').single()
    if (error) {
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
      if (uploadError) { setErr(`บันทึกรายการแล้ว แต่แนบรูปไม่สำเร็จ: ${uploadError.message}`); reload(); return }
      const { error: pathError } = await sb.from('logs').update({ evidence_image_path: path }).eq('id', inserted.id)
      if (pathError) { setErr(`อัปโหลดรูปแล้ว แต่บันทึกการเชื่อมโยงรูปไม่สำเร็จ: ${pathError.message}`); reload(); return }
    }
    setEv(''); setSubActivity(''); setEvidenceFile(null); setQty('1'); setErr(''); setModalOpen(false); setNotice('บันทึกเป็นแบบร่างแล้ว กดปุ่ม "ส่ง" ในตารางเมื่อพร้อมให้หัวหน้ารับรอง (แบบร่างแก้ไขหรือลบได้ แต่เมื่อส่งแล้วจะล็อก)'); reload()
  }
  return <div className="space-y-4">
    <div className="space-y-3">
      {person && <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn sec" onClick={() => setPrinting(true)}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์ใบสรุปประจำเดือน (A4)</button><button type="button" className="btn" onClick={() => document.getElementById('saved-activity-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ตรวจสอบรายการบันทึก</button></div>}
      {printing && person && <PrintSheet sb={sb} person={person} rows={shown} month={month} units={units} positions={positions} onClose={() => setPrinting(false)} />}
      {myDrafts.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-300 bg-white p-3 text-sm"><span>แบบร่างที่ยังไม่ส่ง <b>{myDrafts.length}</b> รายการ (ยังไม่นับคะแนน)</span>
        <button type="button" className="btn" onClick={async () => { if (!confirm(`ส่ง ${myDrafts.length} รายการให้หัวหน้ารับรอง? เมื่อส่งแล้วจะแก้ไขหรือลบไม่ได้`)) return; const { error } = await sb.from('logs').update({ status: 'pending' }).in('id', myDrafts.map((r: any) => r.id)); if (error) alert('ส่งรายการไม่สำเร็จ: ' + error.message); else { setNotice(`ส่ง ${myDrafts.length} รายการให้หัวหน้ารับรองแล้ว`); reload() } }}>ส่งทั้งหมด ({myDrafts.length})</button></div>}
      <Totals rows={shown} people={person ? [person] : []} positions={positions} />
    </div>
    <div className="card space-y-2 self-start">
      <h2 className="font-bold">เพิ่มรายการ</h2>
      {picker && <>
        <label className="field-label">หน่วยงานที่ต้องการบันทึก</label>
        <select className="inp" value={uSel ?? ''} onChange={e => { setUSel(+e.target.value); setPid('') }}>{(unitOptions || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <label className="field-label">บันทึกคะแนนให้ใคร</label>
        <select className="inp" value={pid} onChange={e => setPid(e.target.value)}><option value="">— เลือกบุคลากรในหน่วยงานนี้ —</option>{people.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}</select>
        {!people.length && <p className="text-xs text-red-700">หน่วยงานนี้ยังไม่มีบุคลากร เพิ่มได้ที่แท็บ "บุคลากร"</p>}
      </>}
      {!picker && people.length > 1 && <select className="inp" value={pid} onChange={e => setPid(e.target.value)}>{people.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}</select>}
      <input type="date" lang="th-TH" className="inp" value={date} onChange={e => setDate(e.target.value)} onKeyDown={e => e.preventDefault()} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }} aria-label="เลือกวันที่จากปฏิทินเท่านั้น" />
      <label className="field-label">เวรที่ปฏิบัติ</label>
      <select className="inp" value={shift} onChange={e => setShift(e.target.value)}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {pid && <p role="status" className={'text-xs ' + (room <= 0 ? 'text-amber-800 font-bold' : 'text-stone-600')}>{shiftName}วันนี้ใช้ {nf(usedShift)}/{nf(capS, 0)} คะแนน · รวมทั้งวัน {nf(dayUsed)}/{nf(capD, 0)}{room <= 0 && ' · เต็มเพดาน บันทึกเพิ่มได้แต่ไม่นับคะแนน'}</p>}
      <input className="inp" placeholder="ค้นหา: รหัส หมวด กิจกรรมหลัก หรือกิจกรรมย่อย (พิมพ์หลายคำได้)" value={q} onChange={e => setQ(e.target.value)} />
      <label className="field-label">รายการกิจกรรม</label>
      <div className="act-list" role="listbox" aria-label="รายการกิจกรรม">
        {catGroups.map(([cat, items]) => <div key={cat}>
          <div className="act-head">{cat}</div>
          {items.map((a: any) => <button type="button" key={a.code} role="option" aria-selected={code === a.code} title={[a.main_activity, a.title].filter(Boolean).join(' › ')} onClick={() => { void chooseActivity(a) }} className={'act-item' + (code === a.code ? ' on' : '')}>
            <span className="act-code">{a.code}</span><span className="act-body">{a.main_activity && <span className="act-main">{a.main_activity}</span>}<span className="act-title">{a.title}</span></span><span className="act-uom">{a.minutes} นาที/{a.uom}</span></button>)}</div>)}
        {!list.length && <p className="p-3 text-sm text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหาหรือสิทธิ์ของตำแหน่งนี้</p>}
      </div>
      {act && <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm"><b className="text-teal-900">เลือกแล้ว: {act.code} {[act.category, act.main_activity, act.title].filter(Boolean).join(' › ')}</b><p className="mt-1 text-xs text-teal-900">กดรายการกิจกรรมเพื่อเปิดแบบฟอร์มกรอกข้อมูล</p></div>}
      {duplicateOpen && act && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="duplicate-activity-title"><div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">ตรวจพบรายการซ้ำ</p><h2 id="duplicate-activity-title" className="text-lg font-bold text-slate-900">กิจกรรมนี้บันทึกไปแล้ว</h2><p className="mt-1 text-sm text-slate-700">{act.code} {act.title}</p><p className="mt-1 text-sm font-semibold text-amber-800">รายการนี้บันทึกไปแล้วจำนวน {duplicateRows.reduce((sum: number, row: any) => sum + Number(row.qty || 0), 0)} {act.uom || 'หน่วย'} ในวันที่ {formatThaiShortDate(date)}</p></div><button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setDuplicateOpen(false)}>ปิด</button></div>
        <p className="text-sm text-slate-700">หากต้องการบันทึกเพิ่มกรุณาทำการแก้ไขจำนวนแทน ไม่สามารถสร้างรายการกิจกรรมซ้ำในวันเดียวกันได้</p>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-left">วันที่</th><th className="text-left">กิจกรรม</th><th className="text-right">จำนวน</th><th className="text-left">สถานะ</th><th className="text-left">หลักฐาน</th><th>ดำเนินการ</th></tr></thead><tbody>
          {duplicateRows.map((row: any) => <tr key={row.id} className="border-t"><td className="whitespace-nowrap">{formatThaiShortDate(row.work_date)}</td><td><b>{row.activity_code}</b> {act.title}{row.sub_activity && <div className="text-xs text-slate-500">{row.sub_activity}</div>}</td><td className="text-right whitespace-nowrap">{row.qty} {act.uom || 'หน่วย'}</td><td>{ST[row.status]?.[0] || row.status || 'ไม่ระบุ'}</td><td>{row.evidence || row.evidence_image_path ? <span className="text-teal-800">มีหลักฐาน{row.evidence_image_path ? ' / รูปภาพ' : ''}</span> : <span className="text-slate-500">ไม่มี</span>}</td><td className="text-center whitespace-nowrap">{row.status === 'pending' ? <button type="button" className="btn sec !py-1" onClick={() => { setDuplicateOpen(false); setEditTargetRow(row) }}>เข้าแก้ไขรายการ</button> : <span className="text-xs text-slate-500">รายการรับรองแล้ว แก้ไขไม่ได้</span>}</td></tr>)}
        </tbody></table></div>
        <div className="flex justify-end"><button type="button" className="btn sec" onClick={() => setDuplicateOpen(false)}>กลับ</button></div>
      </div></div>}
      {modalOpen && act && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4"><div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">บันทึกกิจกรรม P4P</p><h2 id="activity-modal-title" className="text-lg font-bold text-slate-900">{act.code} {act.title}</h2><p className="mt-1 text-xs text-slate-600">{act.minutes} นาที/{act.uom}{act.max_day ? ` · สูงสุด ${act.max_day}/วัน` : ''}{act.max_month ? ` · ${act.max_month}/เดือน` : ''}</p><p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-900"><span aria-hidden="true">📅</span> วันที่บันทึก: {formatThaiShortDate(date)}</p></div><button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setModalOpen(false); setErr('') }}>ปิด</button></div>
      {act.need_evidence ? <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3"><p className="font-bold text-amber-900">หลักฐานที่ต้องใช้สำหรับกิจกรรมนี้ (จำเป็น)</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{act.definition?.trim() || 'กรุณาตรวจสอบแนวทาง/เกณฑ์ P4P ของกิจกรรมนี้ และระบุหลักฐานอ้างอิงที่ตรวจสอบได้ก่อนบันทึก'}</p><p className="mt-2 text-xs text-amber-900">ต้องกรอกคำอธิบายหลักฐาน หรือแนบรูปถ่ายอย่างน้อย 1 อย่าง</p></div> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-slate-800">หลักฐานประกอบ</p><p className="text-sm text-slate-700">{act.definition?.trim() || 'หากมีเอกสารอ้างอิงหรือรูปถ่ายประกอบ สามารถระบุเพิ่มเติมได้'}</p></div>}
      {act.use_role_mult && <div className="space-y-1"><label className="field-label">บทบาทในการดำเนินกิจกรรม</label><select className="inp" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>}
      <div className="space-y-1"><label className="field-label">จำนวน <span className="uom-chip">หน่วยนับ: {act.uom}</span></label><div className="qty-wrap"><input type="number" min="0" step="0.5" className="inp" value={qty} onChange={e => setQty(e.target.value)} placeholder="ระบุจำนวน" /><span className="qty-unit">{act.uom}</span></div></div>
      <div className="space-y-1"><label className="field-label">กิจกรรมย่อย / รายละเอียดการดำเนินงาน</label><textarea className="inp min-h-24" placeholder="ระบุชื่องานย่อย รายละเอียดสิ่งที่ทำ ผลลัพธ์ หรือขอบเขตงาน" value={subActivity} onChange={e => setSubActivity(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">รายละเอียดหลักฐาน {act.need_evidence && <span className="text-red-700">* จำเป็น</span>}</label><textarea className="inp min-h-24" placeholder={act.need_evidence ? 'ระบุหลักฐานตามรายการที่แสดงด้านบน เช่น เลขที่เอกสาร วันที่ ผู้รับรอง หรือชื่อเอกสาร' : 'ระบุเอกสารอ้างอิงหรือคำอธิบายหลักฐาน (ถ้ามี)'} value={ev} onChange={e => setEv(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">แนบรูปถ่ายหลักฐาน {act.need_evidence && <span className="text-slate-600">(หรือกรอกรายละเอียดหลักฐานด้านบน)</span>}</label><input className="inp" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0] || null; if (f && (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) { setErr('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); e.target.value = ''; setEvidenceFile(null); return } setErr(''); setEvidenceFile(f) }} /><p className="field-hint">แนบรูปถ่ายได้ 1 รูปต่อรายการ ขนาดไม่เกิน 5 MB</p>{evidenceFile && <p className="text-xs text-teal-800">ไฟล์ที่เลือก: {evidenceFile.name}</p>}</div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">แต้มโดยประมาณ: <b>{nf(prev)}</b>{prev > room && <span className="text-amber-800"> · {shiftName} นับได้ไม่เกิน {nf(room)} คะแนน (ส่วนที่เกินเพดานไม่นับ)</span>}</div>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn" onClick={() => { setModalOpen(false); setErr('') }}>ยกเลิก</button><button type="button" className="btn" disabled={!pid || !code || !+qty} onClick={save}>บันทึกกิจกรรม</button></div></div></div>}
    </div>
    <div className="space-y-3">
      {notice && <p role="status" className="rounded-lg border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
      {myRejected.length > 0 && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><b>มี {myRejected.length} รายการที่หัวหน้าไม่รับรอง</b> ดูเหตุผลในตาราง แล้วกด "แก้ไข" หรือ "ส่งใหม่"</p>}
      <div id="saved-activity-table" className="scroll-mt-6"><LogTable sb={sb} rows={shown} reload={reload} canApprove={canApprove} showName={!pid && people.length > 1} acts={acts} editTargetRow={editTargetRow} clearEditTarget={() => setEditTargetRow(null)} /></div>
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
function PrintSheet({ sb, person, rows: rowsIn, month, units, positions, onClose }: any) {
  const rows = useMemo(() => (rowsIn || []).filter((r: any) => r.status !== 'draft'), [rowsIn])
  const [head, setHead] = useState<any>(null)
  const ap = useContext(ApproverCtx)
  useEffect(() => { sb.rpc('approver_of', { p_person: person.id }).then((r: any) => setHead(r.data?.[0] || null)) }, [person.id])
  const unit = units.find((u: any) => u.id === person.unit_id)
  const guarantee = Number(positions.find((x: any) => x.name === person.position)?.guarantee || 0)
  const monthText = new Date(month + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
  const byDomain = (d: string) => rows.filter((r: any) => r.domain === d).reduce((a: number, r: any) => a + Number(r.counted_points), 0)
  const total = DOMAINS.reduce((a, d) => a + byDomain(d), 0)
  const groups = useMemo(() => {
    const m = new Map<string, any>()
    rows.forEach((r: any) => {
      const g = m.get(r.activity_code) || { code: r.activity_code, title: r.title, uom: r.uom, domain: r.domain, qty: 0, min: 0, pts: 0, st: { approved: 0, pending: 0, rejected: 0 } }
      g.qty += Number(r.qty); g.min += Number(r.total_min); g.pts += Number(r.counted_points); g.st[r.status] += 1
      m.set(r.activity_code, g)
    })
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [rows])
  const sign = (title: string, name?: string, pos?: string) => <div className="sign-box">
    <div>ลงชื่อ ........................................ {title}</div>
    <div className="sign-name">( {name || <span className="sign-blank" />} )</div>
    <div className="sign-pos">ตำแหน่ง {pos || <span className="sign-blank wide" />}</div>
  </div>
  return createPortal(<div className="print-overlay">
    <div className="print-toolbar no-print">
      <span className="text-sm text-stone-600 mr-auto self-center">ตัวอย่างก่อนพิมพ์ (ขนาด A4) · เลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ได้</span>
      <button className="btn" onClick={() => window.print()}><Printer size={16} className="inline mr-1 -mt-0.5" />พิมพ์</button>
      <button className="btn sec" onClick={onClose}>ปิด</button>
    </div>
    <div className="print-sheet">
      <div className="ps-hospital">กลุ่มการพยาบาล โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</div>
      <h1 className="ps-title">ใบสรุปผลงาน P4P รายบุคคล</h1>
      <div className="ps-top">
        <div className="ps-info">
          <div><b>ชื่อ-สกุล</b> {person.name}</div>
          <div><b>ตำแหน่ง</b> {person.position}</div>
          <div><b>หน่วยงาน/งาน</b> {unit?.name || '-'}{person.sub_unit ? ` / ${person.sub_unit}` : ''}</div>
          <div><b>เดือน</b> {monthText}</div>
        </div>
        <table className="pt ps-sum"><thead><tr><th>ด้าน</th><th>แต้ม</th></tr></thead><tbody>
          {DOMAINS.map(d => <tr key={d}><td>{d}</td><td className="r">{nf(byDomain(d))}</td></tr>)}
          <tr className="b"><td>รวม</td><td className="r">{nf(total)}</td></tr>
          <tr><td>แต้มประกัน</td><td className="r">{nf(guarantee)}</td></tr>
          <tr className="b"><td>ส่วนที่เกิน</td><td className="r">{nf(Math.max(0, total - guarantee))}</td></tr>
        </tbody></table>
      </div>
      <table className="pt ps-acts"><thead><tr><th>รหัส</th><th>กิจกรรม</th><th>หน่วยนับ</th><th>จำนวน</th><th>นาทีรวม</th><th>แต้มที่นับ</th><th>สถานะ</th><th>ด้าน</th></tr></thead>
        <tbody>{groups.map(g => <tr key={g.code}><td className="nw">{g.code}</td><td>{g.title}</td><td className="c">{g.uom}</td><td className="r">{n2(g.qty)}</td><td className="r">{n2(g.min)}</td><td className="r">{nf(g.pts)}</td><td className="c sm">{statusLabel(g.st)}</td><td className="c">{g.domain}</td></tr>)}
          {!groups.length && <tr><td colSpan={8} className="c">ไม่มีกิจกรรมที่บันทึกในเดือนนี้</td></tr>}
          {groups.length > 0 && <tr className="b"><td colSpan={4} className="r">รวม</td><td className="r">{n2(groups.reduce((a, g) => a + g.min, 0))}</td><td className="r">{nf(groups.reduce((a, g) => a + g.pts, 0))}</td><td colSpan={2}></td></tr>}
        </tbody></table>
      <div className="sign-row">{sign('ผู้บันทึก')}{sign(`${approverLabel(ap?.personLevel?.[person.id] ?? 0)} (รับรอง)`, head?.approver_name, head?.approver_position)}{sign('ผู้ตรวจสอบ (คกก. P4P)')}</div>
      <div className="ps-foot">พิมพ์เมื่อ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} · ระบบ P4P กลุ่มการพยาบาล</div>
    </div>
  </div>, document.body)
}

function Totals({ rows, people, positions }: any) {
  if (people.length !== 1) return null
  const g = positions.find((x: any) => x.name === people[0].position)?.guarantee || 0
  const t = rows.reduce((s: number, r: any) => s + Number(r.counted_points), 0)
  return <div className="grid grid-cols-3 gap-2 text-center">
    {[['แต้มที่นับเดือนนี้', t], ['แต้มประกัน', g], ['ส่วนที่เกินประกัน', Math.max(0, t - g)]].map(([l, v]: any) => <div key={l} className="card"><div className="text-xs text-stone-600">{l}</div><div className="text-2xl font-bold">{nf(v)}</div></div>)}
  </div>
}

const ST: any = { draft: ['แบบร่าง ยังไม่ส่ง', 'bg-stone-200'], pending: ['ส่งแล้ว รอรับรอง', 'bg-amber-100'], approved: ['รับรองแล้ว', 'bg-emerald-100'], rejected: ['ไม่รับรอง', 'bg-red-100'] }
async function openEvidence(sb: any, path: string) { const tab = window.open('about:blank', '_blank'); if (!tab) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง'); return } const { data, error } = await sb.storage.from('p4p-evidence').createSignedUrl(path, 300); if (error || !data?.signedUrl) { tab.close(); alert('เปิดรูปหลักฐานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือการตั้งค่า Storage'); return } tab.location.href = data.signedUrl }

function LogTable({ sb, rows: allRows, reload, canApprove, showName = true, readOnly = false, acts = [], editTargetRow = null, clearEditTarget = () => {} }: any) {
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
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const sortedRows = useMemo(() => [...(rows || [])].sort((a: any, b: any) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0
    if (at !== bt) return bt - at
    const ai = Number(a.id) || 0; const bi = Number(b.id) || 0
    return bi - ai
  }), [rows])
  const displayedRows = useMemo(() => sortedRows.filter((r: any) => (!filterFrom || String(r.work_date || '') >= filterFrom) && (!filterTo || String(r.work_date || '') <= filterTo)), [sortedRows, filterFrom, filterTo])
  useEffect(() => { if (!editTargetRow) return; if (editTargetRow.status === 'pending') beginEdit(editTargetRow); else alert('รายการนี้รับรองแล้ว จึงไม่สามารถแก้ไขได้'); clearEditTarget() }, [editTargetRow, clearEditTarget])
  const beginEdit = (r: any) => {
    setEditing(r)
    setForm({ work_date: r.work_date || '', activity_code: r.activity_code || '', qty: String(r.qty ?? 1), role: r.role || '', evidence: r.evidence || '', sub_activity: r.sub_activity || '', shift: r.shift || 'แสตนด์เช้า' })
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
    const activity = acts.find((a: any) => a.code === form.activity_code)
    if (!activity) { setEditError('ไม่พบกิจกรรมที่เลือกในคลังกิจกรรม'); return }
    if (activity.need_evidence && !String(form.evidence || '').trim() && !editing.evidence_image_path && !editEvidenceFile) { setEditError('กิจกรรมนี้ต้องมีหลักฐาน กรุณาระบุรายละเอียดหลักฐานหรือแนบรูปถ่าย'); return }
    if (editEvidenceFile && (!editEvidenceFile.type.startsWith('image/') || editEvidenceFile.size > 5 * 1024 * 1024)) { setEditError('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); return }
    setSaving(true)
    const payload = {
      work_date: form.work_date,
      activity_code: form.activity_code,
      qty: Number(form.qty),
      shift: form.shift || 'แสตนด์เช้า',
      role: activity.use_role_mult ? (form.role || null) : null,
      evidence: String(form.evidence || '').trim() || ((editEvidenceFile || editing.evidence_image_path) ? 'แนบรูปถ่าย' : null),
      sub_activity: String(form.sub_activity || '').trim() || null
    }
    const { error } = await sb.from('logs').update(payload).eq('id', editing.id).eq('status', 'pending')
    if (error) { setSaving(false); setEditError('บันทึกการแก้ไขไม่สำเร็จ: ' + error.message); return }
    if (editEvidenceFile) {
      const safeName = editEvidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = editing.person_id + '/' + editing.id + '/' + crypto.randomUUID() + '-' + safeName
      const { error: uploadError } = await sb.storage.from('p4p-evidence').upload(path, editEvidenceFile, { contentType: editEvidenceFile.type, upsert: false })
      if (uploadError) { setSaving(false); setEditError('บันทึกข้อความแล้ว แต่แนบรูปไม่สำเร็จ: ' + uploadError.message); reload(); return }
      const { error: pathError } = await sb.from('logs').update({ evidence_image_path: path }).eq('id', editing.id).eq('status', 'pending')
      if (pathError) { setSaving(false); setEditError('อัปโหลดรูปแล้ว แต่เชื่อมโยงรูปกับรายการไม่สำเร็จ: ' + pathError.message); reload(); return }
    }
    setSaving(false); setEditing(null); setEditEvidenceFile(null); reload()
  }
  return <div className="card overflow-x-auto p-0">
    <div className="flex flex-wrap items-end gap-3 border-b border-stone-200 p-3">
      <div><label className="field-label" htmlFor="log-filter-from">วันที่ตั้งแต่</label><input id="log-filter-from" type="date" lang="th-TH" className="inp mt-1 !w-auto" value={filterFrom} max={filterTo || undefined} onChange={e => setFilterFrom(e.target.value)} /></div>
      <div><label className="field-label" htmlFor="log-filter-to">ถึงวันที่</label><input id="log-filter-to" type="date" lang="th-TH" className="inp mt-1 !w-auto" value={filterTo} min={filterFrom || undefined} onChange={e => setFilterTo(e.target.value)} /></div>
      <button type="button" className="btn sec" onClick={() => { setFilterFrom(''); setFilterTo('') }}>ล้างตัวกรองวันที่</button>
      <p className="ml-auto text-xs text-stone-600">แสดง {displayedRows.length.toLocaleString('th-TH')} จาก {rows.length.toLocaleString('th-TH')} รายการ · เรียงรายการบันทึกล่าสุดก่อน</p>
    </div>
    <table className="w-full"><thead><tr><th>วันที่</th>{showName && <th>ชื่อ</th>}<th>กิจกรรม</th><th>จำนวน</th><th>แต้ม</th><th>ผลตรวจ</th><th>สถานะ</th><th></th></tr></thead>
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
        <td className="whitespace-nowrap">{formatThaiShortDate(r.work_date)}<div className="text-xs text-stone-500">{r.shift === 'เช้า' || r.shift === 'บ่าย' || r.shift === 'ดึก' ? 'เวร' + r.shift : 'แสตนด์เช้า'}</div></td>{showName && <td>{r.person_name}</td>}
        <td><b>{r.activity_code}</b> {r.title}{r.role && <span className="text-xs text-stone-500"> · {r.role} ×{r.mult}</span>}{r.sub_activity && <div className="text-sm mt-1">กิจกรรมย่อย: {r.sub_activity}</div>}{r.evidence && <div className="text-xs text-stone-500 mt-1">หลักฐาน: {r.evidence}</div>}{r.evidence_image_path && <div className="mt-1"><button className="text-xs underline text-teal-800" onClick={() => openEvidence(sb, r.evidence_image_path)}>ดูรูปหลักฐาน</button></div>}{r.reject_reason && r.status !== 'approved' && <div className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800"><b>{r.status === 'rejected' ? 'ไม่รับรอง เหตุผล' : 'เหตุผลที่ไม่รับรองครั้งก่อน'}:</b> {r.reject_reason}</div>}</td>
        <td>{r.qty} {r.uom}</td><td className="whitespace-nowrap">{nf(r.counted_points)}{Number(r.cap_cut) > 0 && Number(r.points_before_cap) > 0 ? <span className="text-xs text-amber-700"> (ตัดเพดาน −{nf(r.cap_cut)})</span> : Number(r.counted_points) !== Number(r.points) && <span className="text-xs text-red-700"> (ไม่นับ)</span>}</td>
        <td className="text-xs">{checkErrors.map((e: string) => <div key={e} className="text-red-700">✗ {e}</div>)}{checkWarnings.map((e: string) => <div key={e} className="text-amber-700">! {e}</div>)}{!checkErrors.length && !checkWarnings.length && <span className="text-emerald-700">✓ ผ่าน</span>}</td>
        <td><span className={`px-1.5 py-0.5 text-xs ${ST[r.status][1]}`}>{ST[r.status][0]}</span>{r.status === 'pending' && <div className="mt-0.5 text-xs text-stone-500">รอ{approverLabel(ap?.personLevel?.[r.person_id] ?? 0)}</div>}</td>
        <td className="whitespace-nowrap space-x-1">
          {!readOnly && me && r.entered_by === me && (r.status === 'draft' || r.status === 'rejected') && <>
            <button className="btn !py-0.5" onClick={() => submitRows([r.id])}>{r.status === 'rejected' ? 'ส่งใหม่' : 'ส่ง'}</button>
            <button className="btn sec !py-0.5" onClick={() => beginEdit(r)}>แก้ไข</button>
            <button className="text-xs underline text-red-700" onClick={() => del(r.id)}>ลบ</button></>}
          {!readOnly && r.status === 'pending' && canDecideRow(ap, me, r) && <><button className="btn !py-0.5" onClick={() => set(r.id, 'approved')}>รับรอง</button><button className="btn red !py-0.5" onClick={() => { setRejecting(r); setReason('') }}>ไม่รับรอง</button></>}
          {r.status === 'pending' && !canDecideRow(ap, me, r) && <span className="text-xs text-stone-500">ล็อก · รอ{approverLabel(ap?.personLevel?.[r.person_id] ?? 0)}รับรอง</span>}</td>
      </tr>})}{!displayedRows.length && <tr><td colSpan={8} className="text-center text-stone-500 py-6">{rows.length ? 'ไม่พบรายการในช่วงวันที่ที่เลือก' : 'ยังไม่มีรายการในเดือนนี้'}</td></tr>}</tbody></table>
    {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-labelledby="reject-title"><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-3">
      <h3 id="reject-title" className="text-lg font-bold">ไม่รับรองรายการ</h3>
      <p className="text-sm text-stone-700"><b>{rejecting.person_name}</b> · {formatThaiShortDate(rejecting.work_date)} · {rejecting.activity_code} {rejecting.title}</p>
      <label className="field-label block">เหตุผลที่ไม่รับรอง (ผู้บันทึกจะเห็นข้อความนี้)<textarea className="inp mt-1 min-h-[6rem]" value={reason} onChange={e => setReason(e.target.value)} autoFocus placeholder="เช่น จำนวนไม่ตรงกับเอกสาร ไม่มีหลักฐานประกอบ" /></label>
      <div className="flex justify-end gap-2"><button className="btn sec" onClick={() => setRejecting(null)}>ยกเลิก</button><button className="btn red" disabled={!reason.trim()} onClick={confirmReject}>ยืนยันไม่รับรอง</button></div></div></div>}
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-log-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b pb-3"><div><h2 id="edit-log-title" className="text-lg font-bold">แก้ไขรายการที่รอรับรอง</h2><p className="text-xs text-stone-500">แก้ไขข้อมูลได้ก่อนรับรองรายการ ระบบจะคำนวณแต้มและตรวจเงื่อนไขใหม่จากข้อมูลล่าสุด</p></div><button className="btn sec" onClick={() => setEditing(null)}>ปิด</button></div>
      {editError && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{editError}</p>}
      <label className="field-label">เวรที่ปฏิบัติ<select className="inp mt-1" value={form.shift || 'แสตนด์เช้า'} onChange={e => setForm({ ...form, shift: e.target.value })}>{SHIFTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="field-label">วันที่ปฏิบัติงาน<input type="date" lang="th-TH" className="inp mt-1" value={form.work_date} onChange={e => setForm({...form, work_date:e.target.value})} onKeyDown={e => e.preventDefault()} onPaste={e => e.preventDefault()} onDrop={e => e.preventDefault()} onClick={e => { try { (e.currentTarget as HTMLInputElement).showPicker() } catch {} }} aria-label="เลือกวันที่ปฏิบัติงานจากปฏิทินเท่านั้น" /></label>
      <label className="field-label">กิจกรรม<select className="inp mt-1" value={form.activity_code} onChange={e => setForm({...form, activity_code:e.target.value})}>{acts.filter((a:any) => a.active !== false).map((a:any) => <option key={a.code} value={a.code}>{a.code} — {a.title}</option>)}</select></label>
      {(() => { const a = acts.find((x:any) => x.code === form.activity_code); return a ? <div className={`rounded-xl border p-3 text-sm ${a.need_evidence ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><b>{a.need_evidence ? 'หลักฐานที่ต้องใช้สำหรับกิจกรรมนี้ (จำเป็น)' : 'หลักฐานประกอบ'}</b><p className="mt-1 whitespace-pre-wrap">{a.definition || (a.need_evidence ? 'กรุณาระบุหลักฐานอ้างอิงที่ตรวจสอบได้' : 'สามารถระบุเอกสารหรือรูปถ่ายประกอบได้')}</p>{a.need_evidence && <p className="mt-2 text-xs">ต้องกรอกรายละเอียดหลักฐาน หรือมีรูปหลักฐานอย่างน้อย 1 อย่าง</p>}</div> : null })()}
      <label className="field-label">จำนวน ({acts.find((a:any) => a.code === form.activity_code)?.uom || editing.uom || 'หน่วย'})<input type="number" min="0.01" step="0.5" className="inp mt-1" value={form.qty} onChange={e => setForm({...form, qty:e.target.value})} /></label>
      {acts.find((a:any) => a.code === form.activity_code)?.use_role_mult && <label className="field-label">บทบาทในกิจกรรม<select className="inp mt-1" value={form.role} onChange={e => setForm({...form, role:e.target.value})}>{ROLES.map((r:string) => <option key={r}>{r}</option>)}</select></label>}
      <label className="field-label">รายละเอียดกิจกรรมย่อย / รายละเอียดการดำเนินงาน<textarea className="inp mt-1 min-h-24" value={form.sub_activity} onChange={e => setForm({...form, sub_activity:e.target.value})} placeholder="ระบุชื่องานย่อย รายละเอียดสิ่งที่ทำ ผลลัพธ์ หรือขอบเขตงาน" /></label>
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
  const [domain, setDomain] = useState('บริหาร')
  const [category, setCategory] = useState('ทั้งหมด')
  const allLines = [...new Set([...(positions || []).map((p: any) => p.grp), ...(acts || []).flatMap((a: any) => a.eligible || [])])].filter((g: any) => g && g !== NO_LINE) as string[]
  const lines: string[] = seeAll ? [...LINE_ORDER.filter(l => allLines.includes(l)), ...allLines.filter(l => !LINE_ORDER.includes(l))] : ([myLine].filter((l: any) => l && l !== NO_LINE) as string[])
  const [line, setLine] = useState<string>(myLine && lines.includes(myLine) ? myLine : lines[0] || '')
  useEffect(() => { setCategory('ทั้งหมด') }, [line])
  useEffect(() => { if (!lines.includes(line)) setLine(myLine && lines.includes(myLine) ? myLine : lines[0] || '') }, [lines.join('|')])
  const [showAdd, setShowAdd] = useState(false)
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const groups = [...new Set((positions || []).map((p: any) => p.grp).filter((g: any) => g && g !== NO_LINE))] as string[]
  const [formLine, setFormLine] = useState<string>(line || '')
  const emptyForm = (selectedLine: string = formLine) => ({ code: '', title: '', domain: 'บริการ', category: '', main_activity: '', uom: '', minutes: '1', max_day: '', max_month: '', eligible: selectedLine ? [selectedLine] : [], need_evidence: false, definition: '', use_role_mult: false, note: '' })
  const [form, setForm] = useState<any>(() => emptyForm(line || ''))
  const codeRank = (c: string) => ({ ADM: 0, SVC: 1, ACD: 2 } as any)[String(c).slice(0, 3)] ?? 3
  const byCode = (a: any, b: any) => codeRank(a.code) - codeRank(b.code) || String(a.code).localeCompare(String(b.code))
  const inLine = (acts || []).filter((a: any) => (a.eligible || []).includes(line))
  const catsOfLine = [...new Set([...inLine].sort(byCode).map((a: any) => a.category || 'อื่นๆ'))] as string[]
  const mainsOfLine = [...new Set(inLine.map((a: any) => a.main_activity).filter(Boolean))] as string[]
  const formLineActivities = (acts || []).filter((a: any) => (a.eligible || []).includes(formLine))
  const formCategories = [...new Set(formLineActivities.map((a: any) => a.category).filter(Boolean))] as string[]
  const nextActivityCode = (selectedLine: string, selectedCategory: string, selectedDomain: string) => {
    const domainPrefix: Record<string, string> = { 'บริหาร': 'ADM', 'บริการ': 'SVC', 'วิชาการ': 'ACD' }
    const matching = (acts || []).filter((a: any) => (a.eligible || []).includes(selectedLine) && String(a.category || '').trim() === String(selectedCategory || '').trim())
    const structured = matching.map((a: any) => ({ activity: a, parts: String(a.code || '').trim().match(/^([A-Z]+)-(\d+)-(\d+)$/i) })).filter((x: any) => x.parts)
    if (structured.length) {
      // หมวดเดียวกันอาจมีข้อมูลเดิมหลายรูปแบบ/หลายชุดรหัส ให้ต่อจากชุดที่มีเลขกิจกรรมสูงสุด
      // และให้น้ำหนัก prefix ตามด้านที่เลือก เพื่อไม่ย้อนกลับไปเริ่ม ACD-01-02 เมื่อมี ACD-04-09 อยู่แล้ว
      const preferredPrefix = domainPrefix[selectedDomain] || ''
      const groupsByCode: Record<string, { prefix: string; categoryNo: string; maxItem: number }> = {}
      structured.forEach((x: any) => {
        const prefix = x.parts[1].toUpperCase()
        const categoryNo = x.parts[2]
        const key = prefix + '-' + categoryNo
        const itemNo = Number(x.parts[3] || 0)
        if (!groupsByCode[key]) groupsByCode[key] = { prefix, categoryNo, maxItem: itemNo }
        else groupsByCode[key].maxItem = Math.max(groupsByCode[key].maxItem, itemNo)
      })
      const groups = Object.values(groupsByCode)
      const preferredGroups = groups.filter(g => g.prefix === preferredPrefix)
      const candidates = preferredGroups.length ? preferredGroups : groups
      candidates.sort((a, b) => b.maxItem - a.maxItem || Number(b.categoryNo) - Number(a.categoryNo))
      const chosen = candidates[0]
      return chosen.prefix + '-' + chosen.categoryNo + '-' + String(chosen.maxItem + 1).padStart(2, '0')
    }
    const simple = matching.map((a: any) => String(a.code || '').match(/^([A-Z]+)-?(\d+)$/i)).find(Boolean)
    if (simple) {
      const prefix = simple[1].toUpperCase()
      const max = matching.reduce((n: number, a: any) => Math.max(n, Number(String(a.code).match(/(\d+)$/)?.[1] || 0)), 0)
      return prefix + '-' + String(max + 1).padStart(3, '0')
    }
    const prefix = domainPrefix[selectedDomain] || 'ACT'
    const categoryNo = String(Math.max(1, formCategories.indexOf(selectedCategory) + 1)).padStart(2, '0')
    const sameGroup = (acts || []).filter((a: any) => { const m = String(a.code || '').match(/^([A-Z]+)-(\d+)-(\d+)$/i); return (a.eligible || []).includes(selectedLine) && m && m[1].toUpperCase() === prefix && m[2] === categoryNo })
    const max = sameGroup.reduce((n: number, a: any) => Math.max(n, Number(String(a.code).match(/-(\d+)$/)?.[1] || 0)), 0)
    return prefix + '-' + categoryNo + '-' + String(max + 1).padStart(2, '0')
  }
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = inLine.filter((a: any) => (category === 'ทั้งหมด' || (a.category || 'อื่นๆ') === category) &&
    terms.every(t => [a.code, a.category, a.main_activity, a.title, a.definition, a.note].join(' ').toLowerCase().includes(t))).sort(byCode)
  const add = async () => {
    setMsg('')
    if (!formLine || !form.category || !form.code.trim() || !form.title.trim() || !form.uom.trim() || !form.minutes || Number(form.minutes) <= 0 || !form.eligible.length) {
      setMsg('กรุณาเลือกสายงานและหมวดหมู่ แล้วกรอกชื่อกิจกรรม หน่วยนับ และนาที/หน่วยให้ครบ')
      return
    }
    if (form.need_evidence && !form.definition.trim()) {
      setMsg('กิจกรรมที่บังคับใช้หลักฐาน ต้องระบุรายละเอียดหลักฐานให้ชัดเจนก่อนบันทึก')
      return
    }
    setBusy(true)
    const payload = {
      code: form.code.trim(), title: form.title.trim(), domain: form.domain, category: form.category.trim() || null, main_activity: form.main_activity.trim() || null, uom: form.uom.trim(),
      minutes: Number(form.minutes), max_day: form.max_day === '' ? null : Number(form.max_day),
      max_month: form.max_month === '' ? null : Number(form.max_month), eligible: form.eligible,
      need_evidence: form.need_evidence, definition: form.definition.trim() || null,
      use_role_mult: form.use_role_mult, note: form.note.trim() || null, active: true
    }
    const { error } = await sb.from('activities').insert(payload)
    setBusy(false)
    if (error) { setMsg(error.code === '23505' ? 'รหัสกิจกรรมนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น' : 'เพิ่มกิจกรรมไม่สำเร็จ: ' + error.message); return }
    setForm(emptyForm()); setShowAdd(false); setMsg('เพิ่มกิจกรรมสำเร็จ'); reloadActs()
  }
  const beginEditActivity = (a: any) => {
    setEditingCode(a.code)
    setFormLine((a.eligible || [])[0] || line || '')
    setForm({ code: a.code, title: a.title || '', domain: a.domain || 'บริการ', category: a.category || '', main_activity: a.main_activity || '', uom: a.uom || '', minutes: String(a.minutes ?? 1), max_day: a.max_day == null ? '' : String(a.max_day), max_month: a.max_month == null ? '' : String(a.max_month), eligible: Array.isArray(a.eligible) ? a.eligible : [], need_evidence: Boolean(a.need_evidence), definition: a.definition || '', use_role_mult: Boolean(a.use_role_mult), note: a.note || '' })
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
      title: form.title.trim(), domain: form.domain, category: form.category.trim() || null, main_activity: form.main_activity.trim() || null, uom: form.uom.trim(),
      minutes: Number(form.minutes), max_day: form.max_day === '' ? null : Number(form.max_day),
      max_month: form.max_month === '' ? null : Number(form.max_month), eligible: form.eligible,
      need_evidence: form.need_evidence, definition: form.definition.trim() || null,
      use_role_mult: form.use_role_mult, note: form.note.trim() || null
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
          <label className="field-label">1. เลือกตำแหน่งสายงาน<select className="inp mt-1" value={formLine} disabled={Boolean(editingCode)} onChange={e => { const l = e.target.value; setFormLine(l); setForm({...form, eligible: l ? [l] : [], category:'', code:''}) }}><option value="">-- เลือกสายงานก่อน --</option>{groups.map((g: string) => <option key={g} value={g}>{g}</option>)}</select></label>
          <label className="field-label">2. เลือกหมวดหมู่กิจกรรม<select className="inp mt-1" value={form.category} disabled={!formLine || Boolean(editingCode)} onChange={e => { const c = e.target.value; const existing = (acts || []).find((a: any) => (a.eligible || []).includes(formLine) && (a.category || '') === c && String(a.code || '').split('-').length === 3); const inferredDomain = existing ? ({ ADM:'บริหาร', SVC:'บริการ', ACD:'วิชาการ' } as any)[String(existing.code).split('-')[0].toUpperCase()] || form.domain : form.domain; setForm({...form, category:c, domain:inferredDomain, code:c ? nextActivityCode(formLine,c,inferredDomain) : ''}) }}><option value="">-- เลือกหมวดหมู่ --</option>{formCategories.map((c: string) => <option key={c} value={c}>{c}</option>)}</select><span className="mt-1 block text-xs text-stone-500">เลือกสายงานก่อน ระบบจะแสดงหมวดหมู่ที่มีในสายงานนั้น</span></label>
          <label className="field-label">รหัสกิจกรรม (สร้างอัตโนมัติ)<input className="inp mt-1" value={form.code} readOnly placeholder="เลือกรายการสายงานและหมวดหมู่ก่อน" /><span className="mt-1 block text-xs text-stone-500">ระบบสร้างรหัสต่อจากรหัสล่าสุดในชุดกิจกรรม</span></label>
          <label className="field-label">กิจกรรมหลัก<input className="inp mt-1" list="main-options" value={form.main_activity} onChange={e => setForm({...form, main_activity:e.target.value})} placeholder="เช่น การเคลื่อนย้ายผู้ป่วย" /></label>
          <label className="field-label">ด้านในใบสรุปคะแนน<select className="inp mt-1" value={form.domain} onChange={e => setForm({...form, domain:e.target.value, code:form.category && !editingCode ? nextActivityCode(formLine,form.category,e.target.value) : form.code})}>{['บริหาร','บริการ','วิชาการ'].map(x => <option key={x}>{x}</option>)}</select></label>
          <datalist id="cat-options">{catsOfLine.map(c => <option key={c} value={c} />)}</datalist><datalist id="main-options">{mainsOfLine.map(c => <option key={c} value={c} />)}</datalist>
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
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.use_role_mult} onChange={e => setForm({...form, use_role_mult:e.target.checked})} />คำนวณตัวคูณตามบทบาท (ประธาน / เลขานุการ-กรรมการ / ผู้เข้าร่วม)</label>
        <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={editingCode ? saveActivityEdit : add}>{busy ? 'กำลังบันทึก…' : editingCode ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรมใหม่'}</button><button className="btn sec" disabled={busy} onClick={cancelForm}>ยกเลิก</button></div>
      </div>}
      <div className="grid gap-3">
        {lines.length > 1 ? <div className="flex flex-wrap gap-2" role="tablist" aria-label="สายงาน">{lines.map(l => { const on = line === l; const n = (acts || []).filter((a: any) => (a.eligible || []).includes(l)).length
          return <button key={l} type="button" role="tab" aria-selected={on} onClick={() => setLine(l)} className={'rounded-lg border px-3 py-1.5 text-sm font-semibold ' + (on ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50')}>{LINE_LABEL[l] || l}<span className="ml-1.5 text-xs opacity-80">{n}</span></button> })}</div>
          : <p className="text-sm text-stone-700">ชุดกิจกรรมของตำแหน่งคุณ: <b className="text-teal-900">{LINE_LABEL[line] || line || 'ยังไม่กำหนด'}</b>{!line && ' · ตำแหน่งนี้ยังไม่มีชุดกิจกรรม โปรดแจ้งผู้ดูแลระบบ'}</p>}
        <input className="inp" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหา: รหัส หมวด กิจกรรมหลัก กิจกรรมย่อย หรือหลักฐาน (พิมพ์หลายคำได้)…" />
        <div className="flex flex-wrap gap-2 border-b border-stone-200" role="tablist" aria-label="หมวดของสายงาน">
          {['ทั้งหมด', ...catsOfLine].map(x => {
            const count = x === 'ทั้งหมด' ? inLine.length : inLine.filter((a: any) => (a.category || 'อื่นๆ') === x).length
            const active = category === x
            return <button key={x} type="button" role="tab" aria-selected={active} onClick={() => setCategory(x)} className={'rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors ' + (active ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-900')}>{x}<span className={'ml-2 rounded-full px-2 py-0.5 text-xs ' + (active ? 'bg-teal-100 text-teal-900' : 'bg-stone-100 text-stone-600')}>{count}</span></button>
          })}
        </div>
      </div>
      <p className="text-xs text-stone-500">หมวด{domain} · แสดง {filtered.length} จาก {(acts || []).filter((a: any) => a.domain === domain).length} กิจกรรม</p>
    </div>
    {filtered.length === 0 ? <div className="card text-center text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหา</div> :
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead><tr>
            <th className="whitespace-nowrap">รหัส</th><th>กิจกรรมหลัก / กิจกรรมย่อย</th><th>หมวด</th><th className="whitespace-nowrap">นาที / หน่วย</th><th>ข้อจำกัด</th><th>หลักฐานและเกณฑ์</th><th>สายงานที่มีสิทธิ์</th><th>หมายเหตุ</th>{isAdmin && <th>จัดการ</th>}
          </tr></thead>
          <tbody>{filtered.map((a: any) => <tr key={a.code} className="align-top">
            <td className="whitespace-nowrap font-semibold text-teal-900">{a.code}</td>
            <td className="min-w-[190px]">{a.main_activity && <div className="text-xs font-semibold text-teal-800">{a.main_activity}</div>}<div className="font-semibold">{a.title}</div>{a.need_evidence && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">ต้องมีหลักฐาน</span>}</td>
            <td className="min-w-[140px]">{a.category || '—'}</td>
            <td className="whitespace-nowrap">{a.minutes} / {a.uom || 'ไม่ระบุ'}</td>
            <td className="min-w-[130px]">{a.max_day ? <div>ต่อวัน: {a.max_day}</div> : null}{a.max_month ? <div>ต่อเดือน: {a.max_month}</div> : null}{!a.max_day && !a.max_month ? 'ไม่กำหนด' : null}</td>
            <td className="min-w-[260px]"><div className="whitespace-pre-wrap leading-relaxed">{a.definition?.trim() || 'ยังไม่ได้ระบุรายละเอียดหรือหลักฐานประกอบ โปรดสอบถามผู้ดูแลระบบก่อนบันทึกกิจกรรมนี้'}</div>{a.use_role_mult && <div className="mt-1 text-xs text-teal-800">คำนวณตัวคูณตามบทบาท</div>}</td>
            <td className="min-w-[180px]">{(a.eligible || []).join(', ') || 'ไม่ได้ระบุ'}</td>
            <td className="min-w-[160px] whitespace-pre-wrap">{a.note || '—'}</td>
            {isAdmin && <td className="whitespace-nowrap"><div className="flex flex-col items-start gap-1"><button className="btn sec !py-0.5" onClick={() => beginEditActivity(a)}>แก้ไข</button><button className="btn sec !py-0.5 !text-red-700" onClick={() => deactivate(a)}>เพิกถอน</button></div></td>}
          </tr>)}</tbody>
        </table>
      </div>}
  </div>
}

function ReviewPage({ sb, people, unit, month, acts, positions, audit, units, canPrint }: any) {
  const [printFor, setPrintFor] = useState<any>(null)
  const ap = useContext(ApproverCtx); const me = useContext(MeCtx)
  const [rowsAll, reload] = useLogs(sb, month, null, unit)
  const rows = useMemo(() => rowsAll.filter((r: any) => r.status !== 'draft'), [rowsAll])   // แบบร่างยังไม่ถึงหัวหน้า
  const [sel, setSel] = useState<string>('')
  const sum = useMemo(() => people.map((p: any) => {
    const rs = rows.filter((r: any) => r.person_id === p.id); const g = positions.find((x: any) => x.name === p.position)?.guarantee || 0
    const d = (x: string) => rs.filter((r: any) => r.domain === x).reduce((s: number, r: any) => s + Number(r.counted_points), 0)
    const tot = d('บริหาร') + d('บริการ') + d('วิชาการ')
    return { p, adm: d('บริหาร'), svc: d('บริการ'), acd: d('วิชาการ'), tot, g, appr: rs.filter((r: any) => r.status === 'approved').reduce((t: number, r: any) => t + Number(r.counted_points), 0), n: rs.length, err: rs.filter((r: any) => r.errors.length).length,
      warn: rs.filter((r: any) => r.warnings.length).length, pend: rs.filter((r: any) => r.status === 'pending').length }
  }), [rows, people, positions])
  const avg = (pos: string) => { const a = sum.filter((x: any) => x.p.position === pos && x.tot > 0); return a.length ? a.reduce((s: number, x: any) => s + x.tot, 0) / a.length : 0 }
  const bulk = async () => {
    const ids = rows.filter((r: any) => r.status === 'pending' && !r.errors.length && !r.warnings.length && canDecideRow(ap, me, r)).map((r: any) => r.id)
    if (!ids.length) return alert('ไม่มีรายการ ✓ ที่รอรับรอง')
    if (confirm(`รับรอง ${ids.length} รายการที่ผ่านการตรวจอัตโนมัติ (✓) ทั้งหมด?`)) { await sb.from('logs').update({ status: 'approved' }).in('id', ids); reload() }
  }
  const csv = () => {
    const h = ['ชื่อ', 'ตำแหน่ง', 'บริหาร', 'บริการ', 'วิชาการ', 'รวม', 'คะแนนที่รับรองแล้ว', 'แต้มประกัน']
    const b = sum.map((x: any) => [x.p.name, x.p.position, x.adm, x.svc, x.acd, x.tot, x.appr, x.g])
    const blob = new Blob(['\ufeff' + [h, ...b].map(r => r.join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `p4p_${month}.csv`; a.click()
  }
  const shown = sel ? rows.filter((r: any) => r.person_id === sel) : rows
  const stat = (l: string, v: any) => <div className="card text-center"><div className="text-xs text-stone-600">{l}</div><div className="text-xl font-bold">{v}</div></div>
  return <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {stat('แถวทั้งหมด', rows.length)}{stat('✗ ไม่นับแต้ม', rows.filter((r: any) => r.errors.length).length)}{stat('! ต้องตรวจทาน', rows.filter((r: any) => r.warnings.length).length)}
      {stat('รอรับรอง', rows.filter((r: any) => r.status === 'pending').length)}{stat('คะแนนที่รับรองแล้ว', nf(sum.reduce((t: number, x: any) => t + x.appr, 0)))}</div>
    <p className="text-sm text-stone-700">ลำดับการรับรอง: เจ้าหน้าที่ → หัวหน้างาน → หัวหน้ากลุ่มงาน → รักษาการหัวหน้าพยาบาล · <b>คุณรับรองได้เฉพาะรายการของ{ap?.role === 'admin' ? 'ทุกคน (ยกเว้นของตนเอง)' : ap?.level === 1 ? 'เจ้าหน้าที่ในหน่วยงานที่ดูแล' : ap?.level === 2 ? 'หัวหน้างานในกลุ่มงานที่ดูแล' : ap?.level === 3 ? 'หัวหน้ากลุ่มงาน' : 'ผู้ที่อยู่ในลำดับถัดไปเท่านั้น (บัญชีของคุณยังไม่มีสิทธิ์รับรอง)'}</b></p>
    <p className="text-xs text-stone-600">เงินคำนวณรายกลุ่มวิชาชีพทั้งโรงพยาบาลที่เมนู "จ่ายเงิน P4P" โดยนับเฉพาะคะแนนที่หัวหน้ารับรองแล้ว (ไม่เกิน 1.5 เท่าของแต้มประกัน)</p>
    <div className="flex gap-2">{!audit && <button className="btn" onClick={bulk}>รับรองทุกรายการที่ ✓ ผ่าน</button>}<button className="btn sec" onClick={csv}>ส่งออก CSV</button></div>
    <div className="card overflow-x-auto p-0"><table className="w-full"><thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>บริหาร</th><th>บริการ</th><th>วิชาการ</th><th>รวม</th><th>รับรองแล้ว</th><th>ประกัน</th><th>ข้อสังเกต</th>{canPrint && <th></th>}</tr></thead>
      <tbody>{sum.map((x: any) => { const a = avg(x.p.position), ratio = a ? x.tot / a : 0
        return <tr key={x.p.id} onClick={() => setSel(sel === x.p.id ? '' : x.p.id)} className={'cursor-pointer hover:bg-amber-50 ' + (sel === x.p.id ? 'bg-amber-100' : '')}>
          <td><b>{x.p.name}</b></td><td className="text-xs">{x.p.position}</td><td>{nf(x.adm)}</td><td>{nf(x.svc)}</td><td>{nf(x.acd)}</td><td><b>{nf(x.tot)}</b></td><td><b>{nf(x.appr)}</b></td><td>{nf(x.g, 0)}</td>
          <td className="text-xs text-red-700">{x.err > 0 && `✗${x.err} `}{x.warn > 0 && `!${x.warn} `}{x.pend > 0 && `รอรับรอง${x.pend} `}{ratio > 1.5 && 'สูงกว่าเฉลี่ยมาก '}{x.tot > 0 && ratio < .5 && 'ต่ำกว่าเฉลี่ยมาก'}{!x.n && 'ไม่มีบันทึก'}</td>{canPrint && <td><button type="button" className="btn sec !py-0.5 whitespace-nowrap" onClick={e => { e.stopPropagation(); setPrintFor(x.p) }}>พิมพ์ใบสรุป</button></td>}</tr> })}
        <tr className="font-bold"><td colSpan={5}>รวมทั้งหน่วย</td><td>{nf(sum.reduce((s: number, x: any) => s + x.tot, 0))}</td><td>{nf(sum.reduce((t: number, x: any) => t + x.appr, 0))}</td><td></td><td></td>{canPrint && <td></td>}</tr></tbody></table></div>
    <h2 className="font-bold">{sel ? 'รายการของ ' + people.find((p: any) => p.id === sel)?.name + ' (คลิกแถวอีกครั้งเพื่อดูทั้งหมด)' : 'รายการทั้งหมดของหน่วยงาน'}</h2>
    {printFor && <PrintSheet sb={sb} person={printFor} rows={rows.filter((r: any) => r.person_id === printFor.id)} month={month} units={units} positions={positions} onClose={() => setPrintFor(null)} />}
    <LogTable sb={sb} rows={shown} reload={reload} canApprove={!audit} readOnly={audit} acts={acts} />
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
  ['max_day_minutes', 'เวลารวมสูงสุดที่บันทึกได้ต่อคนต่อวัน (นาที)', 'เกินค่านี้ระบบจะแจ้งเตือน ! "เวลารวมในวันนี้เกินกำหนด" ให้หัวหน้าตรวจทาน (ยังนับแต้ม) · ช่วงที่ใช้ได้ 1–1,440'],
  ['mult_chair', 'ตัวคูณบทบาท – ประธาน', 'ใช้กับกิจกรรมประเภทประชุม/คณะกรรมการที่เลือกบทบาท "ประธาน"'],
  ['mult_sec', 'ตัวคูณบทบาท – เลขานุการ/กรรมการ', ''],
  ['mult_member', 'ตัวคูณบทบาท – สมาชิก/ผู้เข้าร่วม', 'ใช้เมื่อไม่ได้ระบุบทบาทด้วย'],
  ['cap_shift_points', 'เพดานคะแนนต่อเวร (คะแนน) รวมแสตนด์เช้า', 'คะแนนเกินเพดานบันทึกได้แต่ไม่นับ นับรวมทุกด้าน (บริหาร บริการ วิชาการ)'],
  ['cap_day_points', 'เพดานคะแนนรวมต่อวัน (คะแนน)', 'เวรผลัดรวมทุกเวรในวันเดียวกัน (เวรดึก 00.00–08.00 นับเป็นวันที่นั้น)']
]

// ตั้งค่าระบบ (แอดมิน): ส่วนที่ 1 ใช้ทั้งระบบ  ส่วนที่ 2 ใช้ตามหน่วยงานและเดือน (เหมือนแผ่น "ตั้งค่า" ใน Excel)
function SettingsPage({ sb }: any) {
  const [g, setG] = useState<any>({}); const [gMsg, setGMsg] = useState('')
  useEffect(() => { sb.from('app_settings').select('key,value').then((r: any) => setG(Object.fromEntries((r.data || []).map((x: any) => [x.key, String(x.value)])))) }, [])
  const saveG = async () => {
    setGMsg('')
    for (const [k, l] of GLOBAL_SETTINGS) {
      const v = Number(g[k]); const ok = k === 'max_day_minutes' ? Number.isInteger(v) && v >= 1 && v <= 1440 : k.startsWith('cap_') ? v > 0 && v <= 10000 : v > 0 && v <= 10
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
  const load = () => { sb.from('pay_groups').select('*').order('id').then((r: any) => setGs(r.data || [])); sb.from('positions').select('name,pay_group,grp,rate,guarantee').order('pay_group').then((r: any) => setPos(r.data || [])) }
  useEffect(load, [])
  const fields: [string, string][] = [['rate', 'แต้ม/นาที'], ['guarantee', 'แต้มประกัน'], ['cap_mult', 'เพดาน (เท่า)'], ['full_amount', 'ยอดต่อคน'], ['quality_pct', 'คุณภาพ %'], ['reserve_pct', 'เงินกัน %'], ['fixed_pay', 'จ่ายคงที่'], ['quality_fail_pct', 'ไม่ผ่าน ได้ %']]
  const set = (id: number, k: string, v: string) => setGs(x => x.map(g => g.id === id ? { ...g, [k]: v } : g))
  const save = async (g: any) => {
    const body: any = {}; for (const [k] of fields) { const v = Number(g[k]); if (!(v > 0)) { setMsg(`กลุ่ม ${g.id}: ค่า "${fields.find(f => f[0] === k)![1]}" ต้องมากกว่า 0`); return } body[k] = v }
    const { error } = await sb.from('pay_groups').update(body).eq('id', g.id)
    setMsg(error ? 'บันทึกไม่สำเร็จ: ' + error.message : `บันทึกกลุ่ม ${g.id} แล้ว`); load()
  }
  const setPosLine = async (name: string, grp: string) => { const { error } = await sb.from('positions').update({ grp }).eq('name', name); setMsg(error ? 'บันทึกไม่สำเร็จ: ' + error.message : `กำหนดชุดกิจกรรมของ "${name}" เป็น ${grp} แล้ว`); load() }
  const setPosGroup = async (name: string, id: number) => { const { error } = await sb.from('positions').update({ pay_group: id }).eq('name', name); setMsg(error ? 'บันทึกไม่สำเร็จ: ' + error.message : `ย้าย "${name}" ไปกลุ่ม ${id} แล้ว`); load() }
  const derived = (g: any) => { const F = Number(g.full_amount), q = Math.round(F * Number(g.quality_pct)) / 100, a = F - Math.round(q * 100) / 100, r = Math.round(a * Number(g.reserve_pct)) / 100; return { q: Math.round(q * 100) / 100, a, r: Math.round(r * 100) / 100, s: a - Math.round(r * 100) / 100 } }
  return <div className="card xl:col-span-2 space-y-3">
    <div><h2 className="text-lg font-bold">กลุ่มวิชาชีพและยอดค่าตอบแทน</h2><p className="text-sm text-stone-600">ตามตารางที่ 1 ของหลักเกณฑ์ (ใช้ค่าในวงเล็บ [ ] ไปก่อน) เงินคำนวณรายกลุ่มทั้งโรงพยาบาลที่เมนู "จ่ายเงิน P4P" การแก้ค่านี้มีผลกับแต้มและเงินของเดือนที่ยังไม่ปิดงวด</p></div>
    <div className="overflow-x-auto"><table className="w-full"><thead><tr><th>กลุ่ม</th>{fields.map(([, l]) => <th key={l}>{l}</th>)}<th>คุณภาพ / ส่วนกิจกรรม / เงินกัน / ส่วนตามคะแนน</th><th></th></tr></thead>
      <tbody>{gs.map(g => { const d = derived(g); return <tr key={g.id}><td className="min-w-[14rem]"><b>{g.name}</b></td>
        {fields.map(([k]) => <td key={k}><input className="inp !w-24" inputMode="decimal" value={g[k]} onChange={e => set(g.id, k, e.target.value)} /></td>)}
        <td className="text-xs whitespace-nowrap">{nf(d.q)} / {nf(d.a)} / {nf(d.r)} / {nf(d.s)}</td><td><button className="btn" onClick={() => save(g)}>บันทึก</button></td></tr> })}</tbody></table></div>
    {msg && <p role="status" className="text-sm text-teal-900">{msg}</p>}
    <details><summary className="cursor-pointer text-sm font-bold">ตำแหน่ง: กลุ่มวิชาชีพ และชุดกิจกรรมที่บันทึกได้</summary>
      <div className="grid sm:grid-cols-2 gap-2 mt-2">{pos.map(x => <label key={x.name} className="flex items-center gap-2 text-sm"><span className="flex-1">{x.name}</span>
        <select className="inp !w-24" aria-label="กลุ่มวิชาชีพ" value={x.pay_group} onChange={e => setPosGroup(x.name, +e.target.value)}>{gs.map(g => <option key={g.id} value={g.id}>กลุ่ม {g.id}</option>)}</select>
        <select className="inp !w-56" aria-label="ชุดกิจกรรม" value={x.grp} onChange={e => setPosLine(x.name, e.target.value)}>{[...LINE_ORDER, NO_LINE].map(l => <option key={l} value={l}>{LINE_LABEL[l] || l}</option>)}</select></label>)}</div></details>
  </div>
}

// จ่ายเงิน P4P (กรรมการ/แอดมิน): คำนวณรายกลุ่มวิชาชีพทั้งโรงพยาบาล ตามข้อ 3–5 ของหลักเกณฑ์
function PayoutPage({ sb, month, isAdmin }: any) {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(''); const [n, setN] = useState(0); const [grp, setGrp] = useState(0); const [busy, setBusy] = useState(false)
  const [qual, setQual] = useState<any>({})
  const m1 = month + '-01'
  useEffect(() => {
    let alive = true; setErr('')
    Promise.all([sb.rpc('p4p_calc', { p_month: m1 }), sb.from('unit_quality').select('unit_id,passed').eq('month', m1)]).then(([r, q]: any) => {
      if (!alive) return
      if (r.error) { setErr(r.error.message); setData(null) } else setData(r.data)
      setQual(Object.fromEntries((q.data || []).map((x: any) => [x.unit_id, x.passed])))
    })
    return () => { alive = false }
  }, [month, n])
  const refresh = () => setN(x => x + 1)
  const closed = !!data?.closed; const lines: any[] = data?.lines || []
  const unitsIn = useMemo(() => [...new Map(lines.map(l => [l.unit_id, l.unit_name])).entries()], [data])
  const setQuality = async (unit_id: number, v: string) => {
    const { error } = v === '' ? await sb.from('unit_quality').delete().eq('unit_id', unit_id).eq('month', m1) : await sb.from('unit_quality').upsert({ unit_id, month: m1, passed: v === 'pass' })
    if (error) setErr(error.message); else refresh()
  }
  const setElig = async (person_id: string, eligible: boolean) => {
    const { error } = await sb.from('person_eligibility').upsert({ person_id, month: m1, eligible })
    if (error) setErr(error.message); else refresh()
  }
  const act = async (fn: 'p4p_close' | 'p4p_reopen') => {
    if (!confirm(fn === 'p4p_close' ? `ปิดงวด ${month}? ผลคำนวณจะถูกบันทึกถาวร ยกเศษไปเดือนถัดไป และล็อกบันทึกกิจกรรมของเดือนนี้` : `เปิดงวด ${month} เพื่อแก้ไข? ผลที่ปิดไว้จะถูกลบ`)) return
    setBusy(true); const { error } = await sb.rpc(fn, { p_month: m1 }); setBusy(false)
    if (error) setErr(error.message); else refresh()
  }
  const csv = () => {
    const h = ['กลุ่ม', 'หน่วยงาน', 'ชื่อ', 'ตำแหน่ง', 'มีสิทธิ์', 'คะแนนที่รับรอง', 'คะแนนที่นับ', 'ส่วนคุณภาพ', 'ส่วนกิจกรรม', 'เงินเพิ่ม', 'รวม']
    const b = lines.map(l => [l.pay_group, l.unit_name, l.name, l.position, l.eligible ? 'ใช่' : 'ไม่', l.points, l.counted, l.quality, l.activity, l.extra, l.total])
    const blob = new Blob(['\ufeff' + [h, ...b].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `p4p_payout_${month}.csv`; a.click()
  }
  const w = data?.warnings; const shown = lines.filter(l => !grp || l.pay_group === grp)
  return <div className="space-y-4">
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold mr-auto">จ่ายเงิน P4P เดือน {month}</h2>
        {closed ? <span className="px-2 py-1 text-sm bg-emerald-100 border border-emerald-300">ปิดงวดแล้ว</span> : <span className="px-2 py-1 text-sm bg-amber-100 border border-amber-300">ร่างคำนวณ ยังไม่ปิดงวด</span>}
        <button className="btn sec" onClick={csv} disabled={!lines.length}>ส่งออก CSV</button>
        {isAdmin && !closed && <button className="btn" disabled={busy || !data} onClick={() => act('p4p_close')}>ปิดงวดเดือนนี้</button>}
        {isAdmin && closed && <button className="btn sec" disabled={busy} onClick={() => act('p4p_reopen')}>เปิดงวดเพื่อแก้ไข</button>}</div>
      {err && <p role="alert" className="text-sm text-red-700">{err}</p>}
      {!closed && w && <ul className="text-sm space-y-1">
        {w.pending_rows > 0 && <li className="text-amber-800">! ยังมีรายการรอรับรอง {w.pending_rows} รายการ ซึ่งยังไม่นับคะแนน (นับเฉพาะที่รับรองแล้ว)</li>}
        {w.quality_missing_units?.length > 0 && <li className="text-amber-800">! ยังไม่ได้บันทึกผลคุณภาพของ {w.quality_missing_units.length} หน่วยงาน (คิดเป็น "ผ่าน" ไปก่อน และปิดงวดไม่ได้จนกว่าจะบันทึกครบ)</li>}
        {w.any_closed && !w.prev_closed && <li className="text-amber-800">! เดือนก่อนหน้ายังไม่ปิดงวด เศษเงินที่ยกมาจึงยังเป็น 0 และปิดงวดเดือนนี้ไม่ได้</li>}</ul>}
    </div>
    {data && <div className="card overflow-x-auto p-0"><table className="w-full"><thead><tr><th>กลุ่มวิชาชีพ</th><th>ผู้มีสิทธิ์ / ไม่มีสิทธิ์</th><th>กองเงินเพิ่ม</th><th>คะแนนส่วนเกินรวม</th><th>บาท/คะแนนส่วนเกิน</th><th>เศษยกไป เงินเพิ่ม</th><th>เศษยกไป เฉลี่ยคืน</th></tr></thead>
      <tbody>{data.groups.map((g: any) => <tr key={g.pay_group}><td><b>{g.name}</b></td><td>{g.n_eligible} / {g.n_ineligible}</td><td>{nf(g.pool_extra)}</td><td>{nf(g.sum_excess)}</td><td>{nf(g.rate_per_point, 4)}</td><td>{nf(g.carry_extra_out)}</td><td>{nf(g.carry_quality_out)}</td></tr>)}</tbody></table></div>}
    {data && !closed && <div className="card space-y-2"><h3 className="font-bold">ผลตัวชี้วัดด้านคุณภาพรายหน่วยงาน (ข้อ 3)</h3>
      <p className="text-xs text-stone-600">ผ่านครบทุกตัวชี้วัด = ได้ส่วนคุณภาพ 100% ไม่ผ่าน = ได้ 70% ส่วนที่หักเฉลี่ยคืนให้หน่วยที่ผ่านในกลุ่มเดียวกัน</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{unitsIn.map(([id, name]: any) => <label key={id} className="flex items-center gap-2 text-sm"><span className="flex-1">{name}</span>
        <select className="inp !w-32" value={qual[id] === undefined ? '' : qual[id] ? 'pass' : 'fail'} onChange={e => setQuality(id, e.target.value)}><option value="">ยังไม่บันทึก</option><option value="pass">ผ่าน</option><option value="fail">ไม่ผ่าน</option></select></label>)}</div></div>}
    {data && <div className="flex items-center gap-2"><label className="field-label">กรองกลุ่ม</label>
      <select className="inp !w-72" value={grp} onChange={e => setGrp(+e.target.value)}><option value={0}>ทุกกลุ่ม</option>{data.groups.map((g: any) => <option key={g.pay_group} value={g.pay_group}>{g.name}</option>)}</select>
      <span className="text-sm text-stone-600">รวมจ่าย {nf(shown.reduce((t, l) => t + Number(l.total), 0))} บาท · {shown.length} คน</span></div>}
    {data && <div className="card overflow-x-auto p-0"><table className="w-full"><thead><tr><th>กลุ่ม</th><th>ชื่อ</th><th>หน่วยงาน</th><th>มีสิทธิ์</th><th>คะแนนที่รับรอง</th><th>คะแนนที่นับ</th><th>ส่วนคุณภาพ</th><th>ส่วนกิจกรรม</th><th>เงินเพิ่ม</th><th>รวม (บาท)</th></tr></thead>
      <tbody>{shown.map(l => <tr key={l.id} className={l.eligible ? '' : 'bg-stone-100 text-stone-500'}><td>{l.pay_group}</td><td><b>{l.name}</b><div className="text-xs">{l.position}</div></td><td className="text-xs">{l.unit_name}</td>
        <td><input type="checkbox" aria-label="มีสิทธิ์" checked={l.eligible} disabled={closed} onChange={e => setElig(l.id, e.target.checked)} /></td>
        <td>{nf(l.points)}</td><td>{nf(l.counted)}</td><td>{nf(l.quality)}</td><td>{nf(l.activity)}</td><td>{nf(l.extra)}</td><td><b>{nf(l.total)}</b></td></tr>)}
        {!shown.length && <tr><td colSpan={10} className="text-center text-stone-500 py-6">ยังไม่มีบุคลากร</td></tr>}</tbody></table></div>}
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
        {r.position === 'หัวหน้ากลุ่มงานการพยาบาล' && <p className="text-xs text-teal-800 mb-1">ดูแลทุกหน่วยในกลุ่มงานอัตโนมัติ: {groupOf(r) || 'ยังไม่ระบุหน่วยหลัก'}{r.role !== 'head' && ' (ต้องตั้งสิทธิ์เป็นหัวหน้างานก่อน)'}</p>}
        <div className="flex flex-wrap gap-1 mb-1">{mine.map(x => <span key={x.unit_id} className={'px-2 py-0.5 text-xs border ' + (x.approved ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-400')}>
          {uname(x.unit_id)}{!x.approved && ' · รออนุมัติ'}
          {!x.approved && <button className="ml-1 underline text-teal-800" onClick={() => approve(x.user_id, x.unit_id)}>อนุมัติ</button>}
          <button className="ml-1 text-red-700" aria-label="ลบ" onClick={() => remove(x.user_id, x.unit_id)}>×</button></span>)}</div>
        <select className="inp" value="" onChange={e => addUnit(r.user_id, +e.target.value)}><option value="">+ เพิ่มหน่วยงาน</option>{units.filter((u: any) => u.id !== r.unit_id && !mine.some(x => x.unit_id === u.id)).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </td></tr> })}</tbody></table></div>
}
