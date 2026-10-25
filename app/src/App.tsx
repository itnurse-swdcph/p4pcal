import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

const DEFAULT_CFG = { url: 'https://foypareeazfzidwygolc.supabase.co', key: 'sb_publishable_8qxOgD-AHGnv9RWWAZTUQQ_I0MPIMv3' }
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง']
const FOOTER_TEXT = '© 2026 Developed By Natnarinthorn | Nursing Informatics System'
const ROLE_TH: any = { staff: 'เจ้าหน้าที่', head: 'หัวหน้างาน', committee: 'กรรมการ P4P', admin: 'ผู้ดูแลระบบ' }
const ROLES = ['ประธาน', 'เลขานุการ/กรรมการ', 'สมาชิก/ผู้เข้าร่วม']
const nf = (n: any, d = 2) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d })
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
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
  const [f, setF] = useState<any>({ prefix: 'นางสาว', first: '', last: '', position: '', unit: '' })
  const [msg, setMsg] = useState('')
  const [extra, setExtra] = useState<number[]>([])
  const [success, setSuccess] = useState(false)
  const [positions, setPositions] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  useEffect(() => {
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
  }, [sb])
  const grp = positions.find(x => x.name === f.position)?.grp
  const groups = [...new Set(units.map((u: any) => u.parent_group))]
  const isHead = f.position === 'หัวหน้ากลุ่มงานการพยาบาล' || f.position === 'หัวหน้าหอผู้ป่วย/หัวหน้างาน'
  const primaryUnit = units.find((u: any) => String(u.id) === String(f.unit))
  const extraUnitOptions = units.filter((u: any) => String(u.id) !== String(f.unit) && !(f.position === 'หัวหน้ากลุ่มงานการพยาบาล' && primaryUnit && u.parent_group === primaryUnit.parent_group))
  const usernameValid = /^[a-z0-9][a-z0-9._-]{2,29}$/.test(username.trim().toLowerCase())
  const profileValid = f.first.trim() && f.last.trim() && f.position && f.unit
  const passwordsMatch = pw === confirmPw
  const ok = !busy && usernameValid && pw.length >= (mode === 'in' ? 1 : 6) && (mode === 'in' || (passwordsMatch && profileValid))
  const set = (k: string) => (e: any) => setF((old: any) => ({ ...old, [k]: e.target.value }))
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
          body: { username: cleanUsername, password: pw, prefix: f.prefix, first_name: f.first.trim(), last_name: f.last.trim(), position: f.position, unit_id: Number(f.unit) }
        })
        if (error) {
          let detail = ''
          try { detail = (await error.context?.json?.())?.error || '' } catch { /* use fallback below */ }
          setMsg(detail || 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        } else if (data?.error) {
          setMsg(data.error)
        } else {
          const { data: sd, error: signInError } = await sb.auth.signInWithPassword({ email: cleanUsername + '@p4p.invalid', password: pw })
          const wanted = isHead ? extra.filter(id => id !== Number(f.unit)) : []
          let extraUnitsError: any = null
          if (!signInError && sd?.user && wanted.length) {
            const result = await sb.from('profile_units').insert(wanted.map(id => ({ user_id: sd.user.id, unit_id: id, approved: true })))
            extraUnitsError = result.error
          }
          if (signInError) setMsg('ลงทะเบียนสำเร็จแล้ว แต่เข้าสู่ระบบอัตโนมัติไม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง')
          else if (extraUnitsError) setMsg('ลงทะเบียนสำเร็จ แต่บันทึกหน่วยงานเพิ่มเติมไม่สำเร็จ กรุณาแจ้งผู้ดูแลระบบ: ' + extraUnitsError.message)
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
    <div className="brand-mark"><div className="brand-mark-icon">P4P</div><div className="brand-caption">NURSING DEPARTMENT</div></div>
    <div className="auth-heading"><p className="hospital-name">กลุ่มการพยาบาล<br />โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</p><p className="eyebrow">P4P · SMART NURSING WORKFLOW</p><h1>{mode === 'in' ? 'ยินดีต้อนรับ' : 'สร้างบัญชีผู้ใช้งาน'}</h1><p>{mode === 'in' ? 'เข้าสู่ระบบบันทึกกิจกรรมและคำนวณแต้ม P4P' : 'กรอกข้อมูลเพื่อเริ่มใช้งานระบบ P4P'}</p></div>
    <div className="auth-form">
      {mode === 'up' && <>
        <div className="name-grid">
          <div className="space-y-1"><label className="field-label">คำนำหน้า</label><select className="inp" value={f.prefix} onChange={set('prefix')}>{PREFIXES.map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="space-y-1"><label className="field-label">ชื่อ</label><input className="inp" placeholder="ชื่อ" value={f.first} onChange={set('first')} /></div>
          <div className="space-y-1"><label className="field-label">นามสกุล</label><input className="inp" placeholder="นามสกุล" value={f.last} onChange={set('last')} /></div>
        </div>
        <div className="space-y-1"><label className="field-label">ตำแหน่ง</label><select className="inp" value={f.position} onChange={set('position')}><option value="">เลือกตำแหน่ง</option>{positions.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></div>
        {grp && <p className="field-hint">กลุ่มตำแหน่ง: <b>{grp}</b> · {positions.find(x => x.name === f.position)?.rate} แต้ม/นาที</p>}
        <div className="space-y-1"><label className="field-label">หน่วยงาน</label><select className="inp" value={f.unit} onChange={e => { const next = e.target.value; setF((old: any) => ({ ...old, unit: next })); setExtra(old => old.filter(id => id !== Number(next))) }}><option value="">เลือกหน่วยงาน</option>{groups.map((g: any) => <optgroup key={g} label={g}>{units.filter(u => u.parent_group === g).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>)}</select></div>
        {isHead && <div className="space-y-1">
          <label className="field-label">หน่วยงานที่ดูแลเพิ่มเติม (ถ้ามี)</label>
          {f.position === 'หัวหน้ากลุ่มงานการพยาบาล' && <p className="field-hint">หัวหน้ากลุ่มงานดูแลทุกหน่วยในกลุ่มงานเดียวกับหน่วยหลักโดยอัตโนมัติ เลือกเพิ่มได้เฉพาะหน่วยนอกกลุ่มงาน</p>}
          {!f.unit ? <p className="field-hint">กรุณาเลือกหน่วยงานหลักก่อน จึงจะเลือกหน่วยงานเพิ่มเติมได้</p> : <>
            <div className="unit-check-list">{groups.map((g: any) => {
              const options = extraUnitOptions.filter((u: any) => u.parent_group === g)
              return options.length ? <div key={g}><div className="unit-check-head">{g}</div>
                {options.map((u: any) => <label key={u.id} className="unit-check"><input type="checkbox" checked={extra.includes(u.id)} onChange={e => setExtra(x => e.target.checked ? [...x.filter(i => i !== Number(f.unit)), u.id] : x.filter(i => i !== u.id))} />{u.name}</label>)}</div> : null
            })}</div>
            <p className="field-hint">หน่วยงานเพิ่มเติมที่เลือกจะมีผลทันทีหลังลงทะเบียน ไม่ต้องรออนุมัติจากผู้ดูแลระบบ</p>
          </>}
        </div>}
      </>}
      <div className="space-y-1">
        <label className="field-label">ชื่อผู้ใช้ (Username)</label>
        <input className="inp" type="text" autoComplete="username" placeholder="เช่น nurse.somchai" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && mode === 'in' && ok && go()} />
        <p className="field-hint">ใช้ตัวอักษรภาษาอังกฤษ a–z ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3–30 ตัว</p>
      </div>
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
  const [positions, setPositions] = useState<any[]>([])
  const [actsVersion, setActsVersion] = useState(0)
  const reloadActs = () => setActsVersion(v => v + 1)
  const [month, setMonth] = useState(today().slice(0, 7)); const [tab, setTab] = useState('')
  const [unit, setUnit] = useState<number | null>(null)
  const [myUnits, setMyUnits] = useState<number[]>([])
  const loadPeople = () => sb.from('people').select('*').eq('active', true).order('name').then((r: any) => setPeople(r.data || []))
  useEffect(() => {
    sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle().then((r: any) => { if (!r.data) { setNoProfile(true); return } setProfile(r.data); setUnit(r.data.role === 'admin' ? null : (r.data.unit_id ?? null)) })
    sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.rpc('my_units').then((r: any) => setMyUnits((r.data || []).map((x: any) => (typeof x === 'object' && x ? Object.values(x)[0] : x) as number)))
    loadPeople()
  }, [])
  useEffect(() => { sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || [])) }, [actsVersion])
  if (noProfile) return <div className="p-8 space-y-3"><p>ไม่พบข้อมูลบัญชีของคุณในระบบ (บัญชีอาจถูกลบแล้ว) กรุณาออกจากระบบแล้วลงทะเบียนใหม่</p><button className="btn" onClick={() => sb.auth.signOut({ scope: 'local' })}>ออกจากระบบ</button></div>
  if (!profile) return <p className="p-8">กำลังโหลดโปรไฟล์…</p>
  const role = profile.role; const isRev = role === 'committee' || role === 'admin'
  const tabs = [...(role !== 'committee' ? [['log', 'บันทึกกิจกรรม']] : []), ['activities', 'คลังกิจกรรม'], ...(role === 'head' || role === 'admin' ? [['review', 'ตรวจ/รับรองหน่วยงาน'], ['people', 'บุคลากร']] : []), ...(isRev ? [['audit', 'คกก. P4P ตรวจสอบ']] : []), ...(role === 'admin' ? [['users', 'จัดการผู้ใช้']] : [])]
  const cur = tab || (role === 'admin' ? 'review' : tabs[0]?.[0])
  const unitOptions = role === 'head' ? units.filter(u => myUnits.includes(u.id) || u.id === profile.unit_id) : isRev ? units : units.filter(u => u.id === profile.unit_id)
  const scope = people.filter(p => (isRev || role === 'head' ? p.unit_id === unit : p.user_id === session.user.id))
  return <div className="min-h-screen flex flex-col"><div className="flex-1 w-full px-3 sm:px-6 lg:px-10 py-3 sm:py-6 space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b-2 border-stone-800 pb-3">
      <div className="mr-auto"><h1 className="text-xl font-bold leading-tight">กลุ่มการพยาบาล โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</h1><p className="text-xs font-bold text-teal-800">ระบบบันทึกกิจกรรมและคำนวณแต้ม P4P</p>
        <p className="text-sm text-stone-600">{profile.full_name || session.user.email} · <b>{ROLE_TH[role]}</b>{!isRev && units.find(u => u.id === profile.unit_id) && ` · ${units.find(u => u.id === profile.unit_id).name}`}{role === 'head' && unitOptions.length > 1 && ` (ดูแล ${unitOptions.length} หน่วยงาน)`}</p></div>
      {(isRev || (role === 'head' && unitOptions.length > 1)) && <select className="inp !w-72" aria-label="หน่วยงาน" value={unit ?? ''} onChange={e => setUnit(e.target.value ? +e.target.value : null)}>{role === 'admin' && <option value="">เลือกหน่วยงานก่อน</option>}{unitOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <input type="month" className="inp !w-40" value={month} onChange={e => setMonth(e.target.value)} />
      <button className="btn sec" onClick={() => sb.auth.signOut()}>ออกจากระบบ</button>
    </header>
    <nav className="flex gap-1 flex-wrap">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={'btn ' + (cur === k ? '' : 'sec')}>{l}</button>)}</nav>
    {tabs.length === 0 && <p>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน</p>}
    {cur === 'log' && (role === 'staff' && scope.length === 0
      ? <div className="card">ยังไม่พบชื่อของคุณในรายชื่อบุคลากร — แจ้งหัวหน้างานให้เพิ่มชื่อ "{profile.full_name}" แล้วสมัครใหม่ หรือให้ผู้ดูแลผูกบัญชีให้</div>
      : <LogPage sb={sb} people={scope} allPeople={people} unitOptions={unitOptions} defaultUnit={unit ?? profile.unit_id} acts={acts} positions={positions} month={month} canApprove={role !== 'staff'} />)}
    {cur === 'review' && role === 'admin' && !unit && <div className="card text-center space-y-2"><h2 className="font-bold">เลือกหน่วยงานเพื่อเริ่มตรวจ/รับรอง</h2><p className="text-sm text-stone-600">กรุณาเลือกหน่วยงานจากรายการด้านบน ระบบจะแสดงรายการทั้งหมดของหน่วยงานที่เลือก</p></div>}
    {cur === 'review' && !(role === 'admin' && !unit) && <ReviewPage sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} editable />}
    {cur === 'people' && <PeoplePage sb={sb} people={scope} unit={unit} positions={positions} reload={loadPeople} />}
    {cur === 'users' && <UsersPage sb={sb} units={units} />}
    {cur === 'activities' && <ActivityLibrary sb={sb} acts={acts} positions={positions} isAdmin={role === 'admin'} reloadActs={reloadActs} />}
    {cur === 'audit' && <ReviewPage sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} audit />}
    </div>
    <footer className="app-footer">{FOOTER_TEXT}</footer>
  </div>
}

