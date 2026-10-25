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
  const groups = [...new Set(units.map(u => u.parent_group))]
  const isHead = f.position === 'หัวหน้ากลุ่มงานการพยาบาล' || f.position === 'หัวหน้าหอผู้ป่วย/หัวหน้างาน'
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
          if (!signInError && sd?.user && wanted.length) await sb.from('profile_units').insert(wanted.map(id => ({ user_id: sd.user.id, unit_id: id, approved: false })))
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
        <div className="space-y-1"><label className="field-label">หน่วยงาน</label><select className="inp" value={f.unit} onChange={set('unit')}><option value="">เลือกหน่วยงาน</option>{groups.map((g: any) => <optgroup key={g} label={g}>{units.filter(u => u.parent_group === g).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>)}</select></div>
        {isHead && <div className="space-y-1">
          <label className="field-label">หน่วยงานที่ดูแลเพิ่มเติม (ถ้ามี)</label>
          {f.position === 'หัวหน้ากลุ่มงานการพยาบาล' && <p className="field-hint">หัวหน้ากลุ่มงานดูแลทุกหน่วยในกลุ่มงานเดียวกับหน่วยหลักโดยอัตโนมัติ เลือกเพิ่มได้เฉพาะหน่วยนอกกลุ่มงาน</p>}
          <div className="unit-check-list">{groups.map((g: any) => <div key={g}><div className="unit-check-head">{g}</div>
            {units.filter(u => u.parent_group === g && String(u.id) !== String(f.unit)).map(u => <label key={u.id} className="unit-check"><input type="checkbox" checked={extra.includes(u.id)} onChange={e => setExtra(x => e.target.checked ? [...x, u.id] : x.filter(i => i !== u.id))} />{u.name}</label>)}</div>)}</div>
          <p className="field-hint">หน่วยที่เลือกเพิ่มต้องรอผู้ดูแลระบบอนุมัติ และผู้ดูแลต้องตั้งสิทธิ์หัวหน้างานให้ก่อนจึงจะใช้งานได้</p>
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
  const [month, setMonth] = useState(today().slice(0, 7)); const [tab, setTab] = useState('')
  const [unit, setUnit] = useState<number | null>(null)
  const [myUnits, setMyUnits] = useState<number[]>([])
  const loadPeople = () => sb.from('people').select('*').eq('active', true).order('name').then((r: any) => setPeople(r.data || []))
  useEffect(() => {
    sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle().then((r: any) => { if (!r.data) { setNoProfile(true); return } setProfile(r.data); setUnit(r.data.unit_id ?? null) })
    sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.rpc('my_units').then((r: any) => setMyUnits((r.data || []).map((x: any) => (typeof x === 'object' && x ? Object.values(x)[0] : x) as number)))
    loadPeople()
  }, [])
  if (noProfile) return <div className="p-8 space-y-3"><p>ไม่พบข้อมูลบัญชีของคุณในระบบ (บัญชีอาจถูกลบแล้ว) กรุณาออกจากระบบแล้วลงทะเบียนใหม่</p><button className="btn" onClick={() => sb.auth.signOut({ scope: 'local' })}>ออกจากระบบ</button></div>
  if (!profile) return <p className="p-8">กำลังโหลดโปรไฟล์…</p>
  const role = profile.role; const isRev = role === 'committee' || role === 'admin'
  const tabs = [...(role !== 'committee' ? [['log', 'บันทึกกิจกรรม']] : []), ...(role === 'head' || role === 'admin' ? [['review', 'ตรวจ/รับรองหน่วยงาน'], ['people', 'บุคลากร']] : []), ...(isRev ? [['audit', 'คกก. P4P ตรวจสอบ']] : []), ...(role === 'admin' ? [['users', 'จัดการผู้ใช้']] : [])]
  const cur = tab || tabs[0]?.[0]
  const unitOptions = role === 'head' ? units.filter(u => myUnits.includes(u.id) || u.id === profile.unit_id) : isRev ? units : units.filter(u => u.id === profile.unit_id)
  const scope = people.filter(p => (isRev || role === 'head' ? p.unit_id === unit : p.user_id === session.user.id))
  return <div className="min-h-screen flex flex-col"><div className="flex-1 w-full px-3 sm:px-6 lg:px-10 py-3 sm:py-6 space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b-2 border-stone-800 pb-3">
      <div className="mr-auto"><h1 className="text-xl font-bold leading-tight">กลุ่มการพยาบาล โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</h1><p className="text-xs font-bold text-teal-800">ระบบบันทึกกิจกรรมและคำนวณแต้ม P4P</p>
        <p className="text-sm text-stone-600">{profile.full_name || session.user.email} · <b>{ROLE_TH[role]}</b>{!isRev && units.find(u => u.id === profile.unit_id) && ` · ${units.find(u => u.id === profile.unit_id).name}`}{role === 'head' && unitOptions.length > 1 && ` (ดูแล ${unitOptions.length} หน่วยงาน)`}</p></div>
      {(isRev || (role === 'head' && unitOptions.length > 1)) && <select className="inp !w-72" aria-label="หน่วยงาน" value={unit ?? ''} onChange={e => setUnit(+e.target.value)}>{unitOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <input type="month" className="inp !w-40" value={month} onChange={e => setMonth(e.target.value)} />
      <button className="btn sec" onClick={() => sb.auth.signOut()}>ออกจากระบบ</button>
    </header>
    <nav className="flex gap-1 flex-wrap">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={'btn ' + (cur === k ? '' : 'sec')}>{l}</button>)}</nav>
    {tabs.length === 0 && <p>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน</p>}
    {cur === 'log' && (role === 'staff' && scope.length === 0
      ? <div className="card">ยังไม่พบชื่อของคุณในรายชื่อบุคลากร — แจ้งหัวหน้างานให้เพิ่มชื่อ "{profile.full_name}" แล้วสมัครใหม่ หรือให้ผู้ดูแลผูกบัญชีให้</div>
      : <LogPage sb={sb} people={scope} allPeople={people} unitOptions={unitOptions} defaultUnit={unit ?? profile.unit_id} acts={acts} positions={positions} month={month} canApprove={role !== 'staff'} />)}
    {cur === 'review' && <ReviewPage sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} editable />}
    {cur === 'people' && <PeoplePage sb={sb} people={scope} unit={unit} positions={positions} reload={loadPeople} />}
    {cur === 'users' && <UsersPage sb={sb} units={units} />}
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
  const [q, setQ] = useState(''); const [role, setRole] = useState(ROLES[2]); const [qty, setQty] = useState('1'); const [ev, setEv] = useState(''); const [subActivity, setSubActivity] = useState(''); const [evidenceFile, setEvidenceFile] = useState<File | null>(null); const [err, setErr] = useState('')
  useEffect(() => { if (!picker && !pid && people[0]) setPid(people[0].id) }, [people])
  const person = people.find((p: any) => p.id === pid); const pos = positions.find((x: any) => x.name === person?.position)
  const list = acts.filter((a: any) => (!pos || a.eligible.includes(pos.grp)) && (a.code + a.title).toLowerCase().includes(q.toLowerCase()))
  const act = acts.find((a: any) => a.code === code)
  const prev = act && pos ? act.minutes * Number(qty || 0) * pos.rate * (act.use_role_mult ? (role === ROLES[0] ? 2 : role === ROLES[1] ? 1.5 : 1) : 1) : 0
  const shown = pid ? rows.filter((r: any) => r.person_id === pid) : rows
  const save = async () => {
    setErr('')
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
    setEv(''); setSubActivity(''); setEvidenceFile(null); setQty('1'); setErr(''); reload()
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
          {items.map((a: any) => <button type="button" key={a.code} role="option" aria-selected={code === a.code} title={a.title} onClick={() => setCode(a.code)} className={'act-item' + (code === a.code ? ' on' : '')}>
            <span className="act-code">{a.code}</span><span className="act-title">{a.title}</span><span className="act-uom">{a.minutes} นาที/{a.uom}</span></button>)}</div> })}
        {!list.length && <p className="p-3 text-sm text-stone-500">ไม่พบกิจกรรมที่ตรงกับคำค้นหาหรือสิทธิ์ของตำแหน่งนี้</p>}
      </div>
      {act && <p className="text-xs text-stone-600"><b className="text-teal-800">{act.code} {act.title}</b><br />{act.minutes} นาที/{act.uom}{act.max_day ? ` · สูงสุด ${act.max_day}/วัน` : ''}{act.max_month ? ` · ${act.max_month}/เดือน` : ''}<br />หลักฐาน: {act.definition}{act.need_evidence && <b className="text-red-700"> (จำเป็น)</b>}</p>}
      {act?.use_role_mult && <select className="inp" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>}
      <label className="field-label">จำนวน <span className="uom-chip">หน่วยนับ: {act?.uom || 'เลือกกิจกรรมก่อน'}</span></label>
      <div className="qty-wrap"><input type="number" min="0" step="0.5" className="inp" value={qty} onChange={e => setQty(e.target.value)} placeholder="ระบุจำนวน" /><span className="qty-unit">{act?.uom || 'หน่วย'}</span></div>
      <div className="space-y-1"><label className="field-label">กิจกรรมย่อย / รายละเอียดเพิ่มเติม</label><textarea className="inp min-h-20" placeholder="ระบุชื่องานย่อยหรือรายละเอียดสิ่งที่ดำเนินการ" value={subActivity} onChange={e => setSubActivity(e.target.value)} /></div>
      <div className="space-y-1"><label className="field-label">หลักฐาน (เลือกกรอกข้อความและ/หรือแนบรูปถ่าย)</label><textarea className="inp min-h-20" placeholder="เช่น เลขที่คำสั่ง เอกสารอ้างอิง หรือคำอธิบายหลักฐาน" value={ev} onChange={e => setEv(e.target.value)} /><input className="inp" type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0] || null; if (f && (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) { setErr('กรุณาเลือกไฟล์รูปภาพ ขนาดไม่เกิน 5 MB'); e.target.value = ''; setEvidenceFile(null); return } setErr(''); setEvidenceFile(f) }} /><p className="field-hint">แนบรูปถ่ายได้ 1 รูปต่อรายการ ขนาดไม่เกิน 5 MB</p>{evidenceFile && <p className="text-xs text-teal-800">ไฟล์ที่เลือก: {evidenceFile.name}</p>}</div>
      {act && <p className="text-sm">แต้มโดยประมาณ: <b>{nf(prev)}</b></p>}
      <button className="btn w-full" disabled={!pid || !code || !+qty} onClick={save}>บันทึก</button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
    <div className="space-y-3">
      <Totals rows={shown} people={person ? [person] : []} positions={positions} />
      <LogTable sb={sb} rows={shown} reload={reload} canApprove={canApprove} showName={!pid && people.length > 1} />
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

