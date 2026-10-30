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
  const noSeat = (i: number) => !!plan?.noSeats?.includes(i)
  const seatOf = (sid: number) => plan ? Number(Object.entries(plan.seats).find(([k, v]) => v === sid && Number(k) < plan.rows * plan.cols && !noSeat(Number(k)))?.[0] ?? -1) : -1
  /** Změna počtu řad/lavic: žáci zůstanou na svém místě (řada, pozice); kdo se nevejde, přejde mezi neposazené. */
  const resize = (rows: number, cols: number) => {
    if (!plan) return
    const map = (i: number) => {
      const r = Math.floor(i / plan.cols), c = i % plan.cols
      return r < rows && c < cols ? r * cols + c : -1
    }
    const seats: Record<number, number> = {}
    for (const [k, sid] of Object.entries(plan.seats)) {
      const i = Number(k)
      if (i >= plan.rows * plan.cols) continue
      const j = map(i)
      if (j >= 0) seats[j] = sid
    }
    const noSeats = (plan.noSeats ?? []).map(map).filter((j) => j >= 0)
    save({ rows, cols, seats, noSeats })
  }
  // starší plány s lichým počtem míst v řadě → celé dvoumístné lavice
  useEffect(() => { if (plan && plan.cols % 2) resize(plan.rows, plan.cols + 1) }, [plan?.id, plan?.cols]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Lavice jednomístná / dvoumístná (ubírá se pravé místo; kdo tam seděl, přesedne vlevo, nebo mezi neposazené) */
  const toggleDesk = (row: number, desk: number) => {
    if (!plan) return
    const left = row * plan.cols + desk * 2, right = left + 1
    db.seatingPlans.where('id').equals(plan.id).modify((p) => {
      const ns = new Set(p.noSeats ?? [])
      if (ns.has(left) || ns.has(right)) { ns.delete(left); ns.delete(right) }
      else {
        ns.add(right)
        const sid = p.seats[right]
        if (sid != null) { delete p.seats[right]; if (p.seats[left] == null) p.seats[left] = sid }
      }
      p.noSeats = [...ns]
      p.updatedAt = new Date().toISOString()
    })
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
    // žáky náhodně zamícháme a posadíme od první lavice (lavice se zaplní celé, volná místa zůstanou vzadu)
    const idx = Array.from({ length: plan.rows * plan.cols }, (_, i) => i).filter((i) => !noSeat(i))
    const mixed = [...roster]
    for (let i = mixed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mixed[i], mixed[j]] = [mixed[j], mixed[i]] }
    const seats: Record<number, number> = {}
    mixed.forEach((s, i) => { if (idx[i] != null) seats[idx[i]] = s.id })
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
              <label className="text-sm">Lavic v řadě <input type="number" min={1} max={6} className="input w-16 inline-block" value={Math.ceil(plan.cols / 2)} onChange={(e) => resize(plan.rows, 2 * Math.min(6, Math.max(1, Number(e.target.value) || 1)))} /></label>
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
            <div className="space-y-3">
              {Array.from({ length: plan.rows }, (_, row) => (
                <div key={row} className="flex justify-center gap-8">
                  {Array.from({ length: plan.cols / 2 }, (_, desk) => {
                    const left = row * plan.cols + desk * 2
                    const single = noSeat(left) || noSeat(left + 1)
                    return (
                      <div key={desk} className="group/desk flex-1 max-w-64">
                        <div className={`flex gap-1 rounded-md border-2 border-amber-700/30 bg-amber-50/60 p-1 ${single ? 'justify-center' : ''}`}>
                          {[left, left + 1].filter((i) => !noSeat(i)).map((i) => {
                            const sid = plan.seats[i]
                            const s = students.find((x) => x.id === sid)
                            return (
                              <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragging != null) place(dragging, i); setDragging(null); setPicked(null) }}
                                onClick={() => { if (picked != null) { if (picked !== s?.id) place(picked, i); setPicked(null) } else if (s) setPicked(s.id) }}
                                className={`flex h-14 flex-1 min-w-0 max-w-32 items-center justify-center rounded border text-center text-xs select-none ${s ? 'border-blue-300 bg-blue-50 cursor-grab' : 'border-dashed border-slate-300 bg-white text-slate-300'} ${s && picked === s.id ? 'ring-2 ring-amber-500' : ''} ${picked != null && picked !== s?.id ? 'cursor-pointer hover:border-amber-500' : ''}`}
                                draggable={!!s} onDragStart={(e) => { if (!s) return; e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed = 'move'; setDragging(s.id) }} onDragEnd={() => setDragging(null)}
                                onDoubleClick={() => { if (s) { place(s.id, null); setPicked(null) } }} title={s ? 'Klikněte a pak klikněte na jiné místo (nebo přetáhněte). Dvojklik = odsadit' : ''}>
                                {s ? <span className="truncate px-0.5"><b>{s.lastName}</b><br />{s.firstName}</span> : <span className="no-print">volno</span>}
                              </div>
                            )
                          })}
                        </div>
                        <button className="no-print mx-auto mt-0.5 block text-[10px] text-slate-400 opacity-0 hover:text-blue-700 hover:underline group-hover/desk:opacity-100" onClick={() => toggleDesk(row, desk)}>{single ? 'dvoumístná lavice' : 'jednomístná lavice'}</button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400 no-print">Klikněte na žáka a potom na místo (nebo ho přetáhněte myší). Na obsazeném místě se žáci prohodí. Dvojklik na žáka nebo klik na seznam vpravo ho odsadí. Lavici přepnete na jednomístnou odkazem pod ní (po najetí myší).{picked != null && <b className="text-amber-700"> Vybraný žák: {fullName(students.find((x) => x.id === picked) ?? { firstName: '', lastName: '' })} – klikněte na místo, Esc = zrušit.</b>}</p>
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
