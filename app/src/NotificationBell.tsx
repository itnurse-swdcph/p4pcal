import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'

type Notice = { id: number; title: string; body: string | null; entity_type: string | null; entity_id: number | null; created_at: string; read_at: string | null }

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'เมื่อสักครู่'
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`
  if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

/** กระดิ่งแจ้งเตือนของผู้ใช้ (เช่น กิจกรรมถูกกรรมการส่งกลับแก้ไข/ไม่อนุมัติ) */
export default function NotificationBell({ sb, userId, onOpenActivities }: { sb: any; userId: string; onOpenActivities?: () => void }) {
  const [items, setItems] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await sb.from('p4p_user_notifications').select('id,title,body,entity_type,entity_id,created_at,read_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
    if (!error) setItems(data || [])
  }, [sb, userId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const unread = items.filter(i => !i.read_at).length
  const markRead = async (ids: number[]) => {
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems(list => list.map(i => ids.includes(i.id) ? { ...i, read_at: now } : i))
    await sb.from('p4p_user_notifications').update({ read_at: now }).in('id', ids).eq('user_id', userId)
  }
  const click = (n: Notice) => {
    void markRead(n.read_at ? [] : [n.id])
    if (n.entity_type === 'activity' && onOpenActivities) { setOpen(false); onOpenActivities() }
  }

  return <div className="relative" ref={box}>
    <button type="button" className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      aria-label={unread ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : 'การแจ้งเตือน'} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setOpen(v => !v); if (!open) void load() }}>
      <Bell size={19} />
      {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[1.15rem] text-white">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div role="dialog" aria-label="การแจ้งเตือน" className="absolute right-0 z-[130] mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-xl" style={{ width: 'min(22rem, calc(100vw - 2rem))', minWidth: 'min(22rem, calc(100vw - 2rem))', maxWidth: 'calc(100vw - 2rem)', boxSizing: 'border-box', writingMode: 'horizontal-tb', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
        <strong className="text-sm">การแจ้งเตือน</strong>
        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 disabled:text-stone-400" disabled={!unread} onClick={() => markRead(items.filter(i => !i.read_at).map(i => i.id))}><CheckCheck size={14} />อ่านทั้งหมด</button>
      </div>
      <ul className="max-h-96 divide-y divide-stone-100 overflow-y-auto">
        {items.map(n => <li key={n.id}><button type="button" onClick={() => click(n)} className={'block w-full px-3 py-2.5 text-left hover:bg-stone-50 ' + (n.read_at ? '' : 'bg-teal-50/50')}>
          <div className="flex min-w-0 items-start justify-between gap-2"><span className={'min-w-0 flex-1 text-sm ' + (n.read_at ? 'text-stone-700' : 'font-bold text-stone-900')} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'normal' }}>{n.title}</span>{!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600" aria-hidden="true" />}</div>
          {n.body && <p className="mt-0.5 whitespace-pre-wrap text-xs text-stone-600" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal' }}>เหตุผล: {n.body}</p>}
          <div className="mt-1 text-[11px] text-stone-400">{ago(n.created_at)}{n.entity_type === 'activity' ? ' · แตะเพื่อไปที่บันทึกกิจกรรม' : ''}</div>
        </button></li>)}
        {!items.length && <li className="p-6 text-center text-sm text-stone-500">ยังไม่มีการแจ้งเตือน</li>}
      </ul>
    </div>}
  </div>
}
