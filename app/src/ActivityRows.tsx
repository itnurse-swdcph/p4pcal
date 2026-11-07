import { Moon, Paperclip, Sun, Sunset } from 'lucide-react'

// ชิ้นส่วนแสดงผลที่ใช้ร่วมกันในตารางกิจกรรมทุกหน้า (บันทึก / รับรอง / รายบุคคล / ตรวจสอบของกรรมการ)
export const SHIFT_ORDER = ['เช้า', 'บ่าย', 'ดึก']
const SHIFT_STYLE: Record<string, { cls: string; Icon: any }> = {
  'เช้า': { cls: 'border-green-300 bg-green-100 text-green-900', Icon: Sun },
  'บ่าย': { cls: 'border-orange-300 bg-orange-100 text-orange-900', Icon: Sunset },
  'ดึก': { cls: 'border-indigo-300 bg-indigo-100 text-indigo-900', Icon: Moon }
}

/** ป้ายเวรแบบสี: เช้า/บ่าย/ดึก (เวรอื่นหรือไม่ระบุแสดงเป็น แสตนด์เช้า ตามที่ระบบเดิมใช้) */
export function ShiftBadge({ shift }: { shift?: string | null }) {
  const known = SHIFT_STYLE[String(shift || '')]
  const style = known || { cls: 'border-stone-300 bg-stone-100 text-stone-800', Icon: Sun }
  const Icon = style.Icon
  return <span className={'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ' + style.cls}><Icon size={13} aria-hidden="true" />{known ? shift : 'แสตนด์เช้า'}</span>
}

export const dateParts = (d: string) => {
  const dt = new Date(String(d || '').slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return { day: 'ไม่ระบุวันที่', sub: '' }
  return {
    day: dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
    sub: `${dt.toLocaleDateString('th-TH', { weekday: 'short' })} · ${dt.toLocaleDateString('th-TH', { year: 'numeric' })}`
  }
}

/** วันที่ตัวใหญ่หนา + วันในสัปดาห์/ปีตัวเล็ก */
export function DateCell({ date }: { date: string }) {
  const dp = dateParts(date)
  return <><div className="whitespace-nowrap text-base font-bold leading-tight text-stone-900">{dp.day}</div><div className="whitespace-nowrap text-[11px] leading-tight text-stone-500">{dp.sub}</div></>
}

type DetailProps = {
  subActivity?: string | null
  evidence?: string | null
  hasImage?: boolean
  onOpenImage?: () => void
  needEvidence?: boolean
  loading?: boolean
}
/** กิจกรรมย่อย + หลักฐาน (ข้อความและรูปแนบ) สำหรับแถวที่กดขยายรายละเอียด */
export function SubActivityEvidence({ subActivity, evidence, hasImage, onOpenImage, needEvidence, loading }: DetailProps) {
  const sub = String(subActivity || '').trim()
  const ev = String(evidence || '').trim()
  const missingEvidence = !!needEvidence && !ev && !hasImage
  return <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
    <section className="rounded-lg border border-stone-200 bg-white p-3" aria-label="กิจกรรมย่อย">
      <div className="mb-1 text-xs font-bold text-stone-600">กิจกรรมย่อย / รายละเอียดการดำเนินงาน</div>
      {sub ? <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{sub}</p> : <p className="text-sm text-stone-400">{loading ? 'กำลังโหลด…' : 'ไม่ได้ระบุ'}</p>}
    </section>
    <section className={'rounded-lg border p-3 ' + (missingEvidence ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white')} aria-label="หลักฐาน">
      <div className="mb-1 text-xs font-bold text-stone-600">หลักฐาน</div>
      {ev ? <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{ev}</p> : <p className={'text-sm ' + (missingEvidence ? 'font-semibold text-amber-800' : 'text-stone-400')}>{loading ? 'กำลังโหลด…' : missingEvidence ? 'กิจกรรมนี้ต้องมีหลักฐาน แต่ยังไม่ได้ระบุ' : 'ไม่ได้ระบุหลักฐานข้อความ'}</p>}
      {hasImage && onOpenImage
        ? <button type="button" className="btn sec mt-2 !py-1 !text-xs" onClick={e => { e.stopPropagation(); onOpenImage() }}><Paperclip size={13} />เปิดดูรูปหลักฐาน</button>
        : <p className="mt-2 text-xs text-stone-400">{loading ? '' : 'ไม่มีรูปหลักฐานแนบ'}</p>}
    </section>
  </div>
}
