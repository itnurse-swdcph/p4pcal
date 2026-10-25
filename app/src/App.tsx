import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_CFG = { url: 'https://foypareeazfzidwygolc.supabase.co', key: 'sb_publishable_8qxOgD-AHGnv9RWWAZTUQQ_I0MPIMv3' }
const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ว่าที่ร้อยตรีหญิง']
const ROLE_TH: any = { staff: 'เจ้าหน้าที่', head: 'หัวหน้างาน', committee: 'กรรมการ P4P', admin: 'ผู้ดูแลระบบ' }
const ROLES = ['ประธาน', 'เลขานุการ/กรรมการ', 'สมาชิก/ผู้เข้าร่วม']
const nf = (n: any, d = 2) => Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d })
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)
const mRange = (m: string) => { const d = new Date(m + '-01'); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return [m + '-01', `${m}-${String(e.getDate()).padStart(2, '0')}`] }

export default function App() {
  const [cfg] = useState(() => JSON.parse(localStorage.getItem('p4p_cfg') || 'null') || DEFAULT_CFG)
  const sb: any = useMemo(() => createClient(cfg.url, cfg.key), [cfg])
  const [session, setSession] = useState<any>(undefined)
  useEffect(() => {
    if (!sb) return
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])
  if (session === undefined) return <p className="p-8">กำลังโหลด…</p>
  if (!session) return <Login sb={sb} reset={() => {}} />
  return <Main sb={sb} session={session} />
}

function Shell({ children }: any) {
  return <div className="min-h-screen grid place-items-center p-4"><div className="card w-full max-w-md space-y-3">{children}</div></div>
}
function Setup({ onSave }: any) {
  const [url, setUrl] = useState(''); const [key, setKey] = useState('')
  return <Shell>
    <h1 className="text-xl font-bold">เชื่อมต่อ Supabase</h1>
    <p className="text-sm text-stone-600">ใส่ Project URL และ anon (publishable) key จาก Project Settings → API</p>
    <input className="inp" placeholder="https://xxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} />
    <input className="inp" placeholder="anon / publishable key" value={key} onChange={e => setKey(e.target.value)} />
    <button className="btn" disabled={!url || !key} onClick={() => onSave({ url: url.trim(), key: key.trim() })}>บันทึก</button>
  </Shell>
}
function Login({ sb, reset }: any) {
  const [mode, setMode] = useState('in'); const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [f, setF] = useState<any>({ prefix: 'นางสาว', first: '', last: '', position: '', unit: '' }); const [msg, setMsg] = useState('')
  const [positions, setPositions] = useState<any[]>([]); const [units, setUnits] = useState<any[]>([])
  useEffect(() => {
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
  }, [])
  const grp = positions.find(x => x.name === f.position)?.grp
  const groups = [...new Set(units.map(u => u.parent_group))]
  const ok = email && pw.length >= 6 && (mode === 'in' || (f.first.trim() && f.last.trim() && f.position && f.unit))
  const go = async () => {
    setMsg('')
    const r: any = mode === 'in' ? await sb.auth.signInWithPassword({ email, password: pw })
      : await sb.auth.signUp({ email, password: pw, options: { data: { prefix: f.prefix, first_name: f.first.trim(), last_name: f.last.trim(), position: f.position, unit_id: f.unit } } })
    if (r.error) setMsg(r.error.message); else if (mode === 'up' && !r.data.session) setMsg('สมัครแล้ว โปรดยืนยันอีเมลก่อนเข้าสู่ระบบ')
  }
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  return <Shell>
    <h1 className="text-xl font-bold">P4P กลุ่มการพยาบาล</h1>
    <p className="text-sm text-stone-600">{mode === 'in' ? 'เข้าสู่ระบบบันทึกกิจกรรมและคำนวณแต้ม' : 'ลงทะเบียนผู้ใช้งานใหม่'}</p>
    {mode === 'up' && <>
      <div className="grid grid-cols-[7rem_1fr_1fr] gap-2">
        <select className="inp" value={f.prefix} onChange={set('prefix')}>{PREFIXES.map(x => <option key={x}>{x}</option>)}</select>
        <input className="inp" placeholder="ชื่อ" value={f.first} onChange={set('first')} />
        <input className="inp" placeholder="สกุล" value={f.last} onChange={set('last')} />
      </div>
      <select className="inp" value={f.position} onChange={set('position')}><option value="">เลือกตำแหน่ง</option>{positions.map(x => <option key={x.name}>{x.name}</option>)}</select>
      {grp && <p className="text-xs text-stone-600 -mt-1">กลุ่มตำแหน่ง (จัดอัตโนมัติ): <b>{grp}</b> · {positions.find(x => x.name === f.position)?.rate} แต้ม/นาที</p>}
      <select className="inp" value={f.unit} onChange={set('unit')}><option value="">เลือกหน่วยงาน</option>
        {groups.map((g: any) => <optgroup key={g} label={g}>{units.filter(u => u.parent_group === g).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>)}</select>
    </>}
    <input className="inp" type="email" placeholder="อีเมล" value={email} onChange={e => setEmail(e.target.value)} />
    <input className="inp" type="password" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && ok && go()} />
    <button className="btn w-full" disabled={!ok} onClick={go}>{mode === 'in' ? 'เข้าสู่ระบบ' : 'ลงทะเบียน'}</button>
    {msg && <p className="text-sm text-red-700">{msg}</p>}
    <button className="underline text-sm" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'ลงทะเบียนผู้ใช้ใหม่' : 'มีบัญชีแล้ว เข้าสู่ระบบ'}</button>
  </Shell>
}

