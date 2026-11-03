import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

type DialogRequest = { id:number; kind:'alert'|'confirm'; title:string; message:string; resolve:(value:boolean)=>void }
let nextId=0
const emit = (request: Omit<DialogRequest,'id'>) => {
  const id=++nextId
  window.dispatchEvent(new CustomEvent('p4p:dialog', { detail:{...request,id} }))
}
export const appAlert = (message:string, title='แจ้งให้ทราบ') => new Promise<void>(resolve => emit({kind:'alert',title,message,resolve:()=>resolve()}))
export const appConfirm = (message:string, title='ยืนยันการดำเนินการ') => new Promise<boolean>(resolve => emit({kind:'confirm',title,message,resolve}))
export default function AppDialogHost() {
  const [dialog,setDialog]=useState<DialogRequest|null>(null)
  useEffect(()=>{
    const receive=(event:Event)=>{ const d=(event as CustomEvent<DialogRequest>).detail; setDialog(d) }
    window.addEventListener('p4p:dialog',receive)
    return()=>window.removeEventListener('p4p:dialog',receive)
  },[])
  if(!dialog)return null
  const finish=(accepted:boolean)=>{ const d=dialog; setDialog(null); d.resolve(accepted) }
  const Icon=dialog.kind==='confirm'?AlertTriangle:Info
  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[3px]" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget && dialog.kind==='alert')finish(true)}}>
    <section role={dialog.kind==='confirm'?'alertdialog':'dialog'} aria-modal="true" aria-labelledby="p4p-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start gap-3 p-5 sm:p-6">
        <span className={'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl '+(dialog.kind==='confirm'?'bg-amber-50 text-amber-700':'bg-teal-50 text-teal-700')}><Icon size={23}/></span>
        <div className="min-w-0 flex-1"><h2 id="p4p-dialog-title" className="text-lg font-bold text-slate-900">{dialog.title}</h2><p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{dialog.message}</p></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
        {dialog.kind==='confirm'&&<button type="button" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={()=>finish(false)}>ยกเลิก</button>}
        <button type="button" autoFocus className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200" onClick={()=>finish(true)}>{dialog.kind==='confirm'?'ยืนยัน':'รับทราบ'}</button>
      </div>
    </section>
  </div>
}
