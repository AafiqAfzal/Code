import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer, Shuffle, Trash2 } from 'lucide-react'
import { db, type SeatingPlan } from '../db/schema'
import { useClasses, useGroups, useMyGroups, useStudents } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { byName, fullName } from '../lib/format'

export function SeatingPage() {
  const [params, setParams] = useSearchParams()
  const groups = useGroups()
  const myGroups = useMyGroups()
  const classes = useClasses()
  const students = useStudents()
  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const sel = groupId ? `g${groupId}` : classId ? `c${classId}` : ''
  const group = groups.find((g) => g.id === groupId)
  const roster = useMemo(() => (group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : []).sort(byName), [group, classId, students])
  const plan = useLiveQuery(async () => {
    if (!groupId && !classId) return undefined
    // null = plán neexistuje (undefined = ještě se načítá)
    return (await (groupId ? db.seatingPlans.where('groupId').equals(groupId).first() : db.seatingPlans.where('classId').equals(classId!).first())) ?? null
  }, [groupId, classId])
  const [dragging, setDragging] = useState<number | null>(null)
  /** Přesun kliknutím: vybraný žák (klik na žáka, pak klik na místo) */
  const [picked, setPicked] = useState<number | null>(null)

  // založit plán, jen když opravdu neexistuje (ne během načítání) a jen jednou
  const created = useRef(new Set<string>())
  useEffect(() => {
    if (plan !== null || (!groupId && !classId)) return
    const key = `${groupId ?? ''}/${classId ?? ''}`
    if (created.current.has(key)) return
    created.current.add(key)
    db.seatingPlans.add({ groupId, classId, rows: 5, cols: 6, seats: {}, updatedAt: new Date().toISOString() })
  }, [plan, groupId, classId])

  const save = (patch: Partial<SeatingPlan>) => plan && db.seatingPlans.update(plan.id, { ...patch, updatedAt: new Date().toISOString() })
  const seatOf = (sid: number) => plan ? Number(Object.entries(plan.seats).find(([k, v]) => v === sid && Number(k) < plan.rows * plan.cols)?.[0] ?? -1) : -1
  /** Změna počtu řad/míst: žáci zůstanou na svém místě (řada, pozice); kdo se nevejde, přejde mezi neposazené. */
  const resize = (rows: number, cols: number) => {
    if (!plan) return
    const seats: Record<number, number> = {}
    for (const [k, sid] of Object.entries(plan.seats)) {
      const i = Number(k)
      if (i >= plan.rows * plan.cols) continue
      const r = Math.floor(i / plan.cols), c = i % plan.cols
      if (r < rows && c < cols) seats[r * cols + c] = sid
    }
    save({ rows, cols, seats })
  }
  const anySeated = () => !!plan && roster.some((s) => seatOf(s.id) >= 0)
  const unseated = roster.filter((s) => seatOf(s.id) < 0)
  /** Přesun žáka (seatIdx null = odsadit). Pracuje s aktuálně uloženými místy, ne se zastaralou kopií. */
  const place = (sid: number, seatIdx: number | null) => {
    if (!plan) return
    db.seatingPlans.where('id').equals(plan.id).modify((p) => {
      const seats = { ...p.seats }
      const from = Number(Object.entries(seats).find(([, v]) => v === sid)?.[0] ?? -1)
      for (const [k, v] of Object.entries(seats)) if (v === sid) delete seats[Number(k)]
      if (seatIdx != null) {
        const occupant = seats[seatIdx]
        if (occupant && from >= 0 && from < p.rows * p.cols) seats[from] = occupant // prohození
        seats[seatIdx] = sid
      }
      p.seats = seats
      p.updatedAt = new Date().toISOString()
    })
  }
  const shuffle = () => {
    if (!plan) return
    if (anySeated() && !confirm('Náhodné rozesazení nahradí současný zasedací pořádek. Pokračovat?')) return
    const idx = Array.from({ length: plan.rows * plan.cols }, (_, i) => i).sort(() => Math.random() - 0.5)
    const seats: Record<number, number> = {}
    roster.forEach((s, i) => { if (idx[i] != null) seats[idx[i]] = s.id })
    save({ seats })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicked(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const name = group?.name ?? classes.find((c) => c.id === classId)?.name ?? ''

  return (
    <div>
      <Link to={classId ? `/tridy?class=${classId}` : '/tridy'} className="btn-ghost btn-sm mb-2 no-print"><ArrowLeft size={14} /> Třídy a skupiny</Link>
      <PageHeader title="Zasedací pořádek" subtitle={name} actions={
        <>
          <select className="input w-auto" value={sel} onChange={(e) => { const v = e.target.value; setParams(v.startsWith('g') ? { groupId: v.slice(1) } : v ? { classId: v.slice(1) } : {}) }}>
            <option value="">— vyberte —</option>
            <optgroup label="Skupiny">{myGroups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
            <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
          </select>
          {plan && (
            <>
              <label className="text-sm">Řady <input type="number" min={1} max={10} className="input w-16 inline-block" value={plan.rows} onChange={(e) => resize(Math.min(10, Math.max(1, Number(e.target.value) || 1)), plan.cols)} /></label>
              <label className="text-sm">Místa v řadě <input type="number" min={1} max={12} className="input w-16 inline-block" value={plan.cols} onChange={(e) => resize(plan.rows, Math.min(12, Math.max(1, Number(e.target.value) || 1)))} /></label>
              <button className="btn-secondary" onClick={shuffle}><Shuffle size={16} /> Náhodně rozesadit</button>
              <button className="btn-secondary" onClick={() => { if (!anySeated() || confirm('Vyprázdnit zasedací pořádek? Všichni žáci přejdou mezi neposazené.')) save({ seats: {} }) }}><Trash2 size={16} /> Vyprázdnit</button>
              <button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Tisk</button>
            </>
          )}
        </>
      } />
      {!plan && <div className="card card-body text-sm text-slate-500">Vyberte skupinu nebo třídu.</div>}
      {plan && (
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="card card-body overflow-x-auto">
            <div className="mb-2 rounded bg-slate-800 py-1 text-center text-xs font-semibold text-white">TABULE / KATEDRA</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${plan.cols}, minmax(90px, 1fr))` }}>
              {Array.from({ length: plan.rows * plan.cols }, (_, i) => {
                const sid = plan.seats[i]
                const s = students.find((x) => x.id === sid)
                return (
                  <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragging != null) place(dragging, i); setDragging(null); setPicked(null) }}
                    onClick={() => { if (picked != null) { if (picked !== s?.id) place(picked, i); setPicked(null) } else if (s) setPicked(s.id) }}
                    className={`flex h-16 items-center justify-center rounded border text-center text-xs select-none ${s ? 'border-blue-300 bg-blue-50 cursor-grab' : 'border-dashed border-slate-300 bg-slate-50 text-slate-300'} ${s && picked === s.id ? 'ring-2 ring-amber-500' : ''} ${picked != null && picked !== s?.id ? 'cursor-pointer hover:border-amber-500' : ''} ${i % plan.cols === Math.floor(plan.cols / 2) - 1 && plan.cols > 2 ? 'mr-4' : ''}`}
                    draggable={!!s} onDragStart={(e) => { if (!s) return; e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed = 'move'; setDragging(s.id) }} onDragEnd={() => setDragging(null)}
                    onDoubleClick={() => { if (s) { place(s.id, null); setPicked(null) } }} title={s ? 'Klikněte a pak klikněte na jiné místo (nebo přetáhněte). Dvojklik = odsadit' : ''}>
                    {s ? <span><b>{s.lastName}</b><br />{s.firstName}</span> : i + 1}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-400 no-print">Klikněte na žáka a potom na místo (nebo ho přetáhněte myší). Na obsazeném místě se žáci prohodí. Dvojklik na žáka nebo klik na seznam vpravo ho odsadí.{picked != null && <b className="text-amber-700"> Vybraný žák: {fullName(students.find((x) => x.id === picked) ?? { firstName: '', lastName: '' })} – klikněte na místo, Esc = zrušit.</b>}</p>
          </div>
          <div className="card no-print">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold">Neposazení ({unseated.length})</div>
            <ul className={`p-2 space-y-1 max-h-[60vh] overflow-y-auto min-h-16 ${picked != null && seatOf(picked) >= 0 ? 'cursor-pointer bg-amber-50' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragging != null) place(dragging, null); setDragging(null); setPicked(null) }}
              onClick={(e) => { if (e.target === e.currentTarget && picked != null) { place(picked, null); setPicked(null) } }}>
              {unseated.map((s) => <li key={s.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed = 'move'; setDragging(s.id) }} onDragEnd={() => setDragging(null)}
                onClick={() => setPicked(picked === s.id ? null : s.id)} className={`cursor-pointer select-none rounded border bg-white px-2 py-1 text-sm ${picked === s.id ? 'border-amber-500 ring-2 ring-amber-500' : 'border-slate-200'}`}>{fullName(s)}</li>)}
              {unseated.length === 0 && <li className="text-xs text-slate-400 p-2">Všichni sedí.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
