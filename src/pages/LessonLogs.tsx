import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { db, type LessonLog } from '../db/schema'
import { useClasses, useGroups, useSettings, useStudents, useSubjects } from '../components/hooks'
import { Badge, ConfirmButton, Field, Modal, PageHeader } from '../components/ui'
import { fmtDate, fullName, todayISO } from '../lib/format'

type Draft = Omit<LessonLog, 'id'> & { id?: number }

export function LessonLogsPage() {
  const [params] = useSearchParams()
  const settings = useSettings()
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const students = useStudents()
  const [filterGroup, setFilterGroup] = useState<number | ''>('')
  const logs = useLiveQuery(() => db.lessonLogs.orderBy('date').reverse().toArray(), []) ?? []
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? []
  const planItems = useLiveQuery(() => db.planItems.orderBy('order').toArray(), []) ?? []
  const [draft, setDraft] = useState<Draft | null>(null)
  const prefilledFor = useRef('')

  const newDraft = (init: Partial<Draft> = {}): Draft => ({
    date: todayISO(), subjectId: settings?.defaultSubjectId ?? subjects[0]?.id ?? 0, groupId: groups[0]?.id, topic: '', absentStudentIds: [], ...init,
  })
  // Otevření z přehledu ("Zapsat hodinu")
  useEffect(() => {
    const key = params.toString()
    if (!params.get('subjectId') || prefilledFor.current === key || planItems.length === 0 && plans.length > 0) return
    if (plans.length === 0 && planItems.length === 0) return
    prefilledFor.current = key
    const base = newDraft({ subjectId: Number(params.get('subjectId')), groupId: Number(params.get('groupId')) || undefined, classId: Number(params.get('classId')) || undefined, lessonNumber: Number(params.get('lesson')) || undefined })
    // předvyplnit další neodškrtnuté téma z tematického plánu
    const next = relevantPlanItems(base).find((i) => !i.done)
    setDraft(next ? { ...base, planItemId: next.id, topic: next.text } : base)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, plans.length, planItems.length])

  const roster = (d: Draft) => d.groupId ? students.filter((s) => groups.find((g) => g.id === d.groupId)?.studentIds.includes(s.id)) : d.classId ? students.filter((s) => s.classId === d.classId) : []
  const groupName = (l: { groupId?: number; classId?: number }) => groups.find((g) => g.id === l.groupId)?.name ?? classes.find((c) => c.id === l.classId)?.name ?? ''
  const visible = filterGroup ? logs.filter((l) => l.groupId === filterGroup) : logs

  const save = async () => {
    if (!draft || !draft.topic.trim()) return
    const { id, ...data } = draft
    if (id) await db.lessonLogs.update(id, data)
    else await db.lessonLogs.add(data)
    if (draft.planItemId) await db.planItems.update(draft.planItemId, { done: true, doneDate: draft.date })
    setDraft(null)
  }
  const relevantPlanItems = (d: Draft) => {
    const g = groups.find((x) => x.id === d.groupId)
    const cls = classes.find((x) => x.id === d.classId)
    const grade = g?.gradeLevel ?? cls?.gradeLevel
    const relPlans = plans.filter((p) => (!p.subjectId || p.subjectId === d.subjectId) && (!p.gradeLevel || !grade || p.gradeLevel === grade) && (!p.groupId || p.groupId === d.groupId))
    return planItems.filter((i) => relPlans.some((p) => p.id === i.planId) && i.level > 0)
  }

  return (
    <div>
      <PageHeader title="Zápisy z hodin" subtitle="Co se probralo, kdo chyběl, domácí úkoly" actions={
        <>
          <select className="input w-auto" value={filterGroup} onChange={(e) => setFilterGroup(Number(e.target.value) || '')}><option value="">Všechny skupiny</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <button className="btn-primary" onClick={() => setDraft(newDraft())}><Plus size={16} /> Nový zápis</button>
        </>
      } />
      <div className="card">
        {visible.length === 0 && <div className="card-body text-sm text-slate-500">Zatím žádné zápisy.</div>}
        <ul className="divide-y divide-slate-100">
          {visible.map((l) => (
            <li key={l.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer" onClick={() => setDraft({ ...l })}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500 w-24">{fmtDate(l.date, 'EE d. M.')}</span>
                {l.lessonNumber && <span className="text-slate-400 text-xs">{l.lessonNumber}. h</span>}
                <Badge className="bg-blue-100 text-blue-800">{subjects.find((s) => s.id === l.subjectId)?.abbreviation}</Badge>
                <span className="font-medium">{groupName(l)}</span>
                <span className="flex-1">{l.topic}</span>
                {l.absentStudentIds.length > 0 && <span className="text-xs text-red-600">chybí {l.absentStudentIds.length}</span>}
              </div>
              {(l.homework || l.note) && <div className="ml-24 text-xs text-slate-500 mt-0.5">{l.homework && <span>DÚ: {l.homework} </span>}{l.note && <span>· {l.note}</span>}</div>}
            </li>
          ))}
        </ul>
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Upravit zápis' : 'Nový zápis z hodiny'} wide>
        {draft && (
          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <Field label="Datum"><input type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
                <Field label="Hodina"><input type="number" min={0} max={10} className="input" value={draft.lessonNumber ?? ''} onChange={(e) => setDraft({ ...draft, lessonNumber: Number(e.target.value) || undefined })} /></Field>
                <Field label="Předmět"><select className="input" value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: Number(e.target.value) })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.abbreviation}</option>)}</select></Field>
                <Field label="Skupina / třída">
                  <select className="input" value={draft.groupId ? `g${draft.groupId}` : draft.classId ? `c${draft.classId}` : ''} onChange={(e) => { const v = e.target.value; setDraft({ ...draft, groupId: v.startsWith('g') ? Number(v.slice(1)) : undefined, classId: v.startsWith('c') ? Number(v.slice(1)) : undefined, absentStudentIds: [] }) }}>
                    <option value="">—</option>
                    <optgroup label="Skupiny">{groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
                    <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
                  </select>
                </Field>
              </div>
              <Field label="Probrané učivo">
                <input className="input" autoFocus list="plan-topics" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Např. Present simple – otázky" />
              </Field>
              {relevantPlanItems(draft).length > 0 && (
                <Field label="Odškrtnout v tematickém plánu">
                  <select className="input" value={draft.planItemId ?? ''} onChange={(e) => { const id = Number(e.target.value) || undefined; const it = planItems.find((i) => i.id === id); setDraft({ ...draft, planItemId: id, topic: draft.topic || it?.text || '' }) }}>
                    <option value="">— žádná položka —</option>
                    {relevantPlanItems(draft).map((i) => <option key={i.id} value={i.id}>{i.done ? '✓ ' : ''}{i.month ? `[${i.month}] ` : ''}{i.text}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Domácí úkol"><input className="input" value={draft.homework ?? ''} onChange={(e) => setDraft({ ...draft, homework: e.target.value })} /></Field>
              <Field label="Poznámka (průběh hodiny, chování, co dokončit příště…)"><textarea className="input" rows={4} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
              <div className="flex justify-between pt-2">
                {draft.id ? <ConfirmButton onConfirm={async () => { await db.lessonLogs.delete(draft.id!); setDraft(null) }}>Smazat</ConfirmButton> : <span />}
                <div className="flex gap-2"><button className="btn-secondary" onClick={() => setDraft(null)}>Zrušit</button><button className="btn-primary" onClick={save}>Uložit</button></div>
              </div>
            </div>
            <div>
              <div className="label">Chybějící žáci ({draft.absentStudentIds.length})</div>
              <div className="max-h-96 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
                {roster(draft).length === 0 && <span className="text-slate-400">Vyberte skupinu.</span>}
                {roster(draft).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={draft.absentStudentIds.includes(s.id)} onChange={(e) => setDraft({ ...draft, absentStudentIds: e.target.checked ? [...draft.absentStudentIds, s.id] : draft.absentStudentIds.filter((x) => x !== s.id) })} />
                    <span className={draft.absentStudentIds.includes(s.id) ? 'line-through text-red-600' : ''}>{fullName(s)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
