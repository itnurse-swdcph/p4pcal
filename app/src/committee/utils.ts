export const money = (v: any) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (v: any, digits = 2) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: digits })

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
export const monthLabel = (month: string) => {
  const [y, m] = String(month || '').split('-').map(Number)
  return y && m ? `${THAI_MONTHS[m - 1]} พ.ศ. ${y + 543}` : month
}
export const dateTime = (v?: string | null) => v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : ''

export const UNKNOWN_UNIT = 0
export const UNKNOWN_UNIT_NAME = 'ไม่ระบุหน่วยงาน'

/** สาเหตุที่ไม่มีสิทธิ์ ย่อเป็นข้อความสั้นสำหรับจัดกลุ่ม */
export const reasonLabel = (reason?: string) => {
  const r = String(reason || '').trim()
  if (!r) return 'ไม่ระบุเหตุผล'
  if (r.startsWith('ไม่ผ่านเกณฑ์:')) return 'ยังไม่มีกิจกรรมที่รับรอง'
  return r
}

/**
 * คำนวณว่าบุคลากรถึงแต้มประกันหรือไม่ โดยไม่ต้องรู้แต้มประกันรายบุคคล
 * p4p_alloc จ่ายยอดฐานแบบเต็ม (by_score) เมื่อถึงแต้มประกัน และจ่าย 77% (fixed) เมื่อต่ำกว่า
 * จึงเทียบ line.activity กับ group.by_score ได้ตรงตามสูตรของระบบ
 */
export const isBelowGuarantee = (line: any, group: any) =>
  !!line.eligible && !!group && Number(line.activity || 0) < Number(group.by_score || 0) - 0.005

export type Filter = 'all' | 'eligible' | 'ineligible' | 'reached' | 'below' | 'pending'

export const lineMatches = (line: any, filter: Filter) => {
  switch (filter) {
    case 'eligible': return !!line.eligible
    case 'ineligible': return !line.eligible
    case 'reached': return !!line.eligible && !line.below
    case 'below': return !!line.below
    case 'pending': return Number(line.pending || 0) > 0
    default: return true
  }
}

export type UnitStat = {
  key: number
  name: string
  group: string
  lines: any[]
  eligible: number
  ineligible: number
  reached: number
  below: number
  pending: number
  approved: number
  rejected: number
  draft: number
  peoplePending: number
  total: number
  base: number
  extra: number
  highest: any | null
  lowest: any | null
  ready: boolean
  progress: number
  submitted?: boolean
  submissionStatus?: string
}

/** รวมข้อมูลรายบุคคลเป็นสรุปรายหน่วยงาน */
export const buildUnitStats = (lines: any[], unitsMeta: any[], statusRows: any[]): UnitStat[] => {
  const meta = new Map<number, any>(unitsMeta.map(u => [Number(u.id), u]))
  const map = new Map<number, UnitStat>()
  const groupKeys = new Map<string, number>()
  const personGroupKey = new Map<string, number>()
  const groupKey = (group: string) => {
    if (!groupKeys.has(group)) groupKeys.set(group, -(groupKeys.size + 1))
    return groupKeys.get(group)!
  }
  const get = (key: number): UnitStat => {
    let s = map.get(key)
    if (!s) {
      const u = meta.get(key)
      s = {
        key, name: u?.name || UNKNOWN_UNIT_NAME, group: String(u?.parent_group || 'ไม่ระบุกลุ่มงาน').trim(),
        lines: [], eligible: 0, ineligible: 0, reached: 0, below: 0, pending: 0, approved: 0, rejected: 0, draft: 0,
        peoplePending: 0, total: 0, base: 0, extra: 0, highest: null, lowest: null, ready: false, progress: 0
      }
      map.set(key, s)
    }
    return s
  }
  for (const line of lines) {
    const synthetic = !!line.isGroupHeadWithoutUnit && !!String(line.nursing_group || '').trim()
    const effectiveKey = synthetic ? groupKey(String(line.nursing_group).trim()) : Number(line.unit_id ?? UNKNOWN_UNIT)
    const s = get(effectiveKey)
    if (synthetic) {
      s.name = 'หัวหน้ากลุ่มงาน (ไม่มีหน่วยงานย่อย)'
      s.group = String(line.nursing_group).trim()
    }
    personGroupKey.set(String(line.id), effectiveKey)
    s.lines.push(line)
    if (line.eligible) {
      s.eligible += 1
      if (line.below) s.below += 1; else s.reached += 1
      const c = Number(line.counted || 0)
      if (!s.highest || c > Number(s.highest.counted || 0)) s.highest = line
      if (!s.lowest || c < Number(s.lowest.counted || 0)) s.lowest = line
    } else s.ineligible += 1
    s.total += Number(line.total || 0)
    s.base += Number(line.activity || 0)
    s.extra += Number(line.extra || 0)
    if (Number(line.pending || 0) > 0) s.peoplePending += 1
  }
  for (const r of statusRows) {
    const effectiveKey = r.unit_id == null && personGroupKey.has(String(r.person_id))
      ? personGroupKey.get(String(r.person_id))! : Number(r.unit_id ?? UNKNOWN_UNIT)
    const s = get(effectiveKey)
    s.pending += Number(r.pending || 0)
    s.approved += Number(r.approved || 0)
    s.rejected += Number(r.rejected || 0)
    s.draft += Number(r.draft || 0)
  }
  for (const s of map.values()) {
    const decided = s.approved + s.rejected
    s.ready = s.pending === 0
    s.progress = decided + s.pending === 0 ? 100 : Math.floor((decided / (decided + s.pending)) * 100)
  }
  return [...map.values()].filter(s => s.lines.length > 0 || s.pending + s.approved + s.rejected > 0)
    .sort((a, b) => a.group.localeCompare(b.group, 'th') || a.name.localeCompare(b.name, 'th'))
}
