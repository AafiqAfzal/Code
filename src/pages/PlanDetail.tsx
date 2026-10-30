import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { db, type PlanItem } from '../db/schema'
import { useClasses, useGroups, useSettings, useSubjects } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { MONTHS, fmtDate, todayISO } from '../lib/format'

export function PlanDetail() {
  const planId = Number(useParams().id)
  const plan = useLiveQuery(() => db.plans.get(planId), [planId])
  const items = useLiveQuery(() => db.planItems.where('planId').equals(planId).sortBy('order'), [planId]) ?? []
  const subjects = useSubjects()
  const settings = useSettings()
  const groups = useGroups()
  const classes = useClasses()
  // všechny zápisy z hodin navázané na položky plánu – jedno téma se může probírat víckrát
  const itemIds = items.map((i) => i.id).join(',')
  const logs = useLiveQuery(() => {
    const ids = new Set(items.map((i) => i.id))
    return db.lessonLogs.filter((l) => l.planItemId != null && ids.has(l.planItemId)).toArray()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIds]) ?? []
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

  const unitName = (l: { groupId?: number; classId?: number }) => groups.find((g) => g.id === l.groupId)?.name ?? classes.find((c) => c.id === l.classId)?.name ?? ''
  /** Data probrání tématu: ze zápisů z hodin, případně ruční odškrtnutí */
  const datesOf = (i: PlanItem) => {
    const list = logs.filter((l) => l.planItemId === i.id).map((l) => ({ date: l.date, who: unitName(l) }))
    if (i.done && i.doneDate && !list.some((x) => x.date === i.doneDate)) list.push({ date: i.doneDate, who: '' })
    return list.sort((a, b) => a.date.localeCompare(b.date))
  }
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

  const subjectName = subjects.find((s) => s.id === plan.subjectId)?.name ?? ''
  const planGroup = groups.find((g) => g.id === plan.groupId)
  // měsíc v tisku jen u prvního řádku daného měsíce
  const monthShown = (idx: number) => { const m = visible[idx].month; return !!m && visible.slice(0, idx).reverse().find((x) => x.level > 0 && x.month)?.month !== m }
  const filterNote = [monthFilter && `jen ${monthFilter}`, hideDone && 'bez probraných témat'].filter(Boolean).join(', ')

  return (
    <div>
      <div className="print:hidden">
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
              {i.level > 0 && datesOf(i).length > 0 && (
                <span className="text-[10px] text-green-600 text-right max-w-48" title={datesOf(i).map((d) => `${fmtDate(d.date)}${d.who ? ` – ${d.who}` : ''}`).join('\n')}>
                  {datesOf(i).length > 1 && <b className="mr-1">{datesOf(i).length}×</b>}
                  {datesOf(i).map((d) => fmtDate(d.date, 'd.M.')).join(', ')}
                </span>
              )}
              <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 no-print">
                <button className="btn-ghost btn-sm" onClick={() => db.planItems.update(i.id, { level: i.level === 0 ? 1 : 0 })} title="Nadpis / téma">{i.level === 0 ? 'T' : 'N'}</button>
                <button className="btn-ghost btn-sm" onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                <button className="btn-ghost btn-sm" onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
                <button className="btn-ghost btn-sm text-red-600" onClick={() => { if (confirm(`Smazat ${i.level === 0 ? 'nadpis' : 'téma'} „${i.text}“?`)) db.planItems.delete(i.id) }}><Trash2 size={12} /></button>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 p-3 border-t border-slate-200 no-print">
          <input className="input" placeholder="Přidat téma…" value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add}><Plus size={16} /></button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400 no-print">Dvojklik na text = úprava. Tlačítko N/T přepíná nadpis tematického celku a téma. Téma lze také odškrtnout přímo ze zápisu z hodiny. Tisk respektuje filtr měsíce, „skrýt hotové“ a „realizovaná témata“.</p>
      </div>

      {/* tisková podoba: dokument, ne snímek obrazovky */}
      <div className="hidden print:block text-black text-[10pt] leading-snug">
        <div className="flex items-end justify-between border-b-2 border-black pb-1 mb-2">
          <div>
            <div className="text-[9pt] uppercase tracking-wide">Tematický plán{settings?.schoolYear ? ` · školní rok ${settings.schoolYear}` : ''}</div>
            <h1 className="text-[15pt] font-bold leading-tight">{plan.title}</h1>
          </div>
          <div className="text-right text-[9pt]">{settings?.schoolName}</div>
        </div>
        <table className="mb-2 text-[9pt]"><tbody>
          {subjectName && <tr><td className="pr-3 text-slate-600">Předmět:</td><td className="font-semibold">{subjectName}</td></tr>}
          {plan.gradeLevel ? <tr><td className="pr-3 text-slate-600">Ročník:</td><td className="font-semibold">{plan.gradeLevel}.</td></tr> : null}
          {planGroup && <tr><td className="pr-3 text-slate-600">Skupina:</td><td className="font-semibold">{planGroup.name}</td></tr>}
          {settings?.teacherName && <tr><td className="pr-3 text-slate-600">Vyučující:</td><td className="font-semibold">{settings.teacherName}</td></tr>}
          <tr><td className="pr-3 text-slate-600">Plnění:</td><td className="font-semibold">probráno {done} z {topics.length} témat ({pct} %){filterNote ? ` · výpis: ${filterNote}` : ''}</td></tr>
        </tbody></table>
        <table className="w-full border-collapse [&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black [&_td]:px-1.5 [&_td]:py-0.5 [&_th]:px-1.5 [&_th]:py-1 [&_td]:align-top">
          <thead>
            <tr className="bg-slate-100 text-left text-[8.5pt]">
              <th className="w-[13%]">Měsíc</th>
              <th>Učivo / téma</th>
              <th className="w-[6%] text-center">Hod.</th>
              <th className="w-[15%]">Probráno</th>
              {showNotes && <th className="w-[26%]">Realizovaná témata / poznámka</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((i, idx) => i.level === 0 ? (
              <tr key={i.id} className="break-inside-avoid break-after-avoid bg-slate-100"><td colSpan={showNotes ? 5 : 4} className="font-bold">{i.text}</td></tr>
            ) : (
              <tr key={i.id} className="break-inside-avoid">
                <td className="text-[8.5pt]">{monthShown(idx) && i.month ? i.month.charAt(0).toUpperCase() + i.month.slice(1) : ''}</td>
                <td>{i.text}</td>
                <td className="text-center">{i.hours ?? ''}</td>
                <td className="text-[8.5pt]">{datesOf(i).map((d) => fmtDate(d.date, 'd. M.')).join(', ') || (i.done ? '✓' : '')}</td>
                {showNotes && <td className="text-[8.5pt] whitespace-pre-wrap">{i.note ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 flex justify-between text-[9pt]">
          <span>Vytištěno {fmtDate(todayISO())}</span>
          <span>Podpis vyučujícího: ..................................................</span>
        </div>
      </div>
    </div>
  )
}
