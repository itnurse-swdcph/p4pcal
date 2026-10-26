// สูตรจัดสรรเงิน P4P ตามชีต "ตั้งค่า" / "สรุปรายคน" ของไฟล์ Excel เดิม
//  แต้มที่ใช้จัดสรรรายคน (J) = หัก ? MAX(0, แต้มรวม(H) - แต้มประกัน(I)) : แต้มรวม(H)
//  รวมแต้มที่ใช้จัดสรร (J4)  = SUM(J)
//  อัตราที่ใช้จริง (C15)      = IF(อัตราตายตัว>0, อัตราตายตัว, IF(J4>0, งบ/J4, 0))
//  เงินรายคน (K)             = ROUND(J * อัตราที่ใช้จริง, 2)
export type AllocCfg = { budget: number; fixedRate: number; deduct: boolean }
export type AllocRow = { person_id: string; counted_points: any; guarantee: any }

export function allocate(rows: AllocRow[], cfg: AllocCfg) {
  const per = new Map<string, { tot: number; g: number }>()
  for (const r of rows) {
    const x = per.get(r.person_id) || { tot: 0, g: Number(r.guarantee || 0) }
    x.tot += Number(r.counted_points || 0)
    per.set(r.person_id, x)
  }
  let pool = 0
  const list: { id: string; tot: number; g: number; pay: number }[] = []
  per.forEach((x, id) => { const pay = cfg.deduct ? Math.max(0, x.tot - x.g) : x.tot; pool += pay; list.push({ id, ...x, pay }) })
  const budget = Number(cfg.budget) || 0, fixedRate = Number(cfg.fixedRate) || 0
  const rate = fixedRate > 0 ? fixedRate : pool > 0 ? budget / pool : 0
  const money = (pay: number) => Math.round(pay * rate * 100) / 100
  const total = list.reduce((s, x) => s + money(x.pay), 0)
  const mode: 'fixed' | 'budget' | 'nopool' | 'none' = fixedRate > 0 ? 'fixed' : budget > 0 ? (pool > 0 ? 'budget' : 'nopool') : 'none'
  return { pool, rate, total, mode, people: list.length, money }
}
