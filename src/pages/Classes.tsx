import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Scissors, Users, Sparkles, Armchair, Printer } from 'lucide-react'
import { db, type Group, type SchoolClass } from '../db/schema'
import { useClasses, useGroups, useStudents, useSubjects } from '../components/hooks'
import { Badge, ColorDot, ConfirmButton, EmptyState, Field, Modal, PageHeader } from '../components/ui'
import { byName, fullName } from '../lib/format'
import { gradeFromClassName } from '../lib/excelImport'

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#db2777', '#64748b']

export function ClassesPage() {
  const classes = useClasses()
  const groups = useGroups()
  const students = useStudents()
  const subjects = useSubjects()
  const [params, setParams] = useSearchParams()
  const selectedClassId = Number(params.get('class')) || classes[0]?.id
  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const [classDraft, setClassDraft] = useState<Partial<SchoolClass> | null>(null)
  const [groupDraft, setGroupDraft] = useState<(Omit<Group, 'id'> & { id?: number }) | null>(null)

  const classStudents = students.filter((s) => s.classId === selectedClassId)
  const gradeGroups = selectedClass ? groups.filter((g) => g.gradeLevel === selectedClass.gradeLevel) : []
  const crossGroups = groups.filter((g) => !g.gradeLevel)
  const draftStudents = groupDraft ? (groupDraft.gradeLevel ? students.filter((s) => classes.find((c) => c.id === s.classId)?.gradeLevel === groupDraft.gradeLevel) : students) : []
  const draftClasses = groupDraft ? (groupDraft.gradeLevel ? classes.filter((c) => c.gradeLevel === groupDraft.gradeLevel) : classes) : []

  const saveClass = async () => {
    if (!classDraft?.name?.trim()) return
    const data = { name: classDraft.name.trim(), gradeLevel: classDraft.gradeLevel || gradeFromClassName(classDraft.name), classTeacher: classDraft.classTeacher, note: classDraft.note }
    if (classDraft.id) await db.classes.update(classDraft.id, data)
    else { const id = await db.classes.add(data); setParams({ class: String(id) }) }
    setClassDraft(null)
  }
  const saveGroup = async () => {
    if (!groupDraft?.name.trim()) return
    const { id, ...data } = groupDraft
    if (id) await db.groups.update(id, data)
    else await db.groups.add(data)
    setGroupDraft(null)
  }
  /** Rozdělí třídu abecedně na dvě poloviny a vytvoří dvě skupiny. */
  const splitInHalf = async () => {
    if (!selectedClass) return
    const sorted = [...classStudents].sort(byName)
    const half = Math.ceil(sorted.length / 2)
    const subjectId = subjects[0]?.id
    const abbr = subjects[0]?.abbreviation ?? ''
    await db.groups.bulkAdd([
      { name: `${abbr} ${selectedClass.name} – 1. skupina`.trim(), subjectId, gradeLevel: selectedClass.gradeLevel, studentIds: sorted.slice(0, half).map((s) => s.id), color: COLORS[0] },
      { name: `${abbr} ${selectedClass.name} – 2. skupina`.trim(), subjectId, gradeLevel: selectedClass.gradeLevel, studentIds: sorted.slice(half).map((s) => s.id), color: COLORS[1] },
    ])
  }
  const groupsOfStudent = (id: number) => [...gradeGroups, ...crossGroups].filter((g) => g.studentIds.includes(id))
  const toggleMember = (id: number) => {
    if (!groupDraft) return
    const has = groupDraft.studentIds.includes(id)
    setGroupDraft({ ...groupDraft, studentIds: has ? groupDraft.studentIds.filter((x) => x !== id) : [...groupDraft.studentIds, id] })
  }

  return (
    <div>
      <PageHeader title="Třídy a skupiny" subtitle="Kmenové třídy a dělené skupiny (např. angličtina na půl)" actions={
        <>
          <button className="btn-secondary" onClick={() => setGroupDraft({ name: 'Kroužek ', gradeLevel: 0, subjectId: subjects[0]?.id, studentIds: [], color: '#7c3aed' })}><Sparkles size={16} /> Nový kroužek (napříč ročníky)</button>
          <button className="btn-primary" onClick={() => setClassDraft({ name: '', gradeLevel: 0 })}><Plus size={16} /> Nová třída</button>
        </>
      } />
      {crossGroups.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 font-semibold text-slate-700 flex items-center gap-2"><Sparkles size={16} /> Kroužky a skupiny napříč ročníky</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {crossGroups.map((g) => {
              const members = g.studentIds.map((id) => students.find((s) => s.id === id)).filter(Boolean).sort((a, b) => byName(a!, b!))
              return (
                <div key={g.id} className="card">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200" style={{ borderTop: `3px solid ${g.color ?? '#7c3aed'}` }}>
                    <div><div className="font-semibold text-sm">{g.name}</div><div className="text-xs text-slate-500">{subjects.find((s) => s.id === g.subjectId)?.name ?? ''} · {members.length} žáků</div></div>
                    <div className="flex gap-1">
                      <Link to={`/dochazka?groupId=${g.id}`} className="btn-secondary btn-sm">Docházka</Link>
                      <Link to={`/zasedaci?groupId=${g.id}`} className="btn-secondary btn-sm" title="Zasedací pořádek"><Armchair size={14} /></Link>
                      <button className="btn-secondary btn-sm" onClick={() => setGroupDraft({ ...g })}>Upravit</button>
                      <ConfirmButton onConfirm={() => db.groups.delete(g.id)}>×</ConfirmButton>
                    </div>
                  </div>
                  <div className="card-body text-sm columns-2 gap-4">{members.map((s) => <div key={s!.id} className="truncate">{fullName(s!)} <span className="text-slate-400 text-xs">{classes.find((c) => c.id === s!.classId)?.name}</span></div>)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {classes.length === 0 && <EmptyState>Zatím žádná třída. Přidejte ji ručně nebo <Link className="text-blue-700 underline" to="/import">naimportujte z Excelu</Link>.</EmptyState>}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="card">
          <ul className="divide-y divide-slate-100">
            {classes.map((c) => (
              <li key={c.id}>
                <button onClick={() => setParams({ class: String(c.id) })} className={`w-full px-4 py-2.5 text-left text-sm flex justify-between ${c.id === selectedClassId ? 'bg-blue-50 font-semibold text-blue-900' : 'hover:bg-slate-50'}`}>
                  <span>{c.name}</span><span className="text-slate-400">{students.filter((s) => s.classId === c.id).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selectedClass && (
          <div className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
                <div>
                  <h2 className="card-title">{selectedClass.name} <span className="text-slate-400 font-normal">· {selectedClass.gradeLevel}. ročník</span></h2>
                  {selectedClass.classTeacher && <div className="text-xs text-slate-500">Třídní: {selectedClass.classTeacher}</div>}
                </div>
                <div className="flex gap-2">
                  <Link to={`/zasedaci?classId=${selectedClass.id}`} className="btn-secondary btn-sm"><Armchair size={14} /> Zasedací pořádek</Link>
                  <button className="btn-secondary btn-sm" onClick={() => setClassDraft({ ...selectedClass })}>Upravit</button>
                  <button className="btn-secondary btn-sm" onClick={splitInHalf} disabled={classStudents.length === 0}><Scissors size={14} /> Rozdělit na poloviny</button>
                  <button className="btn-primary btn-sm" onClick={() => setGroupDraft({ name: '', gradeLevel: selectedClass.gradeLevel, subjectId: subjects[0]?.id, studentIds: [], color: COLORS[gradeGroups.length % COLORS.length] })}><Plus size={14} /> Nová skupina</button>
                  <ConfirmButton onConfirm={async () => { await db.classes.delete(selectedClass.id); setParams({}) }}>Smazat třídu</ConfirmButton>
                </div>
              </div>
              <div className="card-body overflow-x-auto">
                {classStudents.length === 0 ? <p className="text-sm text-slate-500">Ve třídě nejsou žádní žáci.</p> : (
                  <table className="table">
                    <thead><tr><th>#</th><th>Žák</th><th>Skupiny</th><th>Štítky</th></tr></thead>
                    <tbody>
                      {classStudents.map((s) => (
                        <tr key={s.id}>
                          <td className="text-slate-400 w-8">{s.catalogNumber ?? ''}</td>
                          <td><Link className="text-blue-700 hover:underline" to={`/zaci/${s.id}`}>{fullName(s)}</Link></td>
                          <td className="space-x-1">{groupsOfStudent(s.id).map((g) => <Badge key={g.id} className="bg-slate-100 text-slate-700"><ColorDot color={g.color} /> <span className="ml-1">{g.name}</span></Badge>)}</td>
                          <td className="space-x-1">{s.tags.map((t) => <Badge key={t} className="bg-purple-100 text-purple-800">{t}</Badge>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-700 flex items-center gap-2"><Users size={16} /> Skupiny v {selectedClass.gradeLevel}. ročníku</h3>
              {gradeGroups.length === 0 && <EmptyState>Žádné skupiny. Použijte „Rozdělit na poloviny“ nebo vytvořte skupinu ručně.</EmptyState>}
              <div className="grid gap-3 md:grid-cols-2">
                {gradeGroups.map((g) => {
                  const members = g.studentIds.map((id) => students.find((s) => s.id === id)).filter(Boolean).sort((a, b) => byName(a!, b!))
                  return (
                    <div key={g.id} className="card">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200" style={{ borderTop: `3px solid ${g.color ?? '#94a3b8'}` }}>
                        <div>
                          <div className="font-semibold text-sm">{g.name}</div>
                          <div className="text-xs text-slate-500">{subjects.find((s) => s.id === g.subjectId)?.name ?? ''} · {members.length} žáků</div>
                        </div>
                        <div className="flex gap-1">
                          <Link to={`/hodnoceni?groupId=${g.id}`} className="btn-secondary btn-sm">Známky</Link>
                          <Link to={`/zasedaci?groupId=${g.id}`} className="btn-secondary btn-sm" title="Zasedací pořádek"><Armchair size={14} /></Link>
                          <Link to={`/tisk?groupId=${g.id}`} className="btn-secondary btn-sm" title="Podklady na třídní schůzky (tisk)"><Printer size={14} /></Link>
                          <button className="btn-secondary btn-sm" onClick={() => setGroupDraft({ ...g })}>Upravit</button>
                          <ConfirmButton onConfirm={() => db.groups.delete(g.id)}>×</ConfirmButton>
                        </div>
                      </div>
                      <div className="card-body text-sm columns-2 gap-4">
                        {members.map((s) => <div key={s!.id} className="truncate">{fullName(s!)} <span className="text-slate-400 text-xs">{classes.find((c) => c.id === s!.classId)?.name}</span></div>)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!classDraft} onClose={() => setClassDraft(null)} title={classDraft?.id ? 'Upravit třídu' : 'Nová třída'}>
        {classDraft && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Název (např. 6.A)"><input className="input" autoFocus value={classDraft.name ?? ''} onChange={(e) => setClassDraft({ ...classDraft, name: e.target.value, gradeLevel: gradeFromClassName(e.target.value) || classDraft.gradeLevel })} /></Field>
              <Field label="Ročník"><input type="number" min={1} max={9} className="input" value={classDraft.gradeLevel || ''} onChange={(e) => setClassDraft({ ...classDraft, gradeLevel: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Třídní učitel"><input className="input" value={classDraft.classTeacher ?? ''} onChange={(e) => setClassDraft({ ...classDraft, classTeacher: e.target.value })} /></Field>
            <Field label="Poznámka"><textarea className="input" rows={2} value={classDraft.note ?? ''} onChange={(e) => setClassDraft({ ...classDraft, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setClassDraft(null)}>Zrušit</button><button className="btn-primary" onClick={saveClass}>Uložit</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!groupDraft} onClose={() => setGroupDraft(null)} title={groupDraft?.id ? 'Upravit skupinu' : groupDraft?.gradeLevel ? 'Nová skupina' : 'Nový kroužek / skupina napříč ročníky'} wide>
        {groupDraft && (
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_180px_120px] gap-3">
              <Field label="Název skupiny"><input className="input" autoFocus value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} /></Field>
              <Field label="Předmět">
                <select className="input" value={groupDraft.subjectId ?? ''} onChange={(e) => setGroupDraft({ ...groupDraft, subjectId: Number(e.target.value) || undefined })}>
                  <option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Barva">
                <div className="flex flex-wrap gap-1 pt-1">{COLORS.map((c) => <button key={c} onClick={() => setGroupDraft({ ...groupDraft, color: c })} className={`h-5 w-5 rounded-full border-2 ${groupDraft.color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ background: c }} />)}</div>
              </Field>
            </div>
            <div>
              <div className="label">Členové ({groupDraft.studentIds.length}){groupDraft.gradeLevel ? ` – žáci ${groupDraft.gradeLevel}. ročníku` : ' – žáci ze všech tříd'}</div>
              <div className="grid gap-x-4 sm:grid-cols-2 md:grid-cols-3 max-h-80 overflow-y-auto border border-slate-200 rounded p-2">
                {draftClasses.map((c) => (
                  <div key={c.id}>
                    <div className="text-xs font-semibold text-slate-500 mt-1 flex items-center justify-between">{c.name}
                      <button className="text-blue-700 hover:underline font-normal" onClick={() => {
                        const ids = draftStudents.filter((s) => s.classId === c.id).map((s) => s.id)
                        const all = ids.every((id) => groupDraft.studentIds.includes(id))
                        setGroupDraft({ ...groupDraft, studentIds: all ? groupDraft.studentIds.filter((id) => !ids.includes(id)) : Array.from(new Set([...groupDraft.studentIds, ...ids])) })
                      }}>vše</button>
                    </div>
                    {draftStudents.filter((s) => s.classId === c.id).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm py-0.5">
                        <input type="checkbox" checked={groupDraft.studentIds.includes(s.id)} onChange={() => toggleMember(s.id)} /> {fullName(s)}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <Field label="Poznámka"><input className="input" value={groupDraft.note ?? ''} onChange={(e) => setGroupDraft({ ...groupDraft, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setGroupDraft(null)}>Zrušit</button><button className="btn-primary" onClick={saveGroup}>Uložit</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
