import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { db, type Student, type StudentNoteKind } from '../db/schema'
import { useCategories, useClasses, useGroups, useScale, useSettings, useSubjects } from '../components/hooks'
import { Badge, ConfirmButton, Field, PageHeader } from '../components/ui'
import { GENDER_LABEL, NOTE_KINDS, ageFrom, daysToBirthday, fmtDate, fullName, genderClass, todayISO } from '../lib/format'
import { GRADE_COLORS, avgColor, effectiveGrade, percentOf, proposedGrade, weightedAverage } from '../lib/grading'
import { termRange } from '../lib/terms'

const TAG_SUGGESTIONS = ['IVP', 'PLPP', 'SPU', 'ADHD', 'nadaný', 'cizinec', 'OMJ', 'asistent']

export function StudentDetail() {
  const { id } = useParams()
  const studentId = Number(id)
  const navigate = useNavigate()
  const student = useLiveQuery(() => db.students.get(studentId), [studentId])
  const classes = useClasses()
  const groups = useGroups()
  const subjects = useSubjects()
  const categories = useCategories()
  const scale = useScale()
  const settings = useSettings()
  const notes = useLiveQuery(() => db.studentNotes.where('studentId').equals(studentId).reverse().sortBy('date'), [studentId]) ?? []
  const assessments = useLiveQuery(() => db.assessments.where('studentId').equals(studentId).toArray(), [studentId]) ?? []
  const evals = useLiveQuery(() => db.termEvaluations.where('studentId').equals(studentId).toArray(), [studentId]) ?? []
  const logs = useLiveQuery(() => db.lessonLogs.filter((l) => l.absentStudentIds.includes(studentId)).toArray(), [studentId]) ?? []
  const [edit, setEdit] = useState<Partial<Student> | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<StudentNoteKind>('poznamka')
  const [tagInput, setTagInput] = useState('')

  if (!student) return <div className="text-slate-500">Žák nenalezen. <Link to="/zaci" className="underline">Zpět</Link></div>
  const cls = classes.find((c) => c.id === student.classId)
  const myGroups = groups.filter((g) => g.studentIds.includes(student.id))

  const saveEdit = async () => { if (edit) { await db.students.update(student.id, edit); setEdit(null) } }
  const addNote = async () => {
    if (!noteText.trim()) return
    await db.studentNotes.add({ studentId: student.id, date: todayISO(), kind: noteKind, text: noteText.trim() })
    setNoteText('')
  }
  const addTag = async (t: string) => {
    const tag = t.trim(); if (!tag || student.tags.includes(tag)) return
    await db.students.update(student.id, { tags: [...student.tags, tag] }); setTagInput('')
  }
  const saveEval = async (subjectId: number, term: 1 | 2, patch: { text?: string; proposedGrade?: number }) => {
    const ex = evals.find((e) => e.subjectId === subjectId && e.term === term)
    if (ex) await db.termEvaluations.update(ex.id, { ...patch, updatedAt: new Date().toISOString() })
    else await db.termEvaluations.add({ studentId: student.id, subjectId, term, text: '', ...patch, updatedAt: new Date().toISOString() })
  }

  return (
    <div>
      <button className="btn-ghost btn-sm mb-2 no-print" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Zpět</button>
      <PageHeader title={<span className={genderClass(student.gender)}>{fullName(student)}</span>} subtitle={`${cls?.name ?? 'bez třídy'}${student.catalogNumber ? ` · č. ${student.catalogNumber}` : ''}${student.active ? '' : ' · neaktivní'}`} actions={
        <>
          <button className="btn-secondary" onClick={() => setEdit({ ...student })}>Upravit profil</button>
          <Link className="btn-primary" to={`/tisk?studentId=${student.id}${myGroups[0] ? `&groupId=${myGroups[0].id}` : ''}`}>Podklady na schůzku s rodiči</Link>
          <ConfirmButton className="btn-danger" onConfirm={async () => { await db.students.delete(student.id); await db.studentNotes.where('studentId').equals(student.id).delete(); await db.assessments.where('studentId').equals(student.id).delete(); navigate('/zaci') }}>Smazat žáka</ConfirmButton>
        </>
      } />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card card-body text-sm space-y-2">
            <h3 className="card-title">Profil</h3>
            {edit ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Příjmení"><input className="input" value={edit.lastName ?? ''} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></Field>
                  <Field label="Jméno"><input className="input" value={edit.firstName ?? ''} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Třída"><select className="input" value={edit.classId ?? ''} onChange={(e) => setEdit({ ...edit, classId: Number(e.target.value) || undefined })}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                  <Field label="Č. v katalogu"><input type="number" className="input" value={edit.catalogNumber ?? ''} onChange={(e) => setEdit({ ...edit, catalogNumber: Number(e.target.value) || undefined })} /></Field>
                </div>
                <Field label="Datum narození"><input type="date" className="input" value={edit.birthDate ?? ''} onChange={(e) => setEdit({ ...edit, birthDate: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Státní občanství"><input className="input" value={edit.citizenship ?? ''} onChange={(e) => setEdit({ ...edit, citizenship: e.target.value })} /></Field>
                  <Field label="Pohlaví"><select className="input" value={edit.gender ?? ''} onChange={(e) => setEdit({ ...edit, gender: (e.target.value || undefined) as 'M' | 'F' | undefined })}><option value="">—</option><option value="F">dívka</option><option value="M">chlapec</option></select></Field>
                </div>
                <Field label="Poznámka"><textarea className="input" rows={3} value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Aktivní žák</label>
                <div className="flex justify-end gap-2"><button className="btn-secondary btn-sm" onClick={() => setEdit(null)}>Zrušit</button><button className="btn-primary btn-sm" onClick={saveEdit}>Uložit</button></div>
              </div>
            ) : (
              <dl className="grid grid-cols-[110px_1fr] gap-y-1">
                <dt className="text-slate-500">Narozen/a</dt><dd>{fmtDate(student.birthDate) || '—'}{ageFrom(student.birthDate) != null && <span className="text-slate-500"> · {ageFrom(student.birthDate)} let</span>}{daysToBirthday(student.birthDate) === 0 && <span className="ml-1 badge bg-pink-100 text-pink-800">🎂 dnes má narozeniny</span>}{(daysToBirthday(student.birthDate) ?? 99) > 0 && (daysToBirthday(student.birthDate) ?? 99) <= 7 && <span className="ml-1 badge bg-pink-50 text-pink-700">narozeniny za {daysToBirthday(student.birthDate)} d.</span>}</dd>
                <dt className="text-slate-500">Občanství</dt><dd>{student.citizenship || '—'}</dd>
                <dt className="text-slate-500">Pohlaví</dt><dd>{student.gender ? GENDER_LABEL[student.gender] : '—'}</dd>
                <dt className="text-slate-500">Skupiny</dt><dd>{myGroups.map((g) => g.name).join(', ') || '—'}</dd>
                <dt className="text-slate-500">Absence</dt><dd>{logs.length} h (dle zápisů)</dd>
                <dt className="text-slate-500">Poznámka</dt><dd className="whitespace-pre-wrap">{student.note || '—'}</dd>
              </dl>
            )}
          </div>
          <div className="card card-body text-sm">
            <h3 className="card-title mb-2">Štítky</h3>
            <div className="flex flex-wrap gap-1 mb-2">
              {student.tags.map((t) => <Badge key={t} className="bg-purple-100 text-purple-800">{t} <button className="ml-1 hover:text-red-600" onClick={() => db.students.update(student.id, { tags: student.tags.filter((x) => x !== t) })}>×</button></Badge>)}
              {student.tags.length === 0 && <span className="text-slate-400">Žádné</span>}
            </div>
            <div className="flex gap-1 no-print">
              <input className="input" list="tags" placeholder="Přidat štítek…" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag(tagInput)} />
              <datalist id="tags">{TAG_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              <button className="btn-secondary btn-sm" onClick={() => addTag(tagInput)}><Plus size={14} /></button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center"><h3 className="card-title">Hodnocení</h3><Link to={`/hodnoceni?groupId=${myGroups[0]?.id ?? ''}`} className="text-xs text-blue-700 hover:underline no-print">Otevřít klasifikaci</Link></div>
            <div className="card-body space-y-4">
              {subjects.filter((s) => assessments.some((a) => a.subjectId === s.id) || myGroups.some((g) => g.subjectId === s.id)).map((s) => {
                const mine = assessments.filter((a) => a.subjectId === s.id).sort((a, b) => b.date.localeCompare(a.date))
                const avg = weightedAverage(mine, scale)
                const t1 = termRange(1, settings), t2 = termRange(2, settings)
                const avg1 = weightedAverage(mine.filter((a) => a.date >= t1.from && a.date <= t1.to), scale)
                const avg2 = weightedAverage(mine.filter((a) => a.date >= t2.from && a.date <= t2.to), scale)
                return (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-sm">1. pol.: <span className={`font-bold ${avgColor(avg1)}`}>{avg1 ?? '—'}</span>{avg1 != null && <span className="text-slate-400"> ({proposedGrade(avg1)})</span>} · 2. pol.: <span className={`font-bold ${avgColor(avg2)}`}>{avg2 ?? '—'}</span>{avg2 != null && <span className="text-slate-400"> ({proposedGrade(avg2)})</span>} · rok: <span className={`font-bold ${avgColor(avg)}`}>{avg ?? '—'}</span></div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {mine.map((a) => {
                        const g = effectiveGrade(a, scale)
                        const cat = categories.find((c) => c.id === a.categoryId)
                        return <span key={a.id} title={`${fmtDate(a.date)} · ${a.title} · ${cat?.name ?? ''} · váha ${a.weight}${percentOf(a) != null ? ` · ${percentOf(a)} %` : ''}${a.note ? `\n${a.note}` : ''}`}
                          className={`inline-flex items-center justify-center h-7 min-w-7 px-1 rounded border text-sm font-semibold ${a.absent ? 'bg-slate-100 text-slate-400 border-slate-200' : GRADE_COLORS[g ?? 5]}`} style={{ borderLeftWidth: 4, borderLeftColor: cat?.color }}>{a.absent ? 'N' : g}</span>
                      })}
                      {mine.length === 0 && <span className="text-sm text-slate-400">Zatím bez známek.</span>}
                    </div>
                    <div className="grid md:grid-cols-2 gap-2">
                      {([1, 2] as const).map((term) => {
                        const ev = evals.find((e) => e.subjectId === s.id && e.term === term)
                        return (
                          <div key={term} className="rounded border border-slate-200 p-2">
                            <div className="flex items-center justify-between mb-1 text-xs font-semibold text-slate-600">
                              <span>{term}. pololetí – slovní hodnocení</span>
                              <span>Známka: <select className="input w-auto inline-block py-0 px-1 text-xs" value={ev?.proposedGrade ?? ''} onChange={(e) => saveEval(s.id, term, { proposedGrade: Number(e.target.value) || undefined })}><option value="">—</option>{[1, 2, 3, 4, 5].map((g) => <option key={g} value={g}>{g}</option>)}</select></span>
                            </div>
                            <textarea className="input text-xs" rows={3} placeholder="Slovní hodnocení, doporučení…" defaultValue={ev?.text ?? ''} key={ev?.id ?? `new-${term}`} onBlur={(e) => e.target.value !== (ev?.text ?? '') && saveEval(s.id, term, { text: e.target.value })} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {subjects.length === 0 && <p className="text-sm text-slate-500">Nejprve založte předmět v Nastavení.</p>}
            </div>
          </div>

          <div className="card">
            <div className="px-4 py-3 border-b border-slate-200"><h3 className="card-title">Poznámky k žákovi</h3></div>
            <div className="card-body">
              <div className="flex gap-2 mb-3 no-print">
                <select className="input w-auto" value={noteKind} onChange={(e) => setNoteKind(e.target.value as StudentNoteKind)}>{Object.entries(NOTE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                <input className="input" placeholder="Nová poznámka… (Enter uloží)" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                <button className="btn-primary" onClick={addNote}><Plus size={16} /></button>
              </div>
              <ul className="divide-y divide-slate-100">
                {notes.length === 0 && <li className="text-sm text-slate-400 py-2">Zatím žádné poznámky.</li>}
                {notes.map((n) => (
                  <li key={n.id} className="py-2 text-sm flex gap-3 items-start">
                    <span className="text-slate-500 w-20 shrink-0">{fmtDate(n.date)}</span>
                    <Badge className={NOTE_KINDS[n.kind].color}>{NOTE_KINDS[n.kind].label}</Badge>
                    <span className="flex-1 whitespace-pre-wrap">{n.text}</span>
                    <ConfirmButton className="btn-ghost btn-sm no-print" onConfirm={() => db.studentNotes.delete(n.id)}>×</ConfirmButton>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
