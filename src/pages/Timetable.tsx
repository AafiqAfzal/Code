import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type TimetableSlot } from '../db/schema'
import { useClasses, useGroups, useSubjects } from '../components/hooks'
import { ConfirmButton, Field, Modal, PageHeader } from '../components/ui'
import { LESSON_NUMBERS, LESSON_TIMES, WEEKDAYS } from '../lib/format'
import { importTimetableFile, readJsonFile, type TimetableFile } from '../db/seed'
import { FileJson } from 'lucide-react'

export function TimetablePage() {
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const [draft, setDraft] = useState<(Omit<TimetableSlot, 'id'> & { id?: number }) | null>(null)
  const [msg, setMsg] = useState('')
  const lessons = LESSON_NUMBERS
  const find = (d: number, l: number) => slots.find((s) => s.weekday === d && s.lessonNumber === l)
  const save = async () => {
    if (!draft) return
    const { id, ...data } = draft
    if (id) await db.timetable.update(id, data); else await db.timetable.add(data)
    setDraft(null)
  }
  return (
    <div>
      <PageHeader title="Rozvrh" subtitle="Klikněte na políčko pro nastavení hodiny" actions={
        <label className="btn-secondary"><FileJson size={16} /> Nahrát rozvrh ze souboru (JSON)
          <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (!confirm('Nahrání přepíše současný rozvrh. Pokračovat?')) { e.target.value = ''; return } try { const n = await importTimetableFile(await readJsonFile<TimetableFile>(f)); setMsg(`Nahráno ${n} hodin.`) } catch (err) { setMsg((err as Error).message) } e.target.value = '' }} />
        </label>
      } />
      {msg && <p className="mb-3 text-sm text-green-700">{msg}</p>}
      <p className="mb-3 text-xs text-slate-500">Hodiny dělených skupin se ze souboru naváží na existující skupiny „sk. N“ dané třídy (z importu žáků); jinak na celou třídu, což lze později upravit kliknutím.</p>
      <div className="card overflow-x-auto">
        <table className="table text-center">
          <thead><tr><th></th>{lessons.map((l) => <th key={l} className="text-center">{l}.<div className="font-normal text-[10px]">{LESSON_TIMES[l]}</div></th>)}</tr></thead>
          <tbody>
            {WEEKDAYS.map((name, i) => (
              <tr key={name}>
                <td className="text-left font-semibold">{name}</td>
                {lessons.map((l) => {
                  const s = find(i + 1, l)
                  const g = groups.find((x) => x.id === s?.groupId)
                  return (
                    <td key={l} className="p-0.5">
                      <button onClick={() => setDraft(s ? { ...s } : { weekday: i + 1, lessonNumber: l, subjectId: subjects[0]?.id ?? 0 })}
                        className={`h-14 w-full rounded border text-xs ${s ? 'text-white' : 'border-dashed border-slate-200 hover:bg-slate-50'}`} style={s ? { background: g?.color ?? '#2563eb', borderColor: 'transparent' } : undefined}>
                        {s && <><div className="font-bold">{subjects.find((x) => x.id === s.subjectId)?.abbreviation}</div><div className="truncate px-1">{g?.name ?? classes.find((c) => c.id === s.classId)?.name}</div>{s.room && <div className="opacity-80">uč. {s.room}</div>}</>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft ? `${WEEKDAYS[draft.weekday - 1]}, ${draft.lessonNumber}. hodina` : ''}>
        {draft && (
          <div className="space-y-3">
            <Field label="Předmět"><select className="input" value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: Number(e.target.value) })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Skupina / třída">
              <select className="input" value={draft.groupId ? `g${draft.groupId}` : draft.classId ? `c${draft.classId}` : ''} onChange={(e) => { const v = e.target.value; setDraft({ ...draft, groupId: v.startsWith('g') ? Number(v.slice(1)) : undefined, classId: v.startsWith('c') ? Number(v.slice(1)) : undefined }) }}>
                <option value="">—</option>
                <optgroup label="Skupiny">{groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
                <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
              </select>
            </Field>
            <Field label="Učebna"><input className="input" value={draft.room ?? ''} onChange={(e) => setDraft({ ...draft, room: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
            <div className="flex justify-between">
              {draft.id ? <ConfirmButton onConfirm={async () => { await db.timetable.delete(draft.id!); setDraft(null) }}>Odebrat</ConfirmButton> : <span />}
              <div className="flex gap-2"><button className="btn-secondary" onClick={() => setDraft(null)}>Zrušit</button><button className="btn-primary" onClick={save}>Uložit</button></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