function Main({ sb, session }: any) {
  const [profile, setProfile] = useState<any>(null)
  const [people, setPeople] = useState<any[]>([]); const [acts, setActs] = useState<any[]>([]); const [units, setUnits] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [month, setMonth] = useState(today().slice(0, 7)); const [tab, setTab] = useState('')
  const [unit, setUnit] = useState<number | null>(null)
  const loadPeople = () => sb.from('people').select('*').eq('active', true).order('name').then((r: any) => setPeople(r.data || []))
  useEffect(() => {
    sb.from('profiles').select('*').eq('user_id', session.user.id).single().then((r: any) => { setProfile(r.data); setUnit(r.data?.unit_id ?? null) })
    sb.from('activities').select('*').eq('active', true).order('code').then((r: any) => setActs(r.data || []))
    sb.from('units').select('*').order('id').then((r: any) => setUnits(r.data || []))
    sb.from('positions').select('*').then((r: any) => setPositions(r.data || []))
    loadPeople()
  }, [])
  if (!profile) return <p className="p-8">กำลังโหลดโปรไฟล์…</p>
  const role = profile.role; const isRev = role === 'committee' || role === 'admin'
  const tabs = [...(role !== 'committee' ? [['log', 'บันทึกกิจกรรม']] : []), ...(role === 'head' || role === 'admin' ? [['review', 'ตรวจ/รับรองหน่วยงาน'], ['people', 'บุคลากร']] : []), ...(isRev ? [['audit', 'คกก. P4P ตรวจสอบ']] : []), ...(role === 'admin' ? [['users', 'จัดการผู้ใช้']] : [])]
  const cur = tab || tabs[0]?.[0]
  const scope = people.filter(p => (isRev || role === 'head' ? p.unit_id === unit : p.user_id === session.user.id))
  return <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
    <header className="flex flex-wrap items-center gap-3 border-b-2 border-stone-800 pb-3">
      <div className="mr-auto"><h1 className="text-xl font-bold">P4P กลุ่มการพยาบาล</h1>
        <p className="text-sm text-stone-600">{profile.full_name || session.user.email} · <b>{ROLE_TH[role]}</b>{!isRev && units.find(u => u.id === profile.unit_id) && ` · ${units.find(u => u.id === profile.unit_id).name}`}</p></div>
      {(isRev) && <select className="inp !w-56" value={unit ?? ''} onChange={e => setUnit(+e.target.value)}>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
      <input type="month" className="inp !w-40" value={month} onChange={e => setMonth(e.target.value)} />
      <button className="btn sec" onClick={() => sb.auth.signOut()}>ออกจากระบบ</button>
    </header>
    <nav className="flex gap-1 flex-wrap">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={'btn ' + (cur === k ? '' : 'sec')}>{l}</button>)}</nav>
    {tabs.length === 0 && <p>บัญชีนี้ยังไม่มีสิทธิ์ใช้งาน</p>}
    {cur === 'log' && (role === 'staff' && scope.length === 0
      ? <div className="card">ยังไม่พบชื่อของคุณในรายชื่อบุคลากร — แจ้งหัวหน้างานให้เพิ่มชื่อ "{profile.full_name}" แล้วสมัครใหม่ หรือให้ผู้ดูแลผูกบัญชีให้</div>
      : <LogPage sb={sb} people={scope} acts={acts} positions={positions} month={month} canApprove={role !== 'staff'} />)}
    {cur === 'review' && <ReviewPage sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} editable />}
    {cur === 'people' && <PeoplePage sb={sb} people={scope} unit={unit} positions={positions} reload={loadPeople} />}
    {cur === 'users' && <UsersPage sb={sb} units={units} />}
    {cur === 'audit' && <ReviewPage sb={sb} people={scope} unit={unit} month={month} acts={acts} positions={positions} audit />}
  </div>
}

