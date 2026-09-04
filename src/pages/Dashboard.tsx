import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { CalendarDays, ClipboardList, ListChecks, BookOpenCheck, Sparkles, BellRing, Check } from 'lucide-react'
import { db } from '../db/schema'
import { loadDemoData } from '../db/seed'
import { useClasses, useGroups, useSettings, useStudents, useSubjects } from '../components/hooks'
import { Badge, EmptyState, PageHeader } from '../components/ui'
import { EVENT_KINDS, fmtDate, lessonRange, todayISO } from '../lib/format'
import { collectReminders } from '../lib/reminders'
import { scheduleForDate } from '../lib/schedule'

export function Dashboard() {
  const settings = useSettings()
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const students = useStudents()
  const today = todayISO()
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const changes = useLiveQuery(() => db.timetableChanges.where('date').equals(today).toArray(), [today]) ?? []
  const todaySlots = scheduleForDate(today, slots, changes)
  const wholeDayOff = changes.find((c) => c.kind === 'odpada' && c.lessonNumber == null)
  const upcoming = useLiveQuery(() => db.events.where('date').between(today, addDays(new Date(), 14).toISOString().slice(0, 10), true, true).sortBy('date'), [today]) ?? []
  const overdue = useLiveQuery(() => db.events.where('date').below(today).filter((e) => !e.done && e.kind === 'ukol').toArray(), [today]) ?? []
  const recentLogs = useLiveQuery(() => db.lessonLogs.orderBy('date').reverse().limit(5).toArray(), []) ?? []
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? []
  const planItems = useLiveQuery(() => db.planItems.toArray(), []) ?? []
  const assessmentsCount = useLiveQuery(() => db.assessments.count(), []) ?? 0
  const recentNotes = useLiveQuery(() => db.studentNotes.orderBy('date').reverse().limit(5).toArray(), []) ?? []
  const todayLogs = useLiveQuery(() => db.lessonLogs.where('date').equals(today).toArray(), [today]) ?? []
  const reminders = useLiveQuery(() => collectReminders(), [today]) ?? []
  const loggedSlot = (s: { groupId?: number; classId?: number; lessonNumber: number }) => todayLogs.find((l) => (s.groupId ? l.groupId === s.groupId : l.classId === s.classId) && (l.lessonNumber == null || l.lessonNumber === s.lessonNumber))

  const groupName = (id?: number) => groups.find((g) => g.id === id)?.name
  const className = (id?: number) => classes.find((c) => c.id === id)?.name
  const subjectName = (id?: number) => subjects.find((s) => s.id === id)?.abbreviation
  const subjectIdOf = (e: { subjectId?: number }) => e.subjectId ?? settings?.defaultSubjectId ?? subjects[0]?.id ?? ''
  const studentName = (id: number) => { const s = students.find((x) => x.id === id); return s ? `${s.lastName} ${s.firstName}` : '' }
  const isEmpty = classes.length === 0 && students.length === 0

  return (
    <div>
      <PageHeader title={`Dobrý den${settings?.teacherName ? `, ${settings.teacherName}` : ''}`} subtitle={fmtDate(today, 'EEEE d. MMMM yyyy')} />
      {isEmpty && (
        <div className="card card-body mb-4 border-blue-200 bg-blue-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-blue-900">Začínáme</div>
              <p className="text-sm text-blue-800">Nahrajte seznam žáků z Excelu (export ze Školy online) v sekci <Link className="underline" to="/import">Import dat</Link>, nebo si aplikaci vyzkoušejte na ukázkových datech.</p>
            </div>
            <button className="btn-primary" onClick={() => loadDemoData()}><Sparkles size={16} /> Načíst ukázková data</button>
          </div>
        </div>
      )}

      {reminders.length > 0 && settings?.remindersEnabled !== false && (
        <div className="card card-body mb-4 border-amber-300 bg-amber-50">
          <div className="flex items-center gap-2 font-semibold text-amber-900 mb-1"><BellRing size={16} /> Připomínky</div>
          <ul className="text-sm text-amber-900 space-y-0.5">
            {reminders.map((r) => (
              <li key={r.event.id} className="flex items-center gap-2">
                <input type="checkbox" title="Hotovo" onChange={() => db.events.update(r.event.id, { done: true })} />
                <span className={`badge ${r.when === 'dnes' ? 'bg-red-100 text-red-800' : r.when === 'zítra' ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700'}`}>{r.when}</span>
                <span className="text-amber-700">{fmtDate(r.event.date, 'EE d. M.')}{r.event.timeFrom ? ` ${r.event.timeFrom}` : ''}</span>
                <Badge className={EVENT_KINDS[r.event.kind].color}>{EVENT_KINDS[r.event.kind].label}</Badge>
                <span className="font-medium">{r.event.title}</span>
                <span className="text-xs text-amber-700">{groupName(r.event.groupId) ?? className(r.event.classId) ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <Stat label="Tříd" value={classes.length} to="/tridy" />
        <Stat label="Skupin" value={groups.length} to="/tridy" />
        <Stat label="Žáků" value={students.length} to="/zaci" />
        <Stat label="Zapsaných známek" value={assessmentsCount} to="/hodnoceni" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="card-title flex items-center gap-2"><BookOpenCheck size={18} /> Dnes učím</h2>
            <Link to="/rozvrh" className="text-xs text-blue-700 hover:underline">Rozvrh</Link>
          </div>
          <div className="card-body">
            {wholeDayOff && <p className="mb-2 rounded bg-red-50 border border-red-200 p-2 text-sm text-red-800">Dnes odpadá celý den{wholeDayOff.note ? `: ${wholeDayOff.note}` : ''}.</p>}
            {todaySlots.length === 0 ? <p className="text-sm text-slate-500">Dnes nemáte v rozvrhu žádnou hodinu.</p> : (
              <ul className="divide-y divide-slate-100">
                {todaySlots.map((s, i) => (
                  <li key={i} className={`flex items-center gap-3 py-2 text-sm ${s.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <span className="w-28 text-slate-500">{s.lessonNumber}. h <span className="text-xs">{lessonRange(s.lessonNumber)}</span></span>
                    <Badge className={s.kind === 'krouzek' ? 'bg-purple-100 text-purple-800' : s.status === 'substitution' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-800'}>{s.kind === 'krouzek' ? 'Kroužek' : s.status === 'substitution' ? `Supl. ${subjectName(s.subjectId) ?? ''}` : subjectName(s.subjectId)}</Badge>
                    <span className={`font-medium ${s.status === 'cancelled' ? 'line-through' : ''}`}>{s.kind === 'krouzek' ? s.title : groupName(s.groupId) ?? className(s.classId) ?? s.title ?? ''}</span>
                    {s.room && <span className="text-slate-400">uč. {s.room}</span>}
                    {s.status === 'cancelled' && <span className="text-xs text-red-700">odpadá{s.reason ? `: ${s.reason}` : ''}</span>}
                    {s.status === 'substitution' && s.change?.note && <span className="text-xs text-amber-700">{s.change.note}</span>}
                    {s.status !== 'cancelled' && (loggedSlot(s) ? <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-700" title={loggedSlot(s)!.topic}><Check size={14} /> zapsáno</span> : <Link to={`/zapisy?groupId=${s.groupId ?? ''}&classId=${s.classId ?? ''}&subjectId=${subjectIdOf(s)}&lesson=${s.lessonNumber}`} className="ml-auto btn-primary btn-sm">Zapsat hodinu</Link>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="card-title flex items-center gap-2"><CalendarDays size={18} /> Nejbližších 14 dní</h2>
            <Link to="/kalendar" className="text-xs text-blue-700 hover:underline">Kalendář</Link>
          </div>
          <div className="card-body">
            {overdue.length > 0 && (
              <div className="mb-2 rounded bg-red-50 border border-red-200 p-2 text-xs text-red-800">
                Nesplněné termíny: {overdue.map((e) => `${e.title} (${fmtDate(e.date)})`).join(', ')}
              </div>
            )}
            {upcoming.length === 0 ? <p className="text-sm text-slate-500">Žádné události.</p> : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((e) => (
                  <li key={e.id} className={`flex items-center gap-3 py-2 text-sm ${e.done ? 'opacity-50 line-through' : ''}`}>
                    <span className="w-20 text-slate-500">{fmtDate(e.date, 'EE d. M.')}</span>
                    <Badge className={EVENT_KINDS[e.kind].color}>{EVENT_KINDS[e.kind].label}</Badge>
                    <span className="font-medium">{e.title}</span>
                    <span className="text-slate-400 text-xs">{groupName(e.groupId) ?? className(e.classId) ?? ''}{e.timeFrom ? ` · ${e.timeFrom}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="card-title flex items-center gap-2"><ListChecks size={18} /> Tematické plány</h2>
            <Link to="/plany" className="text-xs text-blue-700 hover:underline">Vše</Link>
          </div>
          <div className="card-body space-y-3">
            {plans.length === 0 ? <p className="text-sm text-slate-500">Zatím žádný plán. Nahrajte Word dokument v sekci Import dat.</p> : plans.map((p) => {
              const items = planItems.filter((i) => i.planId === p.id && i.level > 0)
              const done = items.filter((i) => i.done).length
              const pct = items.length ? Math.round((done / items.length) * 100) : 0
              return (
                <Link key={p.id} to={`/plany/${p.id}`} className="block">
                  <div className="flex justify-between text-sm"><span className="font-medium">{p.title}</span><span className="text-slate-500">{done}/{items.length} · {pct} %</span></div>
                  <div className="h-2 rounded bg-slate-200 mt-1"><div className="h-2 rounded bg-green-500" style={{ width: `${pct}%` }} /></div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h2 className="card-title flex items-center gap-2"><ClipboardList size={18} /> Poslední zápisy a poznámky</h2>
            <Link to="/zapisy" className="text-xs text-blue-700 hover:underline">Zápisy</Link>
          </div>
          <div className="card-body">
            {recentLogs.length === 0 && recentNotes.length === 0 && <EmptyState>Zatím nic.</EmptyState>}
            <ul className="divide-y divide-slate-100">
              {recentLogs.map((l) => (
                <li key={`l${l.id}`} className="py-2 text-sm">
                  <span className="text-slate-500 mr-2">{fmtDate(l.date)}</span>
                  <span className="font-medium">{groupName(l.groupId) ?? className(l.classId)}</span>: {l.topic}
                  {l.absentStudentIds.length > 0 && <span className="text-xs text-slate-400 ml-2">chybělo: {l.absentStudentIds.length}</span>}
                </li>
              ))}
              {recentNotes.map((n) => (
                <li key={`n${n.id}`} className="py-2 text-sm">
                  <span className="text-slate-500 mr-2">{fmtDate(n.date)}</span>
                  <Link to={`/zaci/${n.studentId}`} className="font-medium text-blue-700 hover:underline">{studentName(n.studentId)}</Link>: {n.text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="card card-body hover:border-blue-300">
      <div className="text-3xl font-bold text-blue-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </Link>
  )
}