function LogTable({ sb, rows, reload, canApprove, showName = true, readOnly = false }: any) {
  const set = async (id: number, status: string) => { await sb.from('logs').update({ status }).eq('id', id); reload() }
  const del = async (id: number) => { if (confirm('ลบรายการนี้?')) { await sb.from('logs').delete().eq('id', id); reload() } }
  return <div className="card overflow-x-auto p-0">
    <table className="w-full"><thead><tr><th>วันที่</th>{showName && <th>ชื่อ</th>}<th>กิจกรรม</th><th>จำนวน</th><th>แต้ม</th><th>ผลตรวจ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.id}>
        <td className="whitespace-nowrap">{r.work_date}</td>{showName && <td>{r.person_name}</td>}
        <td><b>{r.activity_code}</b> {r.title}{r.role && <span className="text-xs text-stone-500"> · {r.role} ×{r.mult}</span>}{r.sub_activity && <div className="text-sm mt-1">กิจกรรมย่อย: {r.sub_activity}</div>}{r.evidence && <div className="text-xs text-stone-500 mt-1">หลักฐาน: {r.evidence}</div>}{r.evidence_image_path && <div className="mt-1"><button className="text-xs underline text-teal-800" onClick={() => openEvidence(sb, r.evidence_image_path)}>ดูรูปหลักฐาน</button></div>}</td>
        <td>{r.qty} {r.uom}</td><td className="whitespace-nowrap">{nf(r.counted_points)}{Number(r.counted_points) !== Number(r.points) && <span className="text-xs text-red-700"> (ไม่นับ)</span>}</td>
        <td className="text-xs">{r.errors.map((e: string) => <div key={e} className="text-red-700">✗ {e}</div>)}{r.warnings.map((e: string) => <div key={e} className="text-amber-700">! {e}</div>)}{!r.errors.length && !r.warnings.length && <span className="text-emerald-700">✓ ผ่าน</span>}</td>
        <td><span className={`px-1.5 py-0.5 text-xs ${ST[r.status][1]}`}>{ST[r.status][0]}</span></td>
        <td className="whitespace-nowrap space-x-1">{!readOnly && canApprove && <><button className="btn !py-0.5" onClick={() => set(r.id, 'approved')}>รับรอง</button><button className="btn red !py-0.5" onClick={() => set(r.id, 'rejected')}>ไม่รับรอง</button></>}
          {!readOnly && (canApprove || r.status === 'pending') && <button className="text-xs underline" onClick={() => del(r.id)}>ลบ</button>}</td>
      </tr>)}{!rows.length && <tr><td colSpan={8} className="text-center text-stone-500 py-6">ยังไม่มีรายการในเดือนนี้</td></tr>}</tbody></table></div>
}

function ReviewPage({ sb, people, unit, month, positions, audit }: any) {
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
    <LogTable sb={sb} rows={shown} reload={reload} canApprove={!audit} readOnly={audit} />
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