function useLogs(sb: any, month: string, personIds: string[] | null, unit?: number | null) {
  const [rows, setRows] = useState<any[]>([]); const [n, setN] = useState(0)
  useEffect(() => {
    const [a, b] = mRange(month)
    let q = sb.from('v_logs').select('*').gte('work_date', a).lte('work_date', b).order('work_date', { ascending: true }).order('id', { ascending: true })
    if (unit) q = q.eq('unit_id', unit)
    if (personIds) q = q.in('person_id', personIds)
    q.then(async (r: any) => { const baseRows = r.data || []; if (!baseRows.length) { setRows([]); return } const { data: extras } = await sb.from('logs').select('id, sub_activity, evidence_image_path').in('id', baseRows.map((x: any) => x.id)); const extraMap = new Map((extras || []).map((x: any) => [x.id, x])); setRows(baseRows.map((x: any) => ({ ...x, ...(extraMap.get(x.id) || {}) }))) })
  }, [month, n, unit, personIds?.join(',')])
  return [rows, () => setN(x => x + 1)] as const
}

function LogPage({ sb, people: peopleProp, allPeople, unitOptions, defaultUnit, acts, positions, month, canApprove }: any) {
  const picker = !!canApprove // หัวหน้า/แอดมิน: เลือกหน่วยงานและบุคลากรที่จะบันทึกให้
  const [uSel, setUSel] = useState<number | null>(defaultUnit ?? unitOptions?.[0]?.id ?? null)
  const people = useMemo(() => (picker ? (allPeople || []).filter((p: any) => p.unit_id === uSel) : peopleProp), [picker, allPeople, uSel, peopleProp])
  const ids = useMemo(() => people.map((p: any) => p.id), [people])
  const [rows, reload] = useLogs(sb, month, ids)
  const [pid, setPid] = useState<any>(picker ? '' : people[0]?.id); const [date, setDate] = useState(today()); const [code, setCode] = useState('')
  const [q, setQ] = useState(''); const [role, setRole] = useState(ROLES[2]); const [qty, setQty] = useState('1'); const [ev, setEv] = useState(''); const [subActivity, setSubActivity] = useState(''); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [err, setErr] = useState(''); const [modalOpen, setModalOpen] = useState(false)
  useEffect(() => { if (!picker && !pid && people[0]) setPid(people[0].id) }, [people])
  const person = people.find((p: any) => p.id === pid); const pos = positions.find((x: any) => x.name === person?.position)
  const list = acts.filter((a: any) => (!pos || a.eligible.includes(pos.grp)) && (a.code + a.title).toLowerCase().includes(q.toLowerCase()))
  const act = acts.find((a: any) => a.code === code)
  const prev = act && pos ? act.minutes * Number(qty || 0) * pos.rate * (act.use_role_mult ? (role === ROLES[0] ? 2 : role === ROLES[1] ? 1.5 : 1) : 1) : 0
  const shown = pid ? rows.filter((r: any) => r.person_id === pid) : rows
  const save = async () => {
    setErr('')
    if (!pid) { setErr('กรุณาเลือกบุคลากรก่อน'); return }
    if (!code || !act) { setErr('กรุณาค้นหาและเลือกกิจกรรม'); return }
    if (!qty || Number(qty) <= 0) { setErr('กรุณาระบุจำนวนให้มากกว่า 0'); return }
    if (act.need_evidence && !ev.trim() && !evidenceFile) { setErr(`กิจกรรมนี้ต้องมีหลักฐาน: ${act.definition || 'กรุณาระบุเอกสารหรือแนบรูปถ่ายประกอบ'}`); return }
    const { data: inserted, error } = await sb.from('logs').insert({ person_id: pid, work_date: date, activity_code: code, role: act?.use_role_mult ? role : null, qty: +qty, evidence: ev.trim() || (evidenceFile ? 'แนบรูปถ่าย' : null), sub_activity: subActivity.trim() || null }).select('id').single()
    if (error) { setErr(error.message); return }
    if (evidenceFile && inserted?.id) {
      const safeName = evidenceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${pid}/${inserted.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await sb.storage.from('p4p-evidence').upload(path, evidenceFile, { contentType: evidenceFile.type, upsert: false })
      if (uploadError) { setErr(`บันทึกรายการแล้ว แต่แนบรูปไม่สำเร็จ: ${uploadError.message}`); reload(); return }
      const { error: pathError } = await sb.from('logs').update({ evidence_image_path: path }).eq('id', inserted.id)
      if (pathError) { setErr(`อัปโหลดรูปแล้ว แต่บันทึกการเชื่อมโยงรูปไม่สำเร็จ: ${pathError.message}`); reload(); return }
    }
    setEv(''); setSubActivity(''); setEvidenceFile(null); setQty('1'); setErr(''); setModalOpen(false); reload()
  }
  return <div className="grid lg:grid-cols-[minmax(26rem,34rem)_1fr] gap-4">
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
      <input type="date" className="inp" value={date} onChange={e => setDate(e.target.value)} />
      <input className="inp" placeholder="ค้นหากิจกรรม (รหัส/คำ)" value={q} onChange={e => setQ(e.target.value)} />
      <label className="field-label">รายการกิจกรรม</label>
      <div className="act-list" role="listbox" aria-label="รายการกิจกรรม">
        {['บริหาร', 'บริการ', 'วิชาการ'].map(d => { const items = list.filter((a: any) => a.domain === d); return items.length > 0 && <div key={d}>
          <div className="act-head">{d}</div>
          {items.map((a: any) => <button type="button" key={a.code} role="option" aria-selected={code === a.code} title={a.title} onClick={() => { setCode(a.code); setErr(''); setModalOpen(true) }} className={'act-item' + (code === a.code ? ' on' : '')}>
            <span className="act-code">{a.code}</span><span className="act-title">{a.title}</span><span className="act-uom">{a.minutes} นาที/{a.uom}</span></button>)}</div> })}
        {!list.length && <p className="p-3 text-sm text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหาหรือสิทธิ์ของตำแหน่งนี้</p>}
      </div>
      {act && <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm"><b className="text-teal-900">เลือกแล้ว: {act.code} {act.title}</b><p className="mt-1 text-xs text-teal-900">กดรายการกิจกรรมเพื่อเปิดแบบฟอร์มกรอกข้อมูล</p></div>}
      {modalOpen && act && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4"><div className="flex items-start justify-between gap-3 border-b pb-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">บันทึกกิจกรรม P4P</p><h2 id="activity-modal-title" className="text-lg font-bold text-slate-900">{act.code} {act.title}</h2><p className="mt-1 text-xs text-slate-600">{act.minutes} นาที/{act.uom}{act.max_day ? ` · สูงสุด ${act.max_day}/วัน` : ''}{act.max_month ? ` · ${act.max_month}/เดือน` : ''}</p></div><button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => { setModalOpen(false); setErr('') }}>ปิด</button></div>
      {act.need_evidence ? <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3"><p className="font-bold text-amber-900">หลักฐานที่ต้องใช้สำหรับกิจกรรมนี้ (จำเป็น)</p><p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">{act.definition?.trim() || 'กรุณาตรวจสอบแนวทาง/เกณฑ์ P4P ของกิจกรรมนี้ และระบุหลักฐานอ้างอิงที่ตรวจสอบได้ก่อนบันทึก'}</p><p className="mt-2 text-xs text-amber-900">ต้องกรอกคำอธิบายหลักฐาน หรือแนบรูปถ่ายอย่างน้อย 1 อย่าง</p></div> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-slate-800">หลักฐานประกอบ</p><p className="text-sm text-slate-700">{act.definition?.trim() || 'หากมีเอกสารอ้างอิงหรือรูปถ่ายประกอบ สามารถระบุเพิ่มเติมได้'}</p></div>}
      {act.use_role_mult && <div className="space-y-1"><label className="field-label">บทบาทในการดำเนินกิจกรรม</label><select className="inp" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></div>}
      <div className="space-y-1"><label className="field-label">จำนวน <span className="uom-chip">หน่วยนับ: {act.uom}</span></label><div className="qty-wrap"><input type="number" min="0" step="0.5" className="inp" value={qty} onChange={e => setQty(e.target.value)} placeholder="ระบุจำนวน" /><span className="qty-unit">{act.uom}</span></div></div>
      <div className="space-y-1"><label className="field-label">กิจกรรมย่อย / รายละเอียดการดำเนินงาน</label><textarea className="inp min-h-24" placeholder="ระบุชื่องานย่อย รายละเอียดสิ่งที่ทำ ผลลัพธ์ หรือขอบเขตงาน" value={subActivity} onChange={e => setSubActivity(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">รายละเอียดหลักฐาน {act.need_evidence && <span className="text-red-700">* จำเป็น</span>}</label><textarea className="inp min-h-24" placeholder={act.need_evidence ? 'ระบุหลักฐานตามรายการที่แสดงด้านบน เช่น เลขที่เอกสาร วันที่ ผู้รับรอง หรือชื่อเอกสาร' : 'ระบุเอกสารอ้างอิงหรือคำอธิบายหลักฐาน (ถ้ามี)'} value={ev} onChange={e => setEv(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">แนบรูปถ่ายหลักฐาน {act.need_evidence && <span className="text-slate-600">(หรือกรอกรายละเอียดหลักฐานด้านบน)</span>}</label><input className="inp" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0] || null; if (f && (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) { setErr('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); e.target.value = ''; setEvidenceFile(null); return } setErr(''); setEvidenceFile(f) }} /><p className="field-hint">แนบรูปถ่ายได้ 1 รูปต่อรายการ ขนาดไม่เกิน 5 MB</p>{evidenceFile && <p className="text-xs text-teal-800">ไฟล์ที่เลือก: {evidenceFile.name}</p>}</div>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">แต้มโดยประมาณ: <b>{nf(prev)}</b></div>
      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn" onClick={() => { setModalOpen(false); setErr('') }}>ยกเลิก</button><button type="button" className="btn" disabled={!pid || !code || !+qty} onClick={save}>บันทึกกิจกรรม</button></div></div></div>}
    </div>
    <div className="space-y-3">
      <Totals rows={shown} people={person ? [person] : []} positions={positions} />
      <LogTable sb={sb} rows={shown} reload={reload} canApprove={canApprove} showName={!pid && people.length > 1} acts={acts} />
    </div>
  </div>
}

function Totals({ rows, people, positions }: any) {
  if (people.length !== 1) return null
  const g = positions.find((x: any) => x.name === people[0].position)?.guarantee || 0
  const t = rows.reduce((s: number, r: any) => s + Number(r.counted_points), 0)
  return <div className="grid grid-cols-3 gap-2 text-center">
    {[['แต้มที่นับเดือนนี้', t], ['แต้มประกัน', g], ['ส่วนที่เกินประกัน', Math.max(0, t - g)]].map(([l, v]: any) => <div key={l} className="card"><div className="text-xs text-stone-600">{l}</div><div className="text-2xl font-bold">{nf(v)}</div></div>)}
  </div>
}

const ST: any = { pending: ['รอรับรอง', 'bg-amber-100'], approved: ['รับรองแล้ว', 'bg-emerald-100'], rejected: ['ไม่รับรอง', 'bg-red-100'] }
async function openEvidence(sb: any, path: string) { const tab = window.open('about:blank', '_blank'); if (!tab) { alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต Pop-up แล้วลองอีกครั้ง'); return } const { data, error } = await sb.storage.from('p4p-evidence').createSignedUrl(path, 300); if (error || !data?.signedUrl) { tab.close(); alert('เปิดรูปหลักฐานไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือการตั้งค่า Storage'); return } tab.location.href = data.signedUrl }

function LogTable({ sb, rows, reload, canApprove, showName = true, readOnly = false, acts = [] }: any) {
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editEvidenceFile, setEditEvidenceFile] = useState<File | null>(null)
  const beginEdit = (r: any) => {
    setEditing(r)
    setForm({ work_date: r.work_date || '', activity_code: r.activity_code || '', qty: String(r.qty ?? 1), role: r.role || '', evidence: r.evidence || '', sub_activity: r.sub_activity || '' })
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
    <table className="w-full"><thead><tr><th>วันที่</th>{showName && <th>ชื่อ</th>}<th>กิจกรรม</th><th>จำนวน</th><th>แต้ม</th><th>ผลตรวจ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.id}>
        <td className="whitespace-nowrap">{r.work_date}</td>{showName && <td>{r.person_name}</td>}
        <td><b>{r.activity_code}</b> {r.title}{r.role && <span className="text-xs text-stone-500"> · {r.role} ×{r.mult}</span>}{r.sub_activity && <div className="text-sm mt-1">กิจกรรมย่อย: {r.sub_activity}</div>}{r.evidence && <div className="text-xs text-stone-500 mt-1">หลักฐาน: {r.evidence}</div>}{r.evidence_image_path && <div className="mt-1"><button className="text-xs underline text-teal-800" onClick={() => openEvidence(sb, r.evidence_image_path)}>ดูรูปหลักฐาน</button></div>}</td>
        <td>{r.qty} {r.uom}</td><td className="whitespace-nowrap">{nf(r.counted_points)}{Number(r.counted_points) !== Number(r.points) && <span className="text-xs text-red-700"> (ไม่นับ)</span>}</td>
        <td className="text-xs">{r.errors.map((e: string) => <div key={e} className="text-red-700">✗ {e}</div>)}{r.warnings.map((e: string) => <div key={e} className="text-amber-700">! {e}</div>)}{!r.errors.length && !r.warnings.length && <span className="text-emerald-700">✓ ผ่าน</span>}</td>
        <td><span className={`px-1.5 py-0.5 text-xs ${ST[r.status][1]}`}>{ST[r.status][0]}</span></td>
        <td className="whitespace-nowrap space-x-1">{!readOnly && r.status === 'pending' && <button className="btn sec !py-0.5" onClick={() => beginEdit(r)}>แก้ไข</button>}
          {!readOnly && canApprove && <><button className="btn !py-0.5" onClick={() => set(r.id, 'approved')}>รับรอง</button><button className="btn red !py-0.5" onClick={() => set(r.id, 'rejected')}>ไม่รับรอง</button></>}
          {!readOnly && (canApprove || r.status === 'pending') && <button className="text-xs underline" onClick={() => del(r.id)}>ลบ</button>}</td>
      </tr>)}{!rows.length && <tr><td colSpan={8} className="text-center text-stone-500 py-6">ยังไม่มีรายการในเดือนนี้</td></tr>}</tbody></table>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-log-title"><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b pb-3"><div><h2 id="edit-log-title" className="text-lg font-bold">แก้ไขรายการที่รอรับรอง</h2><p className="text-xs text-stone-500">แก้ไขข้อมูลได้ก่อนรับรองรายการ ระบบจะคำนวณแต้มและตรวจเงื่อนไขใหม่จากข้อมูลล่าสุด</p></div><button className="btn sec" onClick={() => setEditing(null)}>ปิด</button></div>
      {editError && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">{editError}</p>}
      <label className="field-label">วันที่ปฏิบัติงาน<input type="date" className="inp mt-1" value={form.work_date} onChange={e => setForm({...form, work_date:e.target.value})} /></label>
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

function ActivityLibrary({ sb, acts, positions, isAdmin, reloadActs }: any) {
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('บริหาร')
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const groups = [...new Set((positions || []).map((p: any) => p.grp).filter(Boolean))] as string[]
  const emptyForm = () => ({ code: '', title: '', domain: 'บริการ', uom: '', minutes: '1', max_day: '', max_month: '', eligible: groups, need_evidence: false, definition: '', use_role_mult: false, note: '' })
  const [form, setForm] = useState<any>(emptyForm)
  const filtered = (acts || []).filter((a: any) =>
    a.domain === domain &&
    [a.code, a.title, a.definition, a.note].some((v: any) => String(v || '').toLowerCase().includes(query.trim().toLowerCase()))
  )
  const add = async () => {
    setMsg('')
    if (!form.code.trim() || !form.title.trim() || !form.uom.trim() || !form.minutes || Number(form.minutes) <= 0 || !form.eligible.length) {
      setMsg('กรุณากรอกรหัส ชื่อกิจกรรม หน่วยนับ นาที/หน่วย และเลือกกลุ่มตำแหน่งที่มีสิทธิ์ให้ครบ')
      return
    }
    if (form.need_evidence && !form.definition.trim()) {
      setMsg('กิจกรรมที่บังคับใช้หลักฐาน ต้องระบุรายละเอียดหลักฐานให้ชัดเจนก่อนบันทึก')
      return
    }
    setBusy(true)
    const payload = {
      code: form.code.trim(), title: form.title.trim(), domain: form.domain, uom: form.uom.trim(),
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
  const deactivate = async (a: any) => {
    if (!confirm(`ยืนยันเพิกถอนกิจกรรม ${a.code} — ${a.title} หรือไม่? กิจกรรมจะไม่ปรากฏในรายการบันทึกใหม่ แต่ประวัติที่บันทึกไว้จะยังคงอยู่`)) return
    const { error } = await sb.from('activities').update({ active: false }).eq('code', a.code)
    if (error) { setMsg('เพิกถอนกิจกรรมไม่สำเร็จ: ' + error.message); return }
    setMsg(`เพิกถอนกิจกรรม ${a.code} แล้ว`); reloadActs()
  }
  return <div className="space-y-4">
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><h2 className="text-lg font-bold">คลังกิจกรรม P4P</h2><p className="text-sm text-stone-600">ค้นหาและศึกษารายละเอียด เกณฑ์การนับแต้ม และหลักฐานประกอบของกิจกรรมทั้งหมดที่เปิดใช้งาน</p></div>
      {isAdmin && <button className="btn" onClick={() => { setShowAdd(v => !v); setMsg('') }}>{showAdd ? 'ปิดแบบฟอร์ม' : '+ เพิ่มกิจกรรม'}</button>}</div>
      {msg && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{msg}</p>}
      {showAdd && isAdmin && <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
        <h3 className="font-bold">เพิ่มกิจกรรมเข้าคลัง</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="field-label">รหัสกิจกรรม<input className="inp mt-1" value={form.code} onChange={e => setForm({...form, code:e.target.value})} placeholder="เช่น SVC-001" /></label>
          <label className="field-label">หมวดกิจกรรม<select className="inp mt-1" value={form.domain} onChange={e => setForm({...form, domain:e.target.value})}>{['บริหาร','บริการ','วิชาการ'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label sm:col-span-2">ชื่อกิจกรรม<input className="inp mt-1" value={form.title} onChange={e => setForm({...form, title:e.target.value})} /></label>
          <label className="field-label">หน่วยนับ<input className="inp mt-1" value={form.uom} onChange={e => setForm({...form, uom:e.target.value})} placeholder="เช่น ครั้ง, ราย, ชั่วโมง" /></label>
          <label className="field-label">นาทีต่อหน่วย<input type="number" min="0.01" step="0.01" className="inp mt-1" value={form.minutes} onChange={e => setForm({...form, minutes:e.target.value})} /></label>
          <label className="field-label">จำกัดจำนวนต่อวัน (ถ้ามี)<input type="number" min="0" step="0.5" className="inp mt-1" value={form.max_day} onChange={e => setForm({...form, max_day:e.target.value})} /></label>
          <label className="field-label">จำกัดจำนวนต่อเดือน (ถ้ามี)<input type="number" min="0" step="0.5" className="inp mt-1" value={form.max_month} onChange={e => setForm({...form, max_month:e.target.value})} /></label>
        </div>
        <div><p className="field-label mb-2">กลุ่มตำแหน่งที่มีสิทธิ์ทำกิจกรรม</p><div className="flex flex-wrap gap-3">{groups.map(g => <label key={g} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.eligible.includes(g)} onChange={e => setForm({...form, eligible:e.target.checked ? [...form.eligible,g] : form.eligible.filter((x: string) => x !== g)})} />{g}</label>)}</div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.need_evidence} onChange={e => setForm({...form, need_evidence:e.target.checked})} />บังคับแนบหลักฐานประกอบ</label>
        <label className="field-label">รายละเอียดกิจกรรม / หลักฐานที่ต้องใช้<textarea className="inp mt-1 min-h-24" value={form.definition} onChange={e => setForm({...form, definition:e.target.value})} placeholder="อธิบายขอบเขต เกณฑ์การนับ และเอกสาร/หลักฐานที่ต้องแนบให้ตรวจสอบได้" /></label>
        <label className="field-label">หมายเหตุ / เงื่อนไขเพิ่มเติม<textarea className="inp mt-1 min-h-16" value={form.note} onChange={e => setForm({...form, note:e.target.value})} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.use_role_mult} onChange={e => setForm({...form, use_role_mult:e.target.checked})} />คำนวณตัวคูณตามบทบาท (ประธาน / เลขานุการ-กรรมการ / ผู้เข้าร่วม)</label>
        <div className="flex flex-wrap gap-2"><button className="btn" disabled={busy} onClick={add}>{busy ? 'กำลังบันทึก…' : 'บันทึกกิจกรรมใหม่'}</button><button className="btn sec" onClick={() => {setShowAdd(false);setForm(emptyForm());setMsg('')}}>ยกเลิก</button></div>
      </div>}
      <div className="grid gap-3">
        <input className="inp" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหารหัส ชื่อกิจกรรม เกณฑ์ หรือหลักฐาน…" />
        <div className="flex flex-wrap gap-2 border-b border-stone-200" role="tablist" aria-label="หมวดกิจกรรม P4P">
          {['บริหาร','บริการ','วิชาการ'].map(x => {
            const count = (acts || []).filter((a: any) => a.domain === x).length
            const active = domain === x
            return <button key={x} type="button" role="tab" aria-selected={active} onClick={() => setDomain(x)} className={'rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ' + (active ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-900')}>{x}<span className={'ml-2 rounded-full px-2 py-0.5 text-xs ' + (active ? 'bg-teal-100 text-teal-900' : 'bg-stone-100 text-stone-600')}>{count}</span></button>
          })}
        </div>
      </div>
      <p className="text-xs text-stone-500">หมวด{domain} · แสดง {filtered.length} จาก {(acts || []).filter((a: any) => a.domain === domain).length} กิจกรรม</p>
    </div>
    {filtered.length === 0 ? <div className="card text-center text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหา</div> :
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead><tr>
            <th className="whitespace-nowrap">รหัส</th><th>ชื่อกิจกรรม</th><th>หมวด</th><th className="whitespace-nowrap">นาที / หน่วย</th><th>ข้อจำกัด</th><th>หลักฐานและเกณฑ์</th><th>กลุ่มตำแหน่งที่มีสิทธิ์</th><th>หมายเหตุ</th>{isAdmin && <th>จัดการ</th>}
          </tr></thead>
          <tbody>{filtered.map((a: any) => <tr key={a.code} className="align-top">
            <td className="whitespace-nowrap font-semibold text-teal-900">{a.code}</td>
            <td className="min-w-[190px]"><div className="font-semibold">{a.title}</div>{a.need_evidence && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">ต้องมีหลักฐาน</span>}</td>
            <td className="whitespace-nowrap">{a.domain || '—'}</td>
            <td className="whitespace-nowrap">{a.minutes} / {a.uom || 'ไม่ระบุ'}</td>
            <td className="min-w-[130px]">{a.max_day ? <div>ต่อวัน: {a.max_day}</div> : null}{a.max_month ? <div>ต่อเดือน: {a.max_month}</div> : null}{!a.max_day && !a.max_month ? 'ไม่กำหนด' : null}</td>
            <td className="min-w-[260px]"><div className="whitespace-pre-wrap leading-relaxed">{a.definition?.trim() || 'ยังไม่ได้ระบุรายละเอียดหรือหลักฐานประกอบ โปรดสอบถามผู้ดูแลระบบก่อนบันทึกกิจกรรมนี้'}</div>{a.use_role_mult && <div className="mt-1 text-xs text-teal-800">คำนวณตัวคูณตามบทบาท</div>}</td>
            <td className="min-w-[180px]">{(a.eligible || []).join(', ') || 'ไม่ได้ระบุ'}</td>
            <td className="min-w-[160px] whitespace-pre-wrap">{a.note || '—'}</td>
            {isAdmin && <td className="whitespace-nowrap"><button className="btn sec !text-red-700" onClick={() => deactivate(a)}>เพิกถอน</button></td>}
          </tr>)}</tbody>
        </table>
      </div>}
  </div>
}

function ReviewPage({ sb, people, unit, month, acts, positions, audit }: any) {
  const [rows, reload] = useLogs(sb, month, null, unit)
  const [sel, setSel] = useState<string>('')
  const [cfg, setCfg] = useState<any>({ budget: 0, baht_per_point: 0, deduct_guarantee: true })
  const m1 = month + '-01'
  useEffect(() => { sb.from('unit_settings').select('*').eq('unit_id', unit).eq('month', m1).maybeSingle().then((r: any) => setCfg(r.data || { budget: 0, baht_per_point: 0, deduct_guarantee: true })) }, [unit, month])
  const saveCfg = async () => { await sb.from('unit_settings').upsert({ unit_id: unit, month: m1, budget: +cfg.budget, baht_per_point: +cfg.baht_per_point, deduct_guarantee: cfg.deduct_guarantee }); alert('บันทึกแล้ว') }
  const sum = useMemo(() => people.map((p: any) => {
    const rs = rows.filter((r: any) => r.person_id === p.id); const g = positions.find((x: any) => x.name === p.position)?.guarantee || 0
    const d = (x: string) => rs.filter((r: any) => r.domain === x).reduce((s: number, r: any) => s + Number(r.counted_points), 0)
    const tot = d('บริหาร') + d('บริการ') + d('วิชาการ')
    return { p, adm: d('บริหาร'), svc: d('บริการ'), acd: d('วิชาการ'), tot, g, pay: cfg.deduct_guarantee ? Math.max(0, tot - g) : tot, n: rs.length, err: rs.filter((r: any) => r.errors.length).length,
      warn: rs.filter((r: any) => r.warnings.length).length, pend: rs.filter((r: any) => r.status === 'pending').length }
  }), [rows, people, positions, cfg.deduct_guarantee])
  const pool = sum.reduce((s: number, x: any) => s + x.pay, 0)
  const rate = +cfg.baht_per_point > 0 ? +cfg.baht_per_point : +cfg.budget > 0 && pool > 0 ? +cfg.budget / pool : 0
  const avg = (pos: string) => { const a = sum.filter((x: any) => x.p.position === pos && x.tot > 0); return a.length ? a.reduce((s: number, x: any) => s + x.tot, 0) / a.length : 0 }
  const bulk = async () => {
    const ids = rows.filter((r: any) => r.status === 'pending' && !r.errors.length && !r.warnings.length).map((r: any) => r.id)
    if (!ids.length) return alert('ไม่มีรายการ ✓ ที่รอรับรอง')
    if (confirm(`รับรอง ${ids.length} รายการที่ผ่านการตรวจอัตโนมัติ (✓) ทั้งหมด?`)) { await sb.from('logs').update({ status: 'approved' }).in('id', ids); reload() }
  }
  const csv = () => {
    const h = ['ชื่อ', 'ตำแหน่ง', 'บริหาร', 'บริการ', 'วิชาการ', 'รวม', 'แต้มประกัน', 'แต้มที่ใช้จัดสรร', 'เงิน(บาท)']
    const b = sum.map((x: any) => [x.p.name, x.p.position, x.adm, x.svc, x.acd, x.tot, x.g, x.pay, (x.pay * rate).toFixed(2)])
    const blob = new Blob(['\ufeff' + [h, ...b].map(r => r.join(',')).join('\n')], { type: 'text/csv' }); const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `p4p_${month}.csv`; a.click()
  }
  const shown = sel ? rows.filter((r: any) => r.person_id === sel) : rows
  const stat = (l: string, v: any) => <div className="card text-center"><div className="text-xs text-stone-600">{l}</div><div className="text-xl font-bold">{v}</div></div>
  return <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {stat('แถวทั้งหมด', rows.length)}{stat('✗ ไม่นับแต้ม', rows.filter((r: any) => r.errors.length).length)}{stat('! ต้องตรวจทาน', rows.filter((r: any) => r.warnings.length).length)}
      {stat('รอรับรอง', rows.filter((r: any) => r.status === 'pending').length)}{stat('บาท/แต้ม', nf(rate, 4))}</div>
    {audit && <div className="card flex flex-wrap gap-3 items-end">
      <label className="text-sm">งบ P4P หน่วยงาน (บาท)<input type="number" className="inp" value={cfg.budget} onChange={e => setCfg({ ...cfg, budget: e.target.value })} /></label>
      <label className="text-sm">บาท/แต้ม (ตายตัว ถ้ามี)<input type="number" className="inp" value={cfg.baht_per_point} onChange={e => setCfg({ ...cfg, baht_per_point: e.target.value })} /></label>
      <label className="text-sm flex gap-1 items-center"><input type="checkbox" checked={cfg.deduct_guarantee} onChange={e => setCfg({ ...cfg, deduct_guarantee: e.target.checked })} />หักแต้มประกัน</label>
      <button className="btn" onClick={saveCfg}>บันทึกการตั้งค่า</button></div>}
    <div className="flex gap-2">{!audit && <button className="btn" onClick={bulk}>รับรองทุกรายการที่ ✓ ผ่าน</button>}<button className="btn sec" onClick={csv}>ส่งออก CSV</button></div>
    <div className="card overflow-x-auto p-0"><table className="w-full"><thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>บริหาร</th><th>บริการ</th><th>วิชาการ</th><th>รวม</th><th>ประกัน</th><th>จัดสรร</th><th>เงิน (บาท)</th><th>ข้อสังเกต</th></tr></thead>
      <tbody>{sum.map((x: any) => { const a = avg(x.p.position), ratio = a ? x.tot / a : 0
        return <tr key={x.p.id} onClick={() => setSel(sel === x.p.id ? '' : x.p.id)} className={'cursor-pointer hover:bg-amber-50 ' + (sel === x.p.id ? 'bg-amber-100' : '')}>
          <td><b>{x.p.name}</b></td><td className="text-xs">{x.p.position}</td><td>{nf(x.adm)}</td><td>{nf(x.svc)}</td><td>{nf(x.acd)}</td><td><b>{nf(x.tot)}</b></td><td>{nf(x.g, 0)}</td><td>{nf(x.pay)}</td><td><b>{nf(x.pay * rate)}</b></td>
          <td className="text-xs text-red-700">{x.err > 0 && `✗${x.err} `}{x.warn > 0 && `!${x.warn} `}{x.pend > 0 && `รอรับรอง${x.pend} `}{ratio > 1.5 && 'สูงกว่าเฉลี่ยมาก '}{x.tot > 0 && ratio < .5 && 'ต่ำกว่าเฉลี่ยมาก'}{!x.n && 'ไม่มีบันทึก'}</td></tr> })}
        <tr className="font-bold"><td colSpan={5}>รวมทั้งหน่วย</td><td>{nf(sum.reduce((s: number, x: any) => s + x.tot, 0))}</td><td></td><td>{nf(pool)}</td><td>{nf(pool * rate)}</td><td></td></tr></tbody></table></div>
    <h2 className="font-bold">{sel ? 'รายการของ ' + people.find((p: any) => p.id === sel)?.name + ' (คลิกแถวอีกครั้งเพื่อดูทั้งหมด)' : 'รายการทั้งหมดของหน่วยงาน'}</h2>
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
