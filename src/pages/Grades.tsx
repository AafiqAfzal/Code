import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Plus, Shuffle, Info } from 'lucide-react'
import { db, type Assessment } from '../db/schema'
import { useCategories, useClasses, useGroups, useScale, useSettings, useStudents, useSubjects, useTeachingUnits } from '../components/hooks'
import { ConfirmButton, Field, Modal, PageHeader, Toast, useToast } from '../components/ui'
import { fmtDate, fullName, genderClass, todayISO, fmtNum } from '../lib/format'
import { GRADE_COLORS, avgColor, effectiveGrade, percentOf, proposedGrade, weightedAverage } from '../lib/grading'
import { exportGradesXlsx } from '../lib/export'
import { TERM_LABEL, currentTerm, termRange, type Term } from '../lib/terms'

/** Klávesa → známka 1–5 / N / Delete; funguje s českým rozložením (+ěščř bez Shiftu), numerickou klávesnicí i řadou číslic. */
function keyToGrade(e: React.KeyboardEvent): string | null {
  const code = e.code
  const m = code.match(/^(Digit|Numpad)([1-5])$/)
  if (m) return m[2]
  const cz: Record<string, string> = { '+': '1', 'ě': '2', 'š': '3', 'č': '4', 'ř': '5' }
  if (/^[1-5]$/.test(e.key)) return e.key
  if (cz[e.key]) return cz[e.key]
  if (e.key === 'n' || e.key === 'N') return 'n'
  if (e.key === 'Delete' || e.key === 'Backspace') return 'Delete'
  return null
}

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
  const [term, setTerm] = useState<Term | null>(null)
  const activeTerm: Term = term ?? (settings ? currentTerm(settings) : 0)
  const range = termRange(activeTerm, settings)

  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const group = groups.find((g) => g.id === groupId)
  // odkaz jen se skupinou (z Tříd, z karty žáka) → předmět podle skupiny
  const subjectId = Number(params.get('subjectId')) || group?.subjectId || settings?.defaultSubjectId || subjects[0]?.id
  // Nabídka podle předmětu: moje skupiny daného předmětu + třídy, které v něm učím vcelku (podle rozvrhu)
  const { groups: subjectGroups, classes: subjectClasses, loaded, allGroups, allClasses } = useTeachingUnits(subjectId)
  useEffect(() => {
    // dokud se data načítají, výběr nepřepisovat; platnou skupinu/třídu z odkazu (i kolegyně) ponechat
    if (!loaded || (allGroups.length > 0 && groups.length === 0)) return
    const fits = (groupId && (subjectGroups.some((g) => g.id === groupId) || allGroups.some((g) => g.id === groupId && g.mine === false && (!g.subjectId || g.subjectId === subjectId))))
      || (classId && allClasses.some((c) => c.id === classId))
    if (fits) return
    const first: Record<string, string> | null = subjectGroups[0] ? { groupId: String(subjectGroups[0].id) } : subjectClasses[0] ? { classId: String(subjectClasses[0].id) } : null
    if (first) setParams({ subjectId: String(subjectId ?? ''), ...first }, { replace: true })
  }, [loaded, groupId, classId, groups, allGroups, allClasses, subjectGroups, subjectClasses, subjectId, setParams])

  const roster = useMemo(() => group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : [], [group, classId, students])
  const rosterIds = roster.map((s) => s.id)
  const assessments = useLiveQuery(async () => {
    if (!subjectId || rosterIds.length === 0) return []
    const all = await db.assessments.where('subjectId').equals(subjectId).toArray()
    return all.filter((a) => rosterIds.includes(a.studentId) && a.date >= range.from && a.date <= range.to)
  }, [subjectId, rosterIds.join(','), range.from, range.to]) ?? []

  const columns: Column[] = useMemo(() => {
    const map = new Map<string, Column>()
    for (const a of assessments) {
      const key = `${a.date}|${a.title}|${a.categoryId}`
      if (!map.has(key)) map.set(key, { key, date: a.date, title: a.title, categoryId: a.categoryId, weight: a.weight, maxPoints: a.maxPoints })
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [assessments])

  /** Formulář sloupce: nové hodnocení, nebo úprava existujícího (edit = původní sloupec) */
  const [newCol, setNewCol] = useState<{ title: string; date: string; categoryId: number; weight: number; maxPoints?: number; edit?: Column } | null>(null)
  const [cell, setCell] = useState<{ studentId: number; column: Column; a?: Assessment } | null>(null)
  const [cellDraft, setCellDraft] = useState<Partial<Assessment>>({})
  const [picked, setPicked] = useState<string | null>(null)

  const addColumn = async () => {
    if (!newCol || !subjectId) return
    if (!newCol.title.trim()) { alert('Vyplňte název hodnocení.'); return }
    if (!newCol.date) { alert('Vyplňte datum.'); return }
    const cat = categories.find((c) => c.id === newCol.categoryId)
    const key = `${newCol.date}|${newCol.title.trim()}|${newCol.categoryId}`
    const keyOf = (a: Assessment) => `${a.date}|${a.title}|${a.categoryId}`
    const inGroup = (a: Assessment) => rosterIds.includes(a.studentId)
    if (newCol.edit?.key !== key) {
      const dup = await db.assessments.where('subjectId').equals(subjectId).filter((a) => inGroup(a) && keyOf(a) === key).count()
      if (dup) { alert('Hodnocení se stejným názvem, datem a kategorií už v této skupině existuje. Změňte název nebo datum.'); return }
    }
    // váha 0 je platná (informativní hodnocení); prázdné pole = váha kategorie
    const weight = Number.isFinite(newCol.weight) ? newCol.weight : cat?.weight ?? 1
    const old = newCol.edit
    if (old) {
      // úprava celého sloupce: název, datum, kategorie, max. bodů pro všechny; váha jen tam, kde nebyla upravená jednotlivě
      await db.transaction('rw', db.assessments, async () => {
        await db.assessments.where('subjectId').equals(subjectId).filter((a) => inGroup(a) && keyOf(a) === old.key).modify((a) => {
          a.title = newCol.title.trim(); a.date = newCol.date; a.categoryId = newCol.categoryId; a.maxPoints = newCol.maxPoints || undefined
          if (a.weight === old.weight || a.weight == null) a.weight = weight
        })
      })
    } else {
      await db.assessments.bulkAdd(roster.map((s) => ({
        studentId: s.id, subjectId, groupId, categoryId: newCol.categoryId, date: newCol.date, title: newCol.title.trim(), weight, maxPoints: newCol.maxPoints || undefined,
      })))
    }
    setNewCol(null)
    // sloupec s datem v jiném pololetí by „zmizel“ – přepneme na jeho pololetí
    if (activeTerm && (newCol.date < range.from || newCol.date > range.to)) {
      const other = activeTerm === 1 ? 2 : 1
      setTerm(other)
      show(`Sloupec ${old ? 'upraven a přesunut' : 'přidán'} do ${TERM_LABEL[other]} (podle data) – zobrazuji ho.`)
    } else show(old ? 'Hodnocení upraveno.' : 'Sloupec přidán – klikněte do buněk a vyplňte známky.')
  }
  const openCell = (studentId: number, column: Column) => {
    const a = assessments.find((x) => x.studentId === studentId && `${x.date}|${x.title}|${x.categoryId}` === column.key)
    setCell({ studentId, column, a })
    setCellDraft(a ? { ...a } : { grade: undefined, points: undefined, maxPoints: column.maxPoints, weight: column.weight, note: '', absent: false })
  }
  const saveCell = async () => {
    if (!cell || !subjectId) return
    const data = { grade: cellDraft.grade || undefined, points: cellDraft.points ?? undefined, maxPoints: cellDraft.maxPoints || undefined, weight: Number.isFinite(cellDraft.weight) ? cellDraft.weight! : cell.column.weight, note: cellDraft.note, absent: !!cellDraft.absent }
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
    if (a) { await db.assessments.update(a.id, patch); return }
    // nová známka: v transakci znovu ověřit, že ji mezitím nezapsal jiný stisk klávesy (jinak by vznikla dvakrát)
    await db.transaction('rw', db.assessments, async () => {
      const ex = await db.assessments.where('[studentId+subjectId]').equals([studentId, subjectId]).filter((x) => `${x.date}|${x.title}|${x.categoryId}` === column.key).first()
      if (ex) await db.assessments.update(ex.id, patch!)
      else await db.assessments.add({ studentId, subjectId, groupId, categoryId: column.categoryId, date: column.date, title: column.title, weight: column.weight, maxPoints: column.maxPoints, ...patch! })
    })
  }
  const deleteColumn = async (c: Column) => {
    const ids = assessments.filter((a) => `${a.date}|${a.title}|${a.categoryId}` === c.key).map((a) => a.id)
    await db.assessments.bulkDelete(ids)
  }
  /** Přesun na buňku (řádek žáka, sloupec) – šipky a automatický posun po zápisu známky */
  const focusCell = (r: number, c: number) => (document.querySelector(`button[data-cell="${r}:${c}"]`) as HTMLButtonElement | null)?.focus()
  const catOf = (id: number) => categories.find((c) => c.id === id)
  const title = `${subjects.find((s) => s.id === subjectId)?.abbreviation ?? ''} ${group?.name ?? classes.find((c) => c.id === classId)?.name ?? ''} ${settings?.schoolYear ?? ''} ${activeTerm ? TERM_LABEL[activeTerm] : ''}`.trim()

  return (
    <div>
      <PageHeader title="Hodnocení" subtitle={`Průběžná klasifikace podle vah kategorií · ${TERM_LABEL[activeTerm]}`} actions={
        <>
          <select className="input w-auto" value={subjectId ?? ''} onChange={(e) => setParams({ ...Object.fromEntries(params), subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="input w-auto" value={groupId ? `g${groupId}` : classId ? `c${classId}` : ''} onChange={(e) => { const v = e.target.value; setParams({ subjectId: String(subjectId ?? ''), ...(v.startsWith('g') ? { groupId: v.slice(1) } : { classId: v.slice(1) }) }) }}>
            {subjectGroups.length > 0 && <optgroup label="Skupiny">{subjectGroups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>}
            {subjectClasses.length > 0 && <optgroup label="Celé třídy">{subjectClasses.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>}
          </select>
          <select className="input w-auto" value={activeTerm} onChange={(e) => setTerm(Number(e.target.value) as Term)} title="Pololetí">{([1, 2, 0] as Term[]).map((t) => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}</select>
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
          <table className="table !w-auto whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10">Žák</th>
                {columns.map((c) => {
                  const cat = catOf(c.categoryId)
                  return (
                    <th key={c.key} className="text-center min-w-14 max-w-24 px-1 group/col" style={{ borderTop: `3px solid ${cat?.color ?? '#94a3b8'}` }}>
                      <button className="block w-full normal-case font-semibold text-slate-700 truncate text-center mx-auto hover:text-blue-700 hover:underline" title={`${c.title} – klikněte pro úpravu (název, datum, kategorie, váha, max. bodů)`}
                        onClick={() => setNewCol({ title: c.title, date: c.date, categoryId: c.categoryId, weight: c.weight, maxPoints: c.maxPoints, edit: c })}>{c.title}</button>
                      <div className="font-normal text-[10px] text-slate-400 text-center whitespace-normal leading-tight" title={cat?.name}>{fmtDate(c.date, 'd.M.')} · v{fmtNum(c.weight)}{c.maxPoints ? ` · /${c.maxPoints}` : ''}</div>
                      <ConfirmButton className="text-[10px] text-red-500 opacity-0 group-hover/col:opacity-100 no-print" onConfirm={() => deleteColumn(c)}>smazat sloupec</ConfirmButton>
                    </th>
                  )
                })}
                <th className="text-center">Průměr</th>
                <th className="text-center">Návrh</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s, ri) => {
                const mine = assessments.filter((a) => a.studentId === s.id)
                const avg = weightedAverage(mine, scale)
                return (
                  <tr key={s.id}>
                    <td className="sticky left-0 bg-white z-10 font-medium"><Link to={`/zaci/${s.id}`} className={`hover:underline ${genderClass(s.gender)}`} title={s.note || undefined}>{fullName(s)}</Link>{s.tags.length > 0 && <span className="ml-1 text-[10px] text-purple-700">{s.tags.join(', ')}</span>}{s.note && <span className="ml-1 inline-flex align-middle text-slate-400 cursor-help" title={s.note}><Info size={12} /></span>}</td>
                    {columns.map((c, ci) => {
                      const a = mine.find((x) => `${x.date}|${x.title}|${x.categoryId}` === c.key)
                      const g = a ? effectiveGrade(a, scale) : undefined
                      const p = a ? percentOf(a) : undefined
                      return (
                        <td key={c.key} className="text-center p-0.5">
                          <button tabIndex={0} data-cell={`${ri}:${ci}`} onMouseEnter={(e) => e.currentTarget.focus()} onKeyDown={(e) => {
                              const k = keyToGrade(e)
                              if (k) { e.preventDefault(); quickSet(s.id, c, k); if (k !== 'Delete' && k !== 'Backspace') focusCell(ri + 1, ci); return }
                              const move: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
                              if (move[e.key]) { e.preventDefault(); focusCell(ri + move[e.key][0], ci + move[e.key][1]) }
                            }}
                            onClick={() => openCell(s.id, c)} title={a?.note || (p != null ? `${fmtNum(a?.points)}/${a?.maxPoints} = ${fmtNum(p, 1)} %` : 'Najeďte myší a stiskněte 1–5 (i na české klávesnici), N = nehodnocen, Delete = smazat; klik = detail')}
                            className={`h-8 w-full min-w-9 rounded border text-sm font-semibold focus:ring-2 focus:ring-blue-500 ${a?.absent ? 'bg-slate-100 text-slate-400 border-slate-200' : g != null ? GRADE_COLORS[g] : 'bg-white border-dashed border-slate-200 text-slate-300'}`}>
                            {a?.absent ? 'N' : g ?? '·'}{p != null && <span className="block text-[9px] font-normal leading-none">{fmtNum(p, 1)} %</span>}
                          </button>
                        </td>
                      )
                    })}
                    <td className={`text-center font-bold ${avgColor(avg)}`}>{avg != null ? fmtNum(avg) : '—'}</td>
                    <td className="text-center">{avg != null && <span className={`inline-block rounded border px-2 font-semibold ${GRADE_COLORS[proposedGrade(avg)!]}`}>{proposedGrade(avg)}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-slate-400 no-print">Tip: najeďte myší na buňku (nebo se v tabulce pohybujte šipkami) a stiskněte 1–5 – funguje i na české klávesnici bez Shiftu; po zápisu se kurzor posune na dalšího žáka. N = nehodnocen, Delete = smazat, Enter nebo klik = detail (body, poznámka, váha). Klik na název sloupce = úprava hodnocení.</div>
        </div>
      )}

      <Modal open={!!newCol} onClose={() => setNewCol(null)} title={newCol?.edit ? 'Upravit hodnocení' : 'Nové hodnocení pro celou skupinu'}>
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
              <Field label="Váha"><input type="number" step="0.5" min={0} className="input" value={Number.isFinite(newCol.weight) ? newCol.weight : ''} onChange={(e) => setNewCol({ ...newCol, weight: e.target.value === '' ? NaN : Number(e.target.value) })} /></Field>
              <Field label="Max. bodů (volitelné – známka se dopočítá ze škály)"><input type="number" min={0} className="input" value={newCol.maxPoints ?? ''} onChange={(e) => setNewCol({ ...newCol, maxPoints: Number(e.target.value) || undefined })} /></Field>
            </div>
            {newCol.edit && <p className="text-xs text-slate-500">Změna se projeví u všech žáků v tomto sloupci. Známky zůstanou; u bodů se známka přepočítá podle nového maxima. Váha upravená u jednotlivého žáka zůstane.</p>}
            <div className="flex justify-between gap-2">
              {newCol.edit ? <ConfirmButton confirmLabel="Smazat celý sloupec?" onConfirm={async () => { await deleteColumn(newCol.edit!); setNewCol(null); show('Sloupec smazán.') }}>Smazat sloupec</ConfirmButton> : <span />}
              <div className="flex gap-2"><button className="btn-secondary" onClick={() => setNewCol(null)}>Zrušit</button><button className="btn-primary" onClick={addColumn}>{newCol.edit ? 'Uložit změny' : `Přidat pro ${roster.length} žáků`}</button></div>
            </div>
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
            {cellDraft.points != null && cellDraft.maxPoints ? <div className="text-sm text-slate-600">= {fmtNum(Math.round((cellDraft.points / cellDraft.maxPoints) * 1000) / 10, 1)} % → známka <b>{effectiveGrade({ ...(cellDraft as Assessment), grade: undefined }, scale)}</b></div> : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Váha"><input type="number" step="0.5" className="input" min={0} value={Number.isFinite(cellDraft.weight) ? cellDraft.weight : ''} placeholder={String(cell.column.weight)} onChange={(e) => setCellDraft({ ...cellDraft, weight: e.target.value === '' ? NaN : Number(e.target.value) })} /></Field>
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
