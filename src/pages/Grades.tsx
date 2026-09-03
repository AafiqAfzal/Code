import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Plus, Shuffle } from 'lucide-react'
import { db, type Assessment } from '../db/schema'
import { useCategories, useClasses, useGroups, useScale, useSettings, useStudents, useSubjects } from '../components/hooks'
import { ConfirmButton, Field, Modal, PageHeader, Toast, useToast } from '../components/ui'
import { fmtDate, fullName, todayISO } from '../lib/format'
import { GRADE_COLORS, avgColor, effectiveGrade, percentOf, proposedGrade, weightedAverage } from '../lib/grading'
import { exportGradesXlsx } from '../lib/export'

/** Sloupec = hodnocení sdílené celou skupinou (stejné datum + název + kategorie). */
interface Column { key: string; date: string; title: string; categoryId: number; weight: number; maxPoints?: number }

export function GradesPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const students = useStudents()
  const categories = useCategories()
  const scale = useScale()
  const { message, show } = useToast()

  const subjectId = Number(params.get('subjectId')) || settings?.defaultSubjectId || subjects[0]?.id
  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const group = groups.find((g) => g.id === groupId)
  useEffect(() => {
    if (!groupId && !classId && groups.length) setParams({ groupId: String(groups[0].id) }, { replace: true })
  }, [groupId, classId, groups, setParams])

  const roster = useMemo(() => group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : [], [group, classId, students])
  const rosterIds = roster.map((s) => s.id)
  const assessments = useLiveQuery(async () => {
    if (!subjectId || rosterIds.length === 0) return []
    const all = await db.assessments.where('subjectId').equals(subjectId).toArray()
    return all.filter((a) => rosterIds.includes(a.studentId))
  }, [subjectId, rosterIds.join(',')]) ?? []

  const columns: Column[] = useMemo(() => {
    const map = new Map<string, Column>()
    for (const a of assessments) {
      const key = `${a.date}|${a.title}|${a.categoryId}`
      if (!map.has(key)) map.set(key, { key, date: a.date, title: a.title, categoryId: a.categoryId, weight: a.weight, maxPoints: a.maxPoints })
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [assessments])

  const [newCol, setNewCol] = useState<{ title: string; date: string; categoryId: number; weight: number; maxPoints?: number } | null>(null)
  const [cell, setCell] = useState<{ studentId: number; column: Column; a?: Assessment } | null>(null)
  const [cellDraft, setCellDraft] = useState<Partial<Assessment>>({})
  const [picked, setPicked] = useState<string | null>(null)

  const addColumn = async () => {
    if (!newCol || !newCol.title.trim() || !subjectId) return
    const cat = categories.find((c) => c.id === newCol.categoryId)
    await db.assessments.bulkAdd(roster.map((s) => ({
      studentId: s.id, subjectId, groupId, categoryId: newCol.categoryId, date: newCol.date, title: newCol.title.trim(), weight: newCol.weight || cat?.weight || 1, maxPoints: newCol.maxPoints || undefined,
    })))
    setNewCol(null)
    show('Sloupec přidán – klikněte do buněk a vyplňte známky.')
  }
  const openCell = (studentId: number, column: Column) => {
    const a = assessments.find((x) => x.studentId === studentId && `${x.date}|${x.title}|${x.categoryId}` === column.key)
    setCell({ studentId, column, a })
    setCellDraft(a ? { ...a } : { grade: undefined, points: undefined, maxPoints: column.maxPoints, weight: column.weight, note: '', absent: false })
  }
  const saveCell = async () => {
    if (!cell || !subjectId) return
    const data = { grade: cellDraft.grade || undefined, points: cellDraft.points ?? undefined, maxPoints: cellDraft.maxPoints || undefined, weight: cellDraft.weight ?? cell.column.weight, note: cellDraft.note, absent: !!cellDraft.absent }
    if (cell.a) await db.assessments.update(cell.a.id, data)
    else await db.assessments.add({ studentId: cell.studentId, subjectId, groupId, categoryId: cell.column.categoryId, date: cell.column.date, title: cell.column.title, ...data })
    setCell(null)
  }
  /** Rychlý zápis známky přímo z klávesnice v buňce. */
  const quickSet = async (studentId: number, column: Column, key: string) => {
    const a = assessments.find((x) => x.studentId === studentId && `${x.date}|${x.title}|${x.categoryId}` === column.key)
    if (!subjectId) return
    let patch: Partial<Assessment> | null = null
    if (/^[1-5]$/.test(key)) patch = { grade: Number(key), absent: false }
    else if (key.toLowerCase() === 'n') patch = { absent: true, grade: undefined }
    else if (key === 'Delete' || key === 'Backspace') patch = { grade: undefined, points: undefined, absent: false }
    if (!patch) return
    if (a) await db.assessments.update(a.id, patch)
    else await db.assessments.add({ studentId, subjectId, groupId, categoryId: column.categoryId, date: column.date, title: column.title, weight: column.weight, maxPoints: column.maxPoints, ...patch })
  }
  const deleteColumn = async (c: Column) => {
    const ids = assessments.filter((a) => `${a.date}|${a.title}|${a.categoryId}` === c.key).map((a) => a.id)
    await db.assessments.bulkDelete(ids)
  }
  const catOf = (id: number) => categories.find((c) => c.id === id)
  const title = `${subjects.find((s) => s.id === subjectId)?.abbreviation ?? ''} ${group?.name ?? classes.find((c) => c.id === classId)?.name ?? ''} ${settings?.schoolYear ?? ''}`.trim()

  return (
    <div>
      <PageHeader title="Hodnocení" subtitle="Průběžná klasifikace podle vah kategorií" actions={
        <>
          <select className="input w-auto" value={subjectId ?? ''} onChange={(e) => setParams({ ...Object.fromEntries(params), subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="input w-auto" value={groupId ? `g${groupId}` : classId ? `c${classId}` : ''} onChange={(e) => { const v = e.target.value; setParams({ subjectId: String(subjectId ?? ''), ...(v.startsWith('g') ? { groupId: v.slice(1) } : { classId: v.slice(1) }) }) }}>
            <optgroup label="Skupiny">{groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
            <optgroup label="Celé třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
          </select>
          <button className="btn-secondary" title="Vylosovat žáka" onClick={() => roster.length && setPicked(fullName(roster[Math.floor(Math.random() * roster.length)]))}><Shuffle size={16} /></button>
          <button className="btn-secondary" disabled={!roster.length} onClick={() => exportGradesXlsx({ students: roster, assessments, categories, scale, title })}><Download size={16} /> Export XLSX</button>
          <button className="btn-primary" disabled={!roster.length} onClick={() => setNewCol({ title: '', date: todayISO(), categoryId: categories[1]?.id ?? categories[0]?.id, weight: categories[1]?.weight ?? categories[0]?.weight ?? 1 })}><Plus size={16} /> Nové hodnocení</button>
        </>
      } />
      {picked && <div className="mb-3 rounded bg-yellow-50 border border-yellow-300 p-3 text-center text-lg font-semibold">🎲 {picked} <button className="btn-ghost btn-sm ml-2" onClick={() => setPicked(null)}>×</button></div>}
      {roster.length === 0 ? (
        <div className="card card-body text-sm text-slate-500">Vyberte skupinu nebo třídu s žáky. Skupiny vytvoříte v sekci <Link className="underline text-blue-700" to="/tridy">Třídy a skupiny</Link>.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10">Žák</th>
                {columns.map((c) => {
                  const cat = catOf(c.categoryId)
                  return (
                    <th key={c.key} className="text-center min-w-20 group/col" style={{ borderTop: `3px solid ${cat?.color ?? '#94a3b8'}` }}>
                      <div className="normal-case font-semibold text-slate-700 truncate max-w-32" title={c.title}>{c.title}</div>
                      <div className="font-normal text-[10px] text-slate-400">{fmtDate(c.date, 'd.M.')} · {cat?.name ?? ''} · v{c.weight}{c.maxPoints ? ` · /${c.maxPoints}` : ''}</div>
                      <ConfirmButton className="text-[10px] text-red-500 opacity-0 group-hover/col:opacity-100 no-print" onConfirm={() => deleteColumn(c)}>smazat sloupec</ConfirmButton>
                    </th>
                  )
                })}
                <th className="text-center">Průměr</th>
                <th className="text-center">Návrh</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const mine = assessments.filter((a) => a.studentId === s.id)
                const avg = weightedAverage(mine, scale)
                return (
                  <tr key={s.id}>
                    <td className="sticky left-0 bg-white z-10 font-medium"><Link to={`/zaci/${s.id}`} className="hover:underline text-blue-700">{fullName(s)}</Link>{s.tags.length > 0 && <span className="ml-1 text-[10px] text-purple-700">{s.tags.join(', ')}</span>}</td>
                    {columns.map((c) => {
                      const a = mine.find((x) => `${x.date}|${x.title}|${x.categoryId}` === c.key)
                      const g = a ? effectiveGrade(a, scale) : undefined
                      const p = a ? percentOf(a) : undefined
                      return (
                        <td key={c.key} className="text-center p-0.5">
                          <button tabIndex={0} onKeyDown={(e) => { if (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); quickSet(s.id, c, e.key) } }}
                            onClick={() => openCell(s.id, c)} title={a?.note || (p != null ? `${a?.points}/${a?.maxPoints} = ${p} %` : 'Klik = detail, klávesy 1–5 = známka, N = nehodnocen')}
                            className={`h-8 w-full min-w-12 rounded border text-sm font-semibold focus:ring-2 focus:ring-blue-500 ${a?.absent ? 'bg-slate-100 text-slate-400 border-slate-200' : g != null ? GRADE_COLORS[g] : 'bg-white border-dashed border-slate-200 text-slate-300'}`}>
                            {a?.absent ? 'N' : g ?? '·'}{p != null && <span className="block text-[9px] font-normal leading-none">{p} %</span>}
                          </button>
                        </td>
                      )
                    })}
                    <td className={`text-center font-bold ${avgColor(avg)}`}>{avg ?? '—'}</td>
                    <td className="text-center">{avg != null && <span className={`inline-block rounded border px-2 font-semibold ${GRADE_COLORS[proposedGrade(avg)!]}`}>{proposedGrade(avg)}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-slate-400 no-print">Tip: označte buňku a stiskněte 1–5 pro rychlý zápis známky, N = nehodnocen, Delete = smazat. Klik otevře detail (body, poznámka, váha).</div>
        </div>
      )}

      <Modal open={!!newCol} onClose={() => setNewCol(null)} title="Nové hodnocení pro celou skupinu">
        {newCol && (
          <div className="space-y-3">
            <Field label="Název (např. Test – Unit 2)"><input className="input" autoFocus value={newCol.title} onChange={(e) => setNewCol({ ...newCol, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addColumn()} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategorie">
                <select className="input" value={newCol.categoryId} onChange={(e) => { const cat = categories.find((c) => c.id === Number(e.target.value)); setNewCol({ ...newCol, categoryId: Number(e.target.value), weight: cat?.weight ?? 1 }) }}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name} (váha {c.weight})</option>)}
                </select>
              </Field>
              <Field label="Datum"><input type="date" className="input" value={newCol.date} onChange={(e) => setNewCol({ ...newCol, date: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Váha"><input type="number" step="0.5" min={0} className="input" value={newCol.weight} onChange={(e) => setNewCol({ ...newCol, weight: Number(e.target.value) })} /></Field>
              <Field label="Max. bodů (volitelné – známka se dopočítá ze škály)"><input type="number" min={0} className="input" value={newCol.maxPoints ?? ''} onChange={(e) => setNewCol({ ...newCol, maxPoints: Number(e.target.value) || undefined })} /></Field>
            </div>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setNewCol(null)}>Zrušit</button><button className="btn-primary" onClick={addColumn}>Přidat pro {roster.length} žáků</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!cell} onClose={() => setCell(null)} title={cell ? `${fullName(roster.find((s) => s.id === cell.studentId)!)} – ${cell.column.title}` : ''}>
        {cell && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Známka">
                <div className="flex gap-1">{[1, 2, 3, 4, 5].map((g) => <button key={g} onClick={() => setCellDraft({ ...cellDraft, grade: g, absent: false })} className={`h-9 flex-1 rounded border font-bold ${cellDraft.grade === g ? GRADE_COLORS[g] + ' ring-2 ring-blue-500' : 'bg-white border-slate-200'}`}>{g}</button>)}</div>
              </Field>
              <Field label="Body"><input type="number" step="0.5" className="input" value={cellDraft.points ?? ''} onChange={(e) => setCellDraft({ ...cellDraft, points: e.target.value === '' ? undefined : Number(e.target.value), grade: undefined })} /></Field>
              <Field label="Max. bodů"><input type="number" className="input" value={cellDraft.maxPoints ?? ''} onChange={(e) => setCellDraft({ ...cellDraft, maxPoints: Number(e.target.value) || undefined })} /></Field>
            </div>
            {cellDraft.points != null && cellDraft.maxPoints ? <div className="text-sm text-slate-600">= {Math.round((cellDraft.points / cellDraft.maxPoints) * 1000) / 10} % → známka <b>{effectiveGrade({ ...(cellDraft as Assessment), grade: undefined }, scale)}</b></div> : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Váha"><input type="number" step="0.5" className="input" value={cellDraft.weight ?? cell.column.weight} onChange={(e) => setCellDraft({ ...cellDraft, weight: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-2 text-sm pt-5"><input type="checkbox" checked={!!cellDraft.absent} onChange={(e) => setCellDraft({ ...cellDraft, absent: e.target.checked })} /> Nehodnocen (chyběl)</label>
            </div>
            <Field label="Poznámka"><input className="input" value={cellDraft.note ?? ''} onChange={(e) => setCellDraft({ ...cellDraft, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveCell()} /></Field>
            <div className="flex justify-between">
              {cell.a ? <ConfirmButton onConfirm={async () => { await db.assessments.delete(cell.a!.id); setCell(null) }}>Smazat</ConfirmButton> : <span />}
              <div className="flex gap-2"><button className="btn-secondary" onClick={() => setCell(null)}>Zrušit</button><button className="btn-primary" onClick={saveCell}>Uložit</button></div>
            </div>
          </div>
        )}
      </Modal>
      <Toast message={message} />
    </div>
  )
}
