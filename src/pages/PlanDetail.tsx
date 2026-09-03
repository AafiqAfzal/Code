import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { db, type PlanItem } from '../db/schema'
import { useSubjects } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { MONTHS, fmtDate, todayISO } from '../lib/format'

export function PlanDetail() {
  const planId = Number(useParams().id)
  const plan = useLiveQuery(() => db.plans.get(planId), [planId])
  const items = useLiveQuery(() => db.planItems.where('planId').equals(planId).sortBy('order'), [planId]) ?? []
  const subjects = useSubjects()
  const [newText, setNewText] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [showNotes, setShowNotes] = useState(true)

  if (!plan) return <div className="text-slate-500">Plán nenalezen. <Link to="/plany" className="underline">Zpět</Link></div>
  const topics = items.filter((i) => i.level > 0)
  const done = topics.filter((i) => i.done).length
  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0
  const visible = items.filter((i) => (!monthFilter || i.month === monthFilter) && (!hideDone || !i.done || i.level === 0))

  const toggle = (i: PlanItem) => db.planItems.update(i.id, { done: !i.done, doneDate: !i.done ? todayISO() : undefined })
  const add = async () => {
    if (!newText.trim()) return
    await db.planItems.add({ planId, order: (items.at(-1)?.order ?? -1) + 1, text: newText.trim(), level: 1, done: false, month: monthFilter || undefined })
    setNewText('')
  }
  const move = async (i: PlanItem, dir: -1 | 1) => {
    const idx = items.findIndex((x) => x.id === i.id)
    const other = items[idx + dir]
    if (!other) return
    await db.planItems.bulkPut([{ ...i, order: other.order }, { ...other, order: i.order }])
  }

  return (
    <div>
      <Link to="/plany" className="btn-ghost btn-sm mb-2 no-print"><ArrowLeft size={14} /> Plány</Link>
      <PageHeader title={plan.title} subtitle={`${subjects.find((s) => s.id === plan.subjectId)?.name ?? ''}${plan.gradeLevel ? ` · ${plan.gradeLevel}. ročník` : ''} · splněno ${done}/${topics.length} (${pct} %)`} actions={
        <>
          <select className="input w-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}><option value="">Všechny měsíce</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> skrýt hotové</label>
          <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> realizovaná témata</label>
          <button className="btn-secondary" onClick={() => window.print()}>Tisk</button>
        </>
      } />
      <div className="h-2 rounded bg-slate-200 mb-4"><div className="h-2 rounded bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="card">
        <ul className="divide-y divide-slate-100">
          {visible.map((i) => (
            <li key={i.id} className={`flex items-center gap-2 px-3 py-1.5 group ${i.level === 0 ? 'bg-slate-50 font-semibold' : ''} ${i.done ? 'text-slate-400' : ''}`}>
              {i.level > 0 ? <input type="checkbox" className="h-4 w-4" checked={i.done} onChange={() => toggle(i)} /> : <span className="w-4" />}
              <div className="flex-1 min-w-0">
                {editing === i.id ? (
                  <input className="input" autoFocus defaultValue={i.text} onBlur={(e) => { db.planItems.update(i.id, { text: e.target.value }); setEditing(null) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }} />
                ) : (
                  <span className={`block text-sm cursor-text ${i.done && i.level > 0 ? 'line-through' : ''}`} onDoubleClick={() => setEditing(i.id)} title="Dvojklik = upravit">{i.text}</span>
                )}
                {i.level > 0 && showNotes && (editingNote === i.id ? (
                  <textarea className="input text-xs mt-1" rows={3} autoFocus defaultValue={i.note ?? ''} onBlur={(e) => { db.planItems.update(i.id, { note: e.target.value || undefined }); setEditingNote(null) }} onKeyDown={(e) => { if (e.key === 'Escape') setEditingNote(null) }} />
                ) : (
                  <span className={`block text-xs font-normal cursor-text ${i.note ? 'text-slate-500' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`} onClick={() => setEditingNote(i.id)} title="Klik = upravit realizovaná témata">{i.note || '+ realizovaná témata / poznámka'}</span>
                ))}
              </div>
              {i.month && <span className="text-[10px] uppercase text-slate-400 w-16">{i.month}</span>}
              {i.hours != null && <span className="text-[10px] text-slate-400 w-8">{i.hours} h</span>}
              {i.done && i.doneDate && <span className="text-[10px] text-green-600 w-16">{fmtDate(i.doneDate, 'd.M.')}</span>}
              <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 no-print">
                <button className="btn-ghost btn-sm" onClick={() => db.planItems.update(i.id, { level: i.level === 0 ? 1 : 0 })} title="Nadpis / téma">{i.level === 0 ? 'T' : 'N'}</button>
                <button className="btn-ghost btn-sm" onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                <button className="btn-ghost btn-sm" onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
                <button className="btn-ghost btn-sm text-red-600" onClick={() => db.planItems.delete(i.id)}><Trash2 size={12} /></button>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 p-3 border-t border-slate-200 no-print">
          <input className="input" placeholder="Přidat téma…" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add}><Plus size={16} /></button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400 no-print">Dvojklik na text = úprava. Tlačítko N/T přepíná nadpis tematického celku a téma. Téma lze také odškrtnout přímo ze zápisu z hodiny.</p>
    </div>
  )
}
