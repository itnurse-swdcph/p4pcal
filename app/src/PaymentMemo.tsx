import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, FilePlus2, Printer, Save, X } from 'lucide-react'
import { MEMO_PREFIXES } from './data/memoPrefixes'

const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const thaiDigits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
function thaiInteger(value: number): string {
  if (value === 0) return 'ศูนย์'
  if (value >= 1_000_000) return thaiInteger(Math.floor(value / 1_000_000)) + 'ล้าน' + (value % 1_000_000 ? thaiInteger(value % 1_000_000) : '')
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']
  const s = String(Math.floor(value)); let out = ''
  for (let i = 0; i < s.length; i++) {
    const n = Number(s[i]); const pos = s.length - i - 1
    if (!n) continue
    if (pos === 1 && n === 1) out += 'สิบ'
    else if (pos === 1 && n === 2) out += 'ยี่สิบ'
    else if (pos === 0 && n === 1 && s.length > 1) out += 'เอ็ด'
    else out += thaiDigits[n] + units[pos]
  }
  return out
}
function moneyText(value: number) {
  const amount = Math.max(0, Number(value) || 0)
  let baht = Math.floor(amount); let satang = Math.round((amount - baht) * 100)
  if (satang === 100) { baht += 1; satang = 0 }
  return `${baht ? thaiInteger(baht) + 'บาท' : ''}${satang ? thaiInteger(satang) + 'สตางค์' : baht ? 'ถ้วน' : 'ศูนย์บาทถ้วน'}`
}
const monthLabel = (month: string) => { const [y, m] = month.split('-').map(Number); return `${thaiMonths[(m || 1) - 1]} พ.ศ. ${(y || 0) + 543}` }
const dateThai = (value: string) => { if (!value) return '................................'; const [y, m, d] = value.split('-').map(Number); return `${d} ${thaiMonths[m - 1]} ${y + 543}` }
const officeUnitName = (value: string, prefix: 'งาน' | 'กลุ่มงาน') => {
  const name = String(value || '').trim().replace(/^(?:(?:กลุ่มงาน|งาน)\s*)+/u, '').trim()
  return name ? `${prefix}${name}` : ''
}
const fixedSigners = {
  authorName: '', authorPosition: '', committeeName: '', committeePosition: '',
  directorName: 'นายสิทธิพงษ์ ดำรงค์พิวัฒน์', directorPosition: 'นายแพทย์ชำนาญการพิเศษ',
  deputyName: 'นางสาววิยะดา สุวรรณเพชร', deputyPosition: 'นักวิชาการเงินและบัญชีปฏิบัติการ',
  adminName: 'นายจักร์พงษ์ ศุภษร', adminPosition: 'นักจัดการงานทั่วไปชำนาญการพิเศษ',
  approverName: 'นายพันธ์นพ ควรดำรงธรรม', approverPosition: 'ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน',
}
export default function PaymentMemo({ sb, groupName = '', unitName = '', month, amount = 0, profile }: any) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<any>(null)
  const [amountTextTouched, setAmountTextTouched] = useState(false)
  const prefixName = unitName || groupName
  const prefixData = useMemo(() => MEMO_PREFIXES.find(x => x.name === prefixName) || MEMO_PREFIXES.find(x => x.name === groupName), [prefixName, groupName])
  const loadHistory = async () => {
    const { data, error: e } = await sb.from('p4p_payment_memos').select('*').eq('group_name', groupName).eq('month', `${month}-01`).order('updated_at', { ascending: false })
    if (e) setError(e.message); else setHistory(data || [])
  }
  useEffect(() => { if (open) loadHistory() }, [open, groupName, month])
  const signerName = (d: any) => d?.full_name || `${d?.prefix || ''}${d?.first_name || ''} ${d?.last_name || ''}`.trim()
  const loadSignerDefaults = async () => {
    const { data } = await sb.from('staff_directory')
      .select('prefix,first_name,last_name,position,org_role,unit_name,extra_unit_names,nursing_group,extra_nursing_group_names')
      .eq('active', true)
      .or('org_role.ilike.%หัวหน้างาน%,org_role.ilike.%หัวหน้ากลุ่มงาน%,org_role.ilike.%หัวหน้าพยาบาล%,org_role.ilike.%ภารกิจด้านการพยาบาล%')
    const people = data || []
    const includesName = (value: any, expected: string) => String(value || '').split(/[,;|]/).some(name => name.trim() === expected)
    const author = unitName
      ? people.find((d: any) => String(d.org_role || '').includes('หัวหน้างาน') && (String(d.unit_name || '').trim() === unitName || includesName(d.extra_unit_names, unitName)))
      : people.find((d: any) => String(d.org_role || '').includes('หัวหน้ากลุ่มงาน') && (String(d.nursing_group || '').trim() === groupName || includesName(d.extra_nursing_group_names, groupName)))
    const chiefs = people.filter((d: any) => /หัวหน้าพยาบาล|หัวหน้าภารกิจด้านการพยาบาล/.test(String(d.org_role || '')))
    const committee = chiefs.find((d: any) => /รักษาการ/.test(String(d.org_role || ''))) || chiefs.find((d: any) => !/รักษาการ/.test(String(d.org_role || '')))
    return {
      authorName: signerName(author), authorPosition: author?.position || '',
      committeeName: signerName(committee), committeePosition: committee?.position || '',
    }
  }
  const newMemo = async () => {
    const n = Number(amount || 0)
    const signers = await loadSignerDefaults()
    setForm({ docNo: prefixData?.prefix || '', date: '', phone: prefixData?.phone || '', work: unitName || profile?.staff_group || '', group: groupName || profile?.nursing_group || '', monthText: monthLabel(month), amount: String(n.toFixed(2)), amountText: moneyText(n), ...fixedSigners, ...signers, committeeName: 'นางสาวมัณฑนา เพชรคำ', committeePosition: 'พยาบาลวิชาชีพชำนาญการพิเศษ' })
    setAmountTextTouched(false); setError('')
  }
  const field = (key: string, value: any) => setForm((v: any) => ({ ...v, [key]: value }))
  const openHistory = (row: any) => { setForm({ ...(row.payload || {}), id: row.id }); setAmountTextTouched(true); setError('') }
  const save = async () => {
    if (!form) return
    setBusy(true); setError('')
    const payload = Object.fromEntries(Object.entries(form).filter(([key]) => key !== 'id'))
    const data = { group_name: groupName, unit_name: unitName || null, unit_id: profile?.unit_id ?? null, month: `${month}-01`, memo_date: form.date || null, doc_no: form.docNo || null, amount: Number(form.amount || 0), title: 'ขออนุมัติเบิกจ่ายเงินค่าตอบแทนตามผลการปฏิบัติงาน (ฉ.12)', payload }
    const result = form.id
      ? await sb.from('p4p_payment_memos').update(data).eq('id', form.id).select('*').single()
      : await sb.from('p4p_payment_memos').insert(data).select('*').single()
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    setForm({ ...(result.data.payload || {}), id: result.data.id }); await loadHistory()
  }
  const print = () => {
    document.getElementById('payment-memo-page-rule')?.remove()
    const pageRule = document.createElement('style')
    pageRule.id = 'payment-memo-page-rule'
    pageRule.textContent = '@page { size: A4 portrait !important; margin: 10mm 15mm 5mm 30mm !important; }'
    document.head.appendChild(pageRule)
    document.body.classList.add('print-payment-memo')
    window.requestAnimationFrame(() => window.print())
  }
  useEffect(() => { const after = () => { document.body.classList.remove('print-payment-memo'); document.getElementById('payment-memo-page-rule')?.remove() }; window.addEventListener('afterprint', after); return () => window.removeEventListener('afterprint', after) }, [])
  const money = Number(form?.amount || 0)
  const officeName = unitName
    ? officeUnitName(form?.work, 'งาน')
    : officeUnitName(form?.group, 'กลุ่มงาน')
  const bodyOfficeName = unitName
    ? [officeUnitName(form?.work, 'งาน'), officeUnitName(form?.group, 'กลุ่มงาน')].filter(Boolean).join(' ')
    : officeUnitName(form?.group, 'กลุ่มงาน')
  const officialLine = `โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน${officeName ? ` ${officeName}` : ''}${form?.phone ? ` โทร. ${form.phone}` : ''}`
  const setAmount = (value: string) => { setForm((old: any) => ({ ...old, amount: value, ...(!amountTextTouched ? { amountText: moneyText(Number(value)) } : {}) })) }
  const textInput = (label: string, key: string, placeholder = '') => <label className="memo-field"><span>{label}</span><input value={form?.[key] ?? ''} onChange={e => { if (key === 'amountText') setAmountTextTouched(true); field(key, e.target.value) }} placeholder={placeholder} /></label>
  const signEdit = (label: string, nameKey: string, posKey: string) => <div className="memo-signer-fields"><b>{label}</b><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{textInput('ชื่อ-สกุล', nameKey)}{textInput('ตำแหน่ง', posKey)}</div></div>
  return <>
    <button type="button" className="btn sec" onClick={() => { setOpen(true); newMemo() }}><FilePlus2 size={16} className="inline mr-1 -mt-0.5" />บันทึกข้อความขออนุมัติจ่ายเงิน</button>
    {open && createPortal(<div className="memo-overlay no-print">
      <div className="memo-dialog">
        <header className="memo-head"><div><h2>บันทึกข้อความขออนุมัติจ่ายเงิน</h2><p>แก้ไขข้อมูลได้ และดูตัวอย่างเอกสาร A4 แบบเรียลไทม์</p></div><button className="btn sec" onClick={() => setOpen(false)}><X size={16} />ปิด</button></header>
        <div className="memo-workspace">
          <aside className="memo-editor">
            <div className="memo-action-row"><button type="button" className="btn" onClick={newMemo}><FilePlus2 size={15} />สร้างฉบับใหม่</button><button type="button" className="btn" disabled={busy} onClick={save}><Save size={15} />{busy ? 'กำลังบันทึก…' : 'บันทึกฉบับนี้'}</button><button type="button" className="btn sec" onClick={print}><Printer size={15} />พิมพ์ A4</button></div>
            {error && <p className="memo-error">{error}</p>}
            <section className="memo-section"><h3>ข้อมูลหนังสือและยอดเงิน</h3><div className="grid grid-cols-2 gap-2">{textInput('เลขที่หนังสือ (Prefix จากไฟล์)', 'docNo')}{textInput('โทรศัพท์', 'phone')}
              <label className="memo-field"><span>วันที่</span><input type="date" value={form?.date || ''} onChange={e => field('date', e.target.value)} /></label>
              {textInput('งาน', 'work')}{textInput('กลุ่มงาน', 'group')}{textInput('ประจำเดือน', 'monthText')}
              <label className="memo-field"><span>จำนวนเงิน (บาท) · จากรายงาน</span><input type="number" min="0" step="0.01" value={form?.amount ?? ''} onChange={e => setAmount(e.target.value)} /></label>
              {textInput('จำนวนเงินตัวอักษร', 'amountText')}
            </div><button type="button" className="memo-link" onClick={() => { setAmount(String(Number(amount || 0).toFixed(2))); setAmountTextTouched(false); field('amountText', moneyText(Number(amount || 0))) }}>ดึงยอดรวมล่าสุดจากรายงาน: {Number(amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</button></section>
            <section className="memo-section"><h3>ผู้จัดทำและผู้ตรวจสอบ</h3>{signEdit('ผู้เสนอขออนุมัติ', 'authorName', 'authorPosition')}{signEdit('คณะกรรมการตรวจสอบค่าคะแนน', 'committeeName', 'committeePosition')}{signEdit('ผู้อำนวยการ · ตรวจสอบและเห็นควรอนุมัติ', 'directorName', 'directorPosition')}{signEdit('รองผู้อำนวยการฝ่ายบริหาร', 'deputyName', 'deputyPosition')}{signEdit('ผู้ตรวจสอบเอกสาร', 'adminName', 'adminPosition')}{signEdit('ผู้อนุมัติ', 'approverName', 'approverPosition')}</section>
            <section className="memo-section"><h3><Clock3 size={15} className="inline mr-1" />ประวัติเอกสารของเดือนนี้</h3>{history.length ? <div className="memo-history">{history.map(row => <button key={row.id} type="button" className={'memo-history-item ' + (form?.id === row.id ? 'selected' : '')} onClick={() => openHistory(row)}><b>{row.doc_no || 'ไม่ระบุเลขที่'}</b><span>{row.memo_date ? dateThai(row.memo_date) : ''} · แก้ไขล่าสุด {row.updated_at ? new Date(row.updated_at).toLocaleString('th-TH') : ''}{Number(row.revision || 1) > 1 ? ` · รุ่น ${row.revision}` : ''}</span><span>{Number(row.amount ?? row.payload?.amount ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span></button>)}</div> : <p className="text-xs text-stone-500">ยังไม่มีประวัติที่บันทึกไว้ในเดือนนี้</p>}</section>
          </aside>
          {form && <div className="memo-preview-wrap"><div className="memo-paper">
            <div className="memo-letterhead"><img src="/garuda-emblem.png" alt="" className="memo-garuda" /><h1>บันทึกข้อความ</h1></div>
            <div className="memo-official-line"><b>ส่วนราชการ</b><span>{officialLine}</span></div>
            <div className="memo-meta memo-number"><span><b>ที่</b> {form.docNo || 'สน 0033.305/................'}</span><span>วันที่ {form.date ? dateThai(form.date) : ''}</span></div>
            <p className="memo-subject"><b>เรื่อง</b> ขออนุมัติเบิกจ่ายเงินค่าตอบแทนตามผลการปฏิบัติงาน (ฉ.12)</p>
            <p className="memo-to"><b>เรียน</b> ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน</p>
            <p className="memo-body">ด้วย{bodyOfficeName || '................................'} กลุ่มการพยาบาล โรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน มีความประสงค์จะขออนุมัติเบิกจ่ายเงินค่าตอบแทนตามผลการปฏิบัติงาน ตามหลักเกณฑ์ วิธีการ และเงื่อนไขการจ่ายเงินค่าตอบแทนตามผลการปฏิบัติงานของเจ้าหน้าที่ที่ปฏิบัติงานให้กับหน่วยบริการในสังกัดกระทรวงสาธารณสุข ประจำเดือน {form.monthText || '................'} จำนวนเงิน {money.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท ({form.amountText || moneyText(money)}) ตามรายละเอียดที่แนบมาพร้อมนี้</p>
            <p className="memo-closing">จึงเรียนมาเพื่อโปรดพิจารณา</p><MemoSign name={form.authorName} position={form.authorPosition} />
            <ApprovalBlock heading="เรียน คณะกรรมการตรวจสอบค่าคะแนนผลการปฏิบัติงาน" note="ได้ตรวจสอบความถูกต้องตามระเบียนแล้ว เห็นควรพิจารณาอนุมัติ" name={form.committeeName} position={form.committeePosition} />
            <ApprovalBlock heading="เรียน ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน" note="ได้ตรวจสอบความถูกต้องตามระเบียนแล้ว เห็นควรพิจารณาอนุมัติ" name={form.directorName} position={form.directorPosition} />
            <ApprovalBlock heading="เรียน รองผู้อำนวยการฝ่ายบริหาร" note="เพื่อโปรดทราบและเห็นควรพิจารณา" name={form.deputyName} position={form.deputyPosition} />
            <ApprovalBlock heading="เรียน ผู้อำนวยการโรงพยาบาลสมเด็จพระยุพราชสว่างแดนดิน" note="เพื่อโปรดทราบและเห็นควรพิจารณาอนุมัติ" name={form.adminName} position={form.adminPosition} />
            <div className="memo-final-approval">อนุมัติ　 /　 ไม่อนุมัติ ........................................<MemoSign name={form.approverName} position={form.approverPosition} className="memo-approver-sign" /></div>
          </div></div>}
        </div>
      </div>
    </div>, document.body)}
  </>
}
function MemoSign({ name, position, className = '' }: any) { return <div className={`memo-sign ${className}`}><div className="memo-sign-space" aria-hidden="true" /><div>({name || '................................................'})</div><div>{position || 'ตำแหน่ง................................................'}</div></div> }
function ApprovalBlock({ heading, note, name, position }: any) { return <section className="memo-approval"><p>{heading}</p><p>– {note}</p><MemoSign name={name} position={position} /></section> }

