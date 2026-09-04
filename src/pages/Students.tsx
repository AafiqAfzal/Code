import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Search } from 'lucide-react'
import { db, type Student } from '../db/schema'
import { useClasses, useGroups, useStudents } from '../components/hooks'
import { Badge, ColorDot, EmptyState, Field, Modal, PageHeader } from '../components/ui'
import { fullName, genderClass } from '../lib/format'
import { exportStudentsXlsx } from '../lib/export'

export function StudentsPage() {
  const classes = useClasses()
  const groups = useGroups()
  const [showInactive, setShowInactive] = useState(false)
  const students = useStudents(!showInactive)
  const [q, setQ] = useState('')
  const [classId, setClassId] = useState<number | ''>('')
  const [groupId, setGroupId] = useState<number | ''>('')
  const [tag, setTag] = useState('')
  const [gender, setGender] = useState<'' | 'M' | 'F'>('')
  const allTags = Array.from(new Set(students.flatMap((s) => s.tags))).sort((a, b) => a.localeCompare(b, 'cs'))
  const [draft, setDraft] = useState<Partial<Student> | null>(null)

  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const list = students.filter((s) =>
    (!q || fold(fullName(s)).includes(fold(q)) || fold(`${s.firstName} ${s.lastName}`).includes(fold(q))) &&
    (!classId || s.classId === classId) &&
    (!groupId || groups.find((g) => g.id === groupId)?.studentIds.includes(s.id)) &&
    (!tag || s.tags.includes(tag)) &&
    (!gender || s.gender === gender),
  )
  const className = (id?: number) => classes.find((c) => c.id === id)?.name ?? ''
  const groupsOf = (id: number) => groups.filter((g) => g.studentIds.includes(id))

  const save = async () => {
    if (!draft?.lastName?.trim()) return
    await db.students.add({ firstName: draft.firstName?.trim() ?? '', lastName: draft.lastName.trim(), classId: draft.classId, catalogNumber: draft.catalogNumber, tags: [], active: true })
    setDraft(null)
  }

  return (
    <div>
      <PageHeader title="Žáci" subtitle={`${list.length} žáků · ${list.filter((s) => s.gender === 'F').length} dívek, ${list.filter((s) => s.gender === 'M').length} chlapců`} actions={
        <>
          <button className="btn-secondary" onClick={() => exportStudentsXlsx(list, className, (id) => groupsOf(id).map((g) => g.name).join(', '))}><Download size={16} /> Export XLSX</button>
          <button className="btn-primary" onClick={() => setDraft({ classId: classes[0]?.id })}><Plus size={16} /> Nový žák</button>
        </>
      } />
      <div className="card card-body mb-4 flex flex-wrap items-center gap-3 no-print">
        <div className="relative flex-1 min-w-48"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" /><input className="input pl-7" placeholder="Hledat…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input w-auto" value={classId} onChange={(e) => setClassId(Number(e.target.value) || '')}><option value="">Všechny třídy</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto" value={groupId} onChange={(e) => setGroupId(Number(e.target.value) || '')}><option value="">Všechny skupiny</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Všechny štítky</option>{allTags.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select className="input w-auto" value={gender} onChange={(e) => setGender(e.target.value as '' | 'M' | 'F')}><option value="">Dívky i chlapci</option><option value="F">Jen dívky</option><option value="M">Jen chlapci</option></select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> vč. neaktivních</label>
        {(q || classId || groupId || tag || gender) && <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setClassId(''); setGroupId(''); setTag(''); setGender('') }}>Zrušit filtry</button>}
      </div>
      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs no-print"><span className="text-slate-500 mr-1">Štítky:</span>{allTags.map((t) => <button key={t} onClick={() => setTag(tag === t ? '' : t)} className={`badge ${tag === t ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}>{t} <span className="ml-1 opacity-70">{students.filter((s) => s.tags.includes(t)).length}</span></button>)}</div>
      )}
      {list.length === 0 ? <EmptyState>Žádní žáci. <Link className="text-blue-700 underline" to="/import">Importovat z Excelu</Link></EmptyState> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Příjmení a jméno</th><th>Třída</th><th>#</th><th>Skupiny</th><th>Štítky</th><th>Poznámka</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'opacity-50'}>
                  <td><Link to={`/zaci/${s.id}`} className={`font-medium hover:underline ${genderClass(s.gender)}`}>{fullName(s)}</Link></td>
                  <td>{className(s.classId)}</td>
                  <td className="text-slate-400">{s.catalogNumber ?? ''}</td>
                  <td className="space-x-1">{groupsOf(s.id).map((g) => <Badge key={g.id} className="bg-slate-100 text-slate-700"><ColorDot color={g.color} /> <span className="ml-1">{g.name}</span></Badge>)}</td>
                  <td className="space-x-1">{s.tags.map((t) => <button key={t} onClick={() => setTag(t)} className="badge bg-purple-100 text-purple-800 hover:bg-purple-200" title="Filtrovat podle štítku">{t}</button>)}</td>
                  <td className="text-slate-500 max-w-xs truncate">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!draft} onClose={() => setDraft(null)} title="Nový žák">
        {draft && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Příjmení"><input className="input" autoFocus value={draft.lastName ?? ''} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} /></Field>
              <Field label="Jméno"><input className="input" value={draft.firstName ?? ''} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Třída"><select className="input" value={draft.classId ?? ''} onChange={(e) => setDraft({ ...draft, classId: Number(e.target.value) || undefined })}><option value="">—</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Č. v katalogu"><input type="number" className="input" value={draft.catalogNumber ?? ''} onChange={(e) => setDraft({ ...draft, catalogNumber: Number(e.target.value) || undefined })} /></Field>
            </div>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setDraft(null)}>Zrušit</button><button className="btn-primary" onClick={save}>Uložit</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
