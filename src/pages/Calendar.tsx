import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getISODay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { db, type CalendarEvent, type EventKind } from '../db/schema'
import { useClasses, useGroups, useSubjects } from '../components/hooks'
import { Badge, ConfirmButton, Field, Modal, PageHeader } from '../components/ui'
import { EVENT_KINDS, WEEKDAYS_SHORT, fmtDate, todayISO } from '../lib/format'
import { activeLessons, scheduleForDate } from '../lib/schedule'
import { holidayName } from '../lib/holidays'

type Draft = Omit<CalendarEvent, 'id'> & { id?: number }
const emptyDraft = (date: string): Draft => ({ title: '', kind: 'test', date, done: false })

export function CalendarPage() {
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [filter, setFilter] = useState<EventKind | ''>('')
  const groups = useGroups()
  const classes = useClasses()
  const subjects = useSubjects()
  const from = format(startOfWeek(month, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const to = format(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const events = useLiveQuery(() => db.events.where('date').between(from, to, true, true).sortBy('date'), [from, to]) ?? []
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const changes = useLiveQuery(() => db.timetableChanges.where('date').between(from, to, true, true).toArray(), [from, to]) ?? []
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const today = todayISO()
  const visible = filter ? events.filter((e) => e.kind === filter) : events
  const upcoming = useLiveQuery(() => db.events.where('date').aboveOrEqual(today).sortBy('date'), [today]) ?? []

  const save = async () => {
    if (!draft || !draft.title.trim()) return
    const { id, ...data } = draft
    if (id) await db.events.update(id, data)
    else await db.events.add(data)
    setDraft(null)
  }
  const contextName = (e: CalendarEvent) => groups.find((g) => g.id === e.groupId)?.name ?? classes.find((c) => c.id === e.classId)?.name ?? ''

  return (
    <div>
      <PageHeader title="Kalendář" subtitle="Testy, schůzky, porady a termíny" actions={
        <>
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as EventKind | '')}>
            <option value="">Vše</option>
            {Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setDraft(emptyDraft(today))}><Plus size={16} /> Nová událost</button>
        </>
      } />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <button className="btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={16} /></button>
            <div className="font-semibold capitalize">{fmtDate(format(month, 'yyyy-MM-dd'), 'LLLL yyyy')}</div>
            <div className="flex gap-1">
              <button className="btn-secondary btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>Dnes</button>
              <button className="btn-ghost btn-sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-xs font-semibold text-slate-500 border-b border-slate-200">
            {WEEKDAYS_SHORT.map((d, i) => <div key={d} className={`px-2 py-1 text-center ${i >= 5 ? 'text-amber-700 bg-amber-50/70' : ''}`}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const iso = format(d, 'yyyy-MM-dd')
              const dayEvents = visible.filter((e) => e.date === iso)
              const wd = getISODay(d)
              const sched = scheduleForDate(iso, slots, changes)
              const lessons = activeLessons(sched).length
              const cancelled = sched.filter((e) => e.status === 'cancelled').length
              const subst = sched.filter((e) => e.status === 'substitution').length
              const dayOff = changes.find((c) => c.date === iso && c.kind === 'odpada' && c.lessonNumber == null)
              const holiday = holidayName(iso)
              const weekend = wd >= 6
              const dayBg = holiday ? 'bg-rose-50' : weekend ? 'bg-amber-50/70' : ''
              return (
                <div key={iso} className={`min-h-24 border-b border-r border-slate-100 p-1 text-xs ${isSameMonth(d, month) ? dayBg : 'bg-slate-50 text-slate-400'} ${iso === today ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                  onDoubleClick={() => setDraft(emptyDraft(iso))}>
                  <div className="flex justify-between">
                    <span className={`font-semibold ${iso === today ? 'text-blue-700' : holiday ? 'text-rose-700' : weekend && isSameMonth(d, month) ? 'text-amber-700' : ''}`}>{d.getDate()}</span>
                    {wd <= 5 && !holiday && (lessons > 0 || cancelled > 0) && <span className="text-slate-400" title={`${lessons} hodin${cancelled ? `, ${cancelled} odpadá` : ''}${subst ? `, ${subst} suplování` : ''}`}>{lessons} h{cancelled ? <span className="text-red-500"> −{cancelled}</span> : ''}{subst ? <span className="text-amber-600"> +{subst}</span> : ''}</span>}
                  </div>
                  {holiday && <div className="mt-0.5 truncate rounded bg-rose-100 px-1 py-0.5 text-rose-800" title={holiday}>{holiday}</div>}
                  {dayOff && <div className="mt-0.5 truncate rounded bg-red-100 px-1 py-0.5 text-red-800" title={dayOff.note}>odpadá: {dayOff.note || 'celý den'}</div>}
                  {dayEvents.map((e) => (
                    <button key={e.id} onClick={() => setDraft({ ...e })}
                      className={`mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left ${EVENT_KINDS[e.kind].color} ${e.done ? 'line-through opacity-60' : ''}`} title={e.title}>
                      {e.timeFrom && <span className="opacity-70">{e.timeFrom} </span>}{e.title}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="px-4 py-2 text-xs text-slate-400 flex flex-wrap gap-3"><span>Dvojklik na den = nová událost.</span><span><span className="inline-block h-3 w-3 rounded bg-amber-50 border border-amber-200 align-middle" /> víkend</span><span><span className="inline-block h-3 w-3 rounded bg-rose-100 border border-rose-200 align-middle" /> státní svátek</span></div>
        </div>
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-200 font-semibold">Nadcházející</div>
          <ul className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {upcoming.length === 0 && <li className="p-4 text-sm text-slate-500">Nic naplánováno.</li>}
            {upcoming.map((e) => (
              <li key={e.id} className="px-4 py-2 text-sm cursor-pointer hover:bg-slate-50" onClick={() => setDraft({ ...e })}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={e.done} onClick={(ev) => ev.stopPropagation()} onChange={() => db.events.update(e.id, { done: !e.done })} />
                  <span className={e.done ? 'line-through text-slate-400' : 'font-medium'}>{e.title}</span>
                </div>
                <div className="ml-6 text-xs text-slate-500">{fmtDate(e.date, 'EE d. M.')}{e.timeFrom ? ` ${e.timeFrom}` : ''} · <Badge className={EVENT_KINDS[e.kind].color}>{EVENT_KINDS[e.kind].label}</Badge> {contextName(e)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Upravit událost' : 'Nová událost'}>
        {draft && (
          <div className="space-y-3">
            <Field label="Název"><input className="input" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Typ">
                <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as EventKind })}>
                  {Object.entries(EVENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Datum"><input type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
              <Field label="Čas"><input type="time" className="input" value={draft.timeFrom ?? ''} onChange={(e) => setDraft({ ...draft, timeFrom: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Skupina">
                <select className="input" value={draft.groupId ?? ''} onChange={(e) => setDraft({ ...draft, groupId: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">—</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Třída">
                <select className="input" value={draft.classId ?? ''} onChange={(e) => setDraft({ ...draft, classId: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">—</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Předmět">
              <select className="input" value={draft.subjectId ?? ''} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">—</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Poznámka"><textarea className="input" rows={3} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.done} onChange={(e) => setDraft({ ...draft, done: e.target.checked })} /> Hotovo</label>
            <div className="flex justify-between pt-2">
              {draft.id ? <ConfirmButton onConfirm={async () => { await db.events.delete(draft.id!); setDraft(null) }}>Smazat</ConfirmButton> : <span />}
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setDraft(null)}>Zrušit</button>
                <button className="btn-primary" onClick={save}>Uložit</button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
