import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { db } from '../db/schema'
import { useCategories, useClasses, useGroups, useMyGroups, useScale, useSettings, useStudents, useSubjects } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { NOTE_KINDS, fmtDate, fullName, todayISO } from '../lib/format'
import { effectiveGrade, percentOf, proposedGrade, weightedAverage } from '../lib/grading'
import { TERM_LABEL, currentTerm, termRange, type Term } from '../lib/terms'

export function PrintReportPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const subjects = useSubjects()
  const groups = useGroups()
  const myGroups = useMyGroups()
  const classes = useClasses()
  const students = useStudents()
  const categories = useCategories()
  const scale = useScale()
  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const onlyStudentId = Number(params.get('studentId')) || undefined
  const subjectId = Number(params.get('subjectId')) || groups.find((g) => g.id === groupId)?.subjectId || settings?.defaultSubjectId || subjects[0]?.id
  const [opts, setOpts] = useState({ grades: true, absence: true, notes: false, evaluation: true, signature: true })
  const [term, setTerm] = useState<Term | null>(null)
  const activeTerm: Term = term ?? (settings ? currentTerm(settings) : 0)
  const { from: dateFrom, to: dateTo } = termRange(activeTerm, settings)
  const group = groups.find((g) => g.id === groupId)
  const roster = useMemo(() => {
    const base = group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : onlyStudentId ? students.filter((s) => s.id === onlyStudentId) : []
    return onlyStudentId ? base.filter((s) => s.id === onlyStudentId) : base
  }, [group, classId, onlyStudentId, students])
  const ids = roster.map((s) => s.id)
  const data = useLiveQuery(async () => {
    if (!ids.length || !subjectId) return null
    const inRange = (d: string) => d >= dateFrom && d <= dateTo
    const assessments = (await db.assessments.where('subjectId').equals(subjectId).toArray()).filter((a) => ids.includes(a.studentId) && inRange(a.date))
    const logs = (await db.lessonLogs.toArray()).filter((l) => inRange(l.date) && (groupId ? l.groupId === groupId : classId ? l.classId === classId : true))
    const notes = (await db.studentNotes.toArray()).filter((n) => ids.includes(n.studentId) && inRange(n.date))
    const evals = (await db.termEvaluations.toArray()).filter((e) => ids.includes(e.studentId) && e.subjectId === subjectId && (activeTerm === 0 || e.term === activeTerm))
    return { assessments, logs, notes, evals }
  }, [ids.join(','), subjectId, dateFrom, dateTo, groupId, classId, activeTerm])
  const subject = subjects.find((s) => s.id === subjectId)
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? ''

  return (
    <div>
      <div className="no-print">
        <Link to={onlyStudentId ? `/zaci/${onlyStudentId}` : classId ? `/tridy?class=${classId}` : '/tridy'} className="btn-ghost btn-sm mb-2"><ArrowLeft size={14} /> Zpět</Link>
        <PageHeader title="Podklady na schůzku s rodiči" subtitle="Přehled hodnocení, absence a poznámek – jedna stránka na žáka" actions={
          <button className="btn-primary" disabled={!roster.length} onClick={() => window.print()}><Printer size={16} /> Tisknout ({roster.length})</button>
        } />
        <div className="card card-body mb-4 flex flex-wrap items-end gap-3">
          <div><div className="label">Skupina / třída</div>
            <select className="input w-auto" value={groupId ? `g${groupId}` : classId ? `c${classId}` : ''} onChange={(e) => { const v = e.target.value; setParams(v.startsWith('g') ? { groupId: v.slice(1) } : v ? { classId: v.slice(1) } : {}) }}><option value="">—</option><optgroup label="Skupiny">{myGroups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup><optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup></select></div>
          <div><div className="label">Předmět</div>
            <select className="input w-auto" value={subjectId ?? ''} onChange={(e) => setParams({ ...Object.fromEntries(params), subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><div className="label">Jen žák</div>
            <select className="input w-auto" value={onlyStudentId ?? ''} onChange={(e) => setParams({ ...Object.fromEntries(params), studentId: e.target.value })}><option value="">všichni ve skupině</option>{(group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : students).map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></div>
          <div><div className="label">Období</div><select className="input w-auto" value={activeTerm} onChange={(e) => setTerm(Number(e.target.value) as Term)}>{([1, 2, 0] as Term[]).map((t) => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}</select></div>
          <div className="flex flex-wrap gap-3 text-sm pb-1">
            {([['grades', 'známky'], ['absence', 'absence'], ['evaluation', 'slovní hodnocení'], ['notes', 'poznámky (pochvaly, napomenutí)'], ['signature', 'podpis rodiče']] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {l}</label>
            ))}
          </div>
        </div>
        {!roster.length && <div className="card card-body text-sm text-slate-500">Vyberte skupinu nebo žáka.</div>}
      </div>

      {data && roster.map((s) => {
        const mine = data.assessments.filter((a) => a.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date))
        const avg = weightedAverage(mine, scale)
        const absences = data.logs.filter((l) => l.absentStudentIds.includes(s.id))
        const notes = data.notes.filter((n) => n.studentId === s.id).sort((a, b) => a.date.localeCompare(b.date))
        const cls = classes.find((c) => c.id === s.classId)
        return (
          <div key={s.id} className="card card-body mb-4 print:mb-0 print:border-0 print:shadow-none print:break-after-page text-sm">
            <div className="flex items-start justify-between border-b border-slate-300 pb-2 mb-3">
              <div>
                <div className="text-lg font-bold">{fullName(s)} <span className="font-normal text-slate-500">· {cls?.name ?? ''}</span></div>
                <div className="text-slate-600">{subject?.name} · {settings?.schoolYear} · {settings?.schoolName}</div>
              </div>
              <div className="text-right text-xs text-slate-500">Vyučující: {settings?.teacherName}<br />Vytištěno {fmtDate(todayISO())} · {TERM_LABEL[activeTerm]} ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</div>
            </div>
            {opts.grades && (
              <section className="mb-3">
                <h3 className="font-semibold mb-1">Průběžné hodnocení – {TERM_LABEL[activeTerm]}</h3>
                {mine.length === 0 ? <p className="text-slate-500">Zatím bez známek.</p> : (
                  <table className="table text-xs">
                    <thead><tr><th>Datum</th><th>Hodnocení</th><th>Kategorie</th><th className="text-center">Váha</th><th className="text-center">Výsledek</th></tr></thead>
                    <tbody>{mine.map((a) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{a.title}{a.note ? <span className="text-slate-400"> – {a.note}</span> : ''}</td><td>{catName(a.categoryId)}</td><td className="text-center">{a.weight}</td><td className="text-center font-bold">{a.absent ? 'N' : effectiveGrade(a, scale)}{percentOf(a) != null && !a.absent ? <span className="font-normal text-slate-500"> ({a.points}/{a.maxPoints}, {percentOf(a)} %)</span> : ''}</td></tr>)}</tbody>
                  </table>
                )}
                {avg != null && <p className="mt-1">Vážený průměr: <b>{avg}</b> · odpovídá známce <b>{proposedGrade(avg)}</b></p>}
              </section>
            )}
            {opts.absence && (
              <section className="mb-3">
                <h3 className="font-semibold mb-1">Absence v předmětu</h3>
                <p>{absences.length} z {data.logs.length} zapsaných hodin{absences.length > 0 && <span className="text-slate-500"> ({absences.map((l) => fmtDate(l.date, 'd.M.')).join(', ')})</span>}</p>
              </section>
            )}
            {opts.evaluation && data.evals.filter((e) => e.studentId === s.id && (e.text || e.proposedGrade)).map((e) => (
              <section key={e.id} className="mb-3">
                <h3 className="font-semibold mb-1">Slovní hodnocení – {e.term}. pololetí{e.proposedGrade ? ` (návrh známky ${e.proposedGrade})` : ''}</h3>
                <p className="whitespace-pre-wrap">{e.text}</p>
              </section>
            ))}
            {opts.notes && notes.length > 0 && (
              <section className="mb-3">
                <h3 className="font-semibold mb-1">Poznámky</h3>
                <ul className="list-disc pl-5">{notes.map((n) => <li key={n.id}>{fmtDate(n.date)} · {NOTE_KINDS[n.kind].label}: {n.text}</li>)}</ul>
              </section>
            )}
            {opts.signature && <div className="mt-8 flex justify-between text-xs text-slate-500"><span>Podpis vyučujícího: ________________________</span><span>Podpis zákonného zástupce: ________________________</span></div>}
          </div>
        )
      })}
    </div>
  )
}