function useLogs(sb: any, month: string, personIds: string[] | null, unit?: number | null) {
  const [rows, setRows] = useState<any[]>([]); const [n, setN] = useState(0)
  useEffect(() => {
    const [a, b] = mRange(month)
    let q = sb.from('v_logs').select('*').gte('work_date', a).lte('work_date', b).order('work_date', { ascending: false }).order('id', { ascending: false })
    if (unit) q = q.eq('unit_id', unit)
    if (personIds) q = q.in('person_id', personIds)
    q.then((r: any) => setRows(r.data || []))
  }, [month, n, unit, personIds?.join(',')])
  return [rows, () => setN(x => x + 1)] as const
}

function LogPage({ sb, people, acts, positions, month, canApprove }: any) {
  const ids = useMemo(() => people.map((p: any) => p.id), [people])
  const [rows, reload] = useLogs(sb, month, ids)
  const [pid, setPid] = useState(people[0]?.id); const [date, setDate] = useState(today()); const [code, setCode] = useState('')
  const [q, setQ] = useState(''); const [role, setRole] = useState(ROLES[2]); const [qty, setQty] = useState('1'); const [ev, setEv] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { if (!pid && people[0]) setPid(people[0].id) }, [people])
  const person = people.find((p: any) => p.id === pid); const pos = positions.find((x: any) => x.name === person?.position)
  const list = acts.filter((a: any) => (!pos || a.eligible.includes(pos.grp)) && (a.code + a.title).toLowerCase().includes(q.toLowerCase()))
  const act = acts.find((a: any) => a.code === code)
  const prev = act && pos ? act.minutes * Number(qty || 0) * pos.rate * (act.use_role_mult ? (role === ROLES[0] ? 2 : role === ROLES[1] ? 1.5 : 1) : 1) : 0
  const save = async () => {
    setErr('')
    const { error } = await sb.from('logs').insert({ person_id: pid, work_date: date, activity_code: code, role: act?.use_role_mult ? role : null, qty: +qty, evidence: ev || null })
    if (error) setErr(error.message); else { setEv(''); setQty('1'); reload() }
  }
  return <div className="grid lg:grid-cols-[22rem_1fr] gap-4">
    <div className="card space-y-2 self-start">
      <h2 className="font-bold">เพิ่มรายการ</h2>
      {people.length > 1 && <select className="inp" value={pid} onChange={e => setPid(e.target.value)}>{people.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.position})</option>)}</select>}
      <input type="date" className="inp" value={date} onChange={e => setDate(e.target.value)} />
      <input className="inp" placeholder="ค้นหากิจกรรม (รหัส/คำ)" value={q} onChange={e => setQ(e.target.value)} />
      <select className="inp" size={6} value={code} onChange={e => setCode(e.target.value)}>
        {['บริหาร', 'บริการ', 'วิชาการ'].map(d => <optgroup key={d} label={d}>{list.filter((a: any) => a.domain === d).map((a: any) => <option key={a.code} value={a.code}>{a.code} {a.title}</option>)}</optgroup>)}
      </select>
      {act && <p className="text-xs text-stone-600">{act.minutes} นาที/{act.uom}{act.max_day ? ` · สูงสุด ${act.max_day}/วัน` : ''}{act.max_month ? ` · ${act.max_month}/เดือน` : ''}<br />หลักฐาน: {act.definition}{act.need_evidence && <b className="text-red-700"> (จำเป็น)</b>}</p>}
      {act?.use_role_mult && <select className="inp" value={role} onChange={e => setRole(e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>}
      <input type="number" min="0" step="0.5" className="inp" value={qty} onChange={e => setQty(e.target.value)} placeholder={'จำนวน (' + (act?.uom || 'หน่วย') + ')'} />
      <input className="inp" placeholder="หลักฐาน/อ้างอิง (HN, เลขคำสั่ง)" value={ev} onChange={e => setEv(e.target.value)} />
      {act && <p className="text-sm">แต้มโดยประมาณ: <b>{nf(prev)}</b></p>}
      <button className="btn w-full" disabled={!pid || !code || !+qty} onClick={save}>บันทึก</button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
    <div className="space-y-3">
      <Totals rows={rows} people={people} positions={positions} />
      <LogTable sb={sb} rows={rows} reload={reload} canApprove={canApprove} showName={people.length > 1} />
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
function LogTable({ sb, rows, reload, canApprove, showName = true, readOnly = false }: any) {
  const set = async (id: number, status: string) => { await sb.from('logs').update({ status }).eq('id', id); reload() }
  const del = async (id: number) => { if (confirm('ลบรายการนี้?')) { await sb.from('logs').delete().eq('id', id); reload() } }
  return <div className="card overflow-x-auto p-0">
    <table className="w-full"><thead><tr><th>วันที่</th>{showName && <th>ชื่อ</th>}<th>กิจกรรม</th><th>จำนวน</th><th>แต้ม</th><th>ผลตรวจ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.id}>
        <td className="whitespace-nowrap">{r.work_date}</td>{showName && <td>{r.person_name}</td>}
        <td><b>{r.activity_code}</b> {r.title}{r.role && <span className="text-xs text-stone-500"> · {r.role} ×{r.mult}</span>}{r.evidence && <div className="text-xs text-stone-500">อ้างอิง: {r.evidence}</div>}</td>
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
  const [cfg] = useState<any>({ budget: 0, baht_per_point: 0, deduct_guarantee: true })
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
  const [rows, setRows] = useState<any[]>([]); const [n, setN] = useState(0)
  useEffect(() => { sb.from('profiles').select('*').order('full_name').then((r: any) => setRows(r.data || [])) }, [n])
  const upd = async (id: string, patch: any) => { await sb.from('profiles').update(patch).eq('user_id', id); setN(x => x + 1) }
  return <div className="card p-0 overflow-x-auto"><table className="w-full"><thead><tr><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>สิทธิ์</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.user_id}><td><b>{r.full_name || '(ไม่ระบุ)'}</b></td><td className="text-xs">{r.position}</td>
      <td><select className="inp" value={r.unit_id ?? ''} onChange={e => upd(r.user_id, { unit_id: +e.target.value || null })}><option value="">-</option>{units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
      <td><select className="inp" value={r.role} onChange={e => upd(r.user_id, { role: e.target.value })}>{Object.keys(ROLE_TH).map(k => <option key={k} value={k}>{ROLE_TH[k]}</option>)}</select></td></tr>)}</tbody></table></div>
}
