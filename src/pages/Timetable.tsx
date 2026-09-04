import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, addWeeks, format, startOfWeek } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, FileJson, Sparkles } from 'lucide-react'
import { db, type ChangeKind, type TimetableChange, type TimetableSlot } from '../db/schema'
import { useClasses, useGroups, useSettings, useSubjects } from '../components/hooks'
import { ConfirmButton, Field, Modal, PageHeader } from '../components/ui'
import { LESSON_NUMBERS, WEEKDAYS, fmtDate, lessonRange } from '../lib/format'
import { importTimetableFile, readJsonFile, type TimetableFile } from '../db/seed'
import { CHANGE_REASONS, scheduleForDate, type ScheduleEntry } from '../lib/schedule'
import { holidayName, schoolHolidayName } from '../lib/holidays'

type SlotDraft = Omit<TimetableSlot, 'id'> & { id?: number }
type ChangeDraft = Omit<TimetableChange, 'id'> & { id?: number }

export function TimetablePage() {
  const navigate = useNavigate()
  const settings = useSettings()
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const changes = useLiveQuery(() => db.timetableChanges.toArray(), []) ?? []
  const schoolHolidays = useLiveQuery(() => db.schoolHolidays.toArray(), []) ?? []
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null)
  const [changeDraft, setChangeDraft] = useState<ChangeDraft | null>(null)
  const [pick, setPick] = useState<{ date: string; lessonNumber: number; entry?: ScheduleEntry } | null>(null)
  const [msg, setMsg] = useState('')
  const days = useMemo(() => WEEKDAYS.map((name, i) => ({ name, date: format(addDays(weekStart, i), 'yyyy-MM-dd') })), [weekStart])
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekLogs = useLiveQuery(() => db.lessonLogs.where('date').between(days[0].date, days[4].date, true, true).toArray(), [days[0].date]) ?? []
  const logFor = (date: string, e?: ScheduleEntry) => e && weekLogs.find((l) => l.date === date && (e.groupId ? l.groupId === e.groupId : e.classId ? l.classId === e.classId : false) && (l.lessonNumber == null || l.lessonNumber === e.lessonNumber))
  const logLesson = (date: string, e: ScheduleEntry) => navigate(`/zapisy?groupId=${e.groupId ?? ''}&classId=${e.classId ?? ''}&subjectId=${e.subjectId ?? settings?.defaultSubjectId ?? ''}&lesson=${e.lessonNumber}&date=${date}`)

  const gName = (e: { groupId?: number; classId?: number }) => groups.find((g) => g.id === e.groupId)?.name ?? classes.find((c) => c.id === e.classId)?.name ?? ''
  const sAbbr = (id?: number) => subjects.find((s) => s.id === id)?.abbreviation ?? ''
  const gColor = (id?: number) => groups.find((g) => g.id === id)?.color

  const saveSlot = async () => {
    if (!slotDraft) return
    const { id, ...data } = slotDraft
    if (id) await db.timetable.update(id, data); else await db.timetable.add(data)
    setSlotDraft(null)
  }
  const saveChange = async () => {
    if (!changeDraft) return
    const { id, ...data } = changeDraft
    if (id) await db.timetableChanges.update(id, data); else await db.timetableChanges.add(data)
    setChangeDraft(null)
  }
  const newSlot = (weekday: number, lessonNumber: number, kind: 'hodina' | 'krouzek' = 'hodina'): SlotDraft => ({ weekday, lessonNumber, subjectId: subjects[0]?.id, kind, title: kind === 'krouzek' ? 'Kroužek' : undefined })
  const newChange = (date: string, kind: ChangeKind, lessonNumber?: number): ChangeDraft => ({ date, kind, lessonNumber, subjectId: kind === 'suplovani' ? subjects[0]?.id : undefined, note: kind === 'odpada' ? CHANGE_REASONS[0] : '' })

  const cellClass = (e?: ScheduleEntry) => {
    if (!e) return 'border-dashed border-slate-200 hover:bg-slate-50'
    if (e.status === 'cancelled') return 'border-slate-200 bg-slate-100 text-slate-400 line-through'
    if (e.status === 'substitution') return 'border-amber-400 bg-amber-100 text-amber-900'
    if (e.kind === 'krouzek') return 'border-transparent bg-purple-600 text-white'
    return 'border-transparent text-white'
  }

  return (
    <div>
      <PageHeader title="Rozvrh" subtitle="Klikněte na políčko: pravidelná hodina, kroužek, odpadnutí nebo suplování v daný den" actions={
        <label className="btn-secondary"><FileJson size={16} /> Nahrát rozvrh ze souboru (JSON)
          <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (!confirm('Nahrání přepíše současný pravidelný rozvrh. Pokračovat?')) { e.target.value = ''; return } try { const n = await importTimetableFile(await readJsonFile<TimetableFile>(f)); setMsg(`Nahráno ${n} hodin.`) } catch (err) { setMsg((err as Error).message) } e.target.value = '' }} />
        </label>
      } />
      {msg && <p className="mb-3 text-sm text-green-700">{msg}</p>}
      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
          <button className="btn-ghost btn-sm" onClick={() => setWeekStart(addWeeks(weekStart, -1))}><ChevronLeft size={16} /></button>
          <div className="text-sm font-semibold">Týden {fmtDate(days[0].date, 'd. M.')} – {fmtDate(days[4].date, 'd. M. yyyy')}</div>
          <div className="flex gap-1"><button className="btn-secondary btn-sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Tento týden</button><button className="btn-ghost btn-sm" onClick={() => setWeekStart(addWeeks(weekStart, 1))}><ChevronRight size={16} /></button></div>
        </div>
        <table className="table text-center">
          <thead><tr><th className="text-left">Den</th>{LESSON_NUMBERS.map((l) => <th key={l} className="text-center whitespace-nowrap min-w-24">{l}. hodina<div className="font-normal normal-case text-[11px] text-slate-500">{lessonRange(l)}</div></th>)}<th></th></tr></thead>
          <tbody>
            {days.map(({ name, date }) => {
              const entries = scheduleForDate(date, slots, changes)
              const wholeDay = changes.find((c) => c.date === date && c.kind === 'odpada' && c.lessonNumber == null)
              const holiday = holidayName(date)
              const vacation = schoolHolidayName(date, schoolHolidays)
              return (
                <tr key={date} className={holiday ? 'bg-rose-50' : vacation ? 'bg-emerald-50' : date === today ? 'bg-blue-50/60' : ''}>
                  <td className="text-left align-top pt-2">
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-slate-500">{fmtDate(date, 'd. M.')}</div>
                    {holiday && <div className="mt-1 text-[11px] text-rose-700">svátek: {holiday}</div>}
                    {vacation && !holiday && <div className="mt-1 text-[11px] text-emerald-700">{vacation}</div>}
                    {wholeDay && <div className="mt-1 text-[11px] text-red-700">odpadá: {wholeDay.note || 'celý den'}</div>}
                  </td>
                  {LESSON_NUMBERS.map((l) => {
                    const es = entries.filter((e) => e.lessonNumber === l)
                    const e = es.find((x) => x.status !== 'cancelled') ?? es[0]
                    return (
                      <td key={l} className="p-0.5 align-top">
                        <button onClick={() => setPick({ date, lessonNumber: l, entry: e })}
                          className={`h-16 w-full rounded border text-xs ${cellClass(e)} ${holiday || vacation ? 'opacity-40' : ''}`} style={e && e.status === 'regular' && e.kind === 'hodina' ? { background: gColor(e.groupId) ?? '#2563eb' } : undefined}
                          title={e?.reason ? `Odpadá: ${e.reason}` : e?.change?.note}>
                          {e && (
                            <>
                              <div className="font-bold">{e.kind === 'krouzek' ? (e.title || 'Kroužek') : e.status === 'substitution' ? `Supl. ${sAbbr(e.subjectId)}` : sAbbr(e.subjectId)}</div>
                              <div className="truncate px-1">{gName(e) || e.title || ''}</div>
                              {e.room && <div className="opacity-80">uč. {e.room}</div>}
                              {logFor(date, e) && e.status !== 'cancelled' && <div className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-white/80 px-1 text-[10px] text-green-700" title={logFor(date, e)!.topic}><Check size={10} /> zapsáno</div>}
                              {es.length > 1 && <div className="text-[10px] text-amber-700 no-underline">+ supl.</div>}
                            </>
                          )}
                        </button>
                      </td>
                    )
                  })}
                  <td className="align-top pt-2 no-print">
                    {wholeDay ? <ConfirmButton className="btn-secondary btn-sm" confirmLabel="Obnovit?" onConfirm={() => db.timetableChanges.delete(wholeDay.id)}>Obnovit den</ConfirmButton>
                      : <button className="btn-ghost btn-sm text-red-700" title="Projektový den, nepřítomnost…" onClick={() => setChangeDraft(newChange(date, 'odpada'))}>Celý den odpadá</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4 py-2 text-xs text-slate-500 flex flex-wrap gap-3">
          <span><span className="inline-block h-3 w-3 rounded bg-blue-600 align-middle" /> pravidelná hodina</span>
          <span><span className="inline-block h-3 w-3 rounded bg-purple-600 align-middle" /> kroužek</span>
          <span><span className="inline-block h-3 w-3 rounded bg-amber-200 border border-amber-400 align-middle" /> suplování (jen tento den)</span>
          <span><span className="inline-block h-3 w-3 rounded bg-slate-200 align-middle" /> odpadá</span>
        </div>
      </div>

      {/* Výběr akce pro políčko */}
      <Modal open={!!pick} onClose={() => setPick(null)} title={pick ? `${WEEKDAYS[days.findIndex((d) => d.date === pick.date)]} ${fmtDate(pick.date)} · ${pick.lessonNumber}. hodina (${lessonRange(pick.lessonNumber)})` : ''}>
        {pick && (
          <div className="space-y-2 text-sm">
            {pick.entry && pick.entry.status !== 'cancelled' && (pick.entry.groupId || pick.entry.classId) && (
              logFor(pick.date, pick.entry)
                ? <button className="btn-secondary w-full justify-start" onClick={() => { navigate('/zapisy'); setPick(null) }}><Check size={14} /> Hodina je zapsána: {logFor(pick.date, pick.entry)!.topic}</button>
                : <button className="btn-primary w-full justify-start" onClick={() => { logLesson(pick.date, pick.entry!); setPick(null) }}>Zapsat hodinu ({fmtDate(pick.date, 'd. M.')})</button>
            )}
            {pick.entry && pick.entry.status === 'regular' && (
              <>
                <p className="text-slate-600">Pravidelně: <b>{pick.entry.kind === 'krouzek' ? pick.entry.title : sAbbr(pick.entry.subjectId)}</b> {gName(pick.entry)}</p>
                <button className="btn-secondary w-full justify-start" onClick={() => { setChangeDraft(newChange(pick.date, 'odpada', pick.lessonNumber)); setPick(null) }}>Tento den odpadá</button>
                <button className="btn-secondary w-full justify-start" onClick={() => { setSlotDraft({ ...pick.entry!.slot! }); setPick(null) }}>Upravit pravidelnou hodinu (každý týden)</button>
                <ConfirmButton className="btn-secondary w-full justify-start text-red-700" confirmLabel="Opravdu odebrat z každého týdne?" onConfirm={async () => { await db.timetable.delete(pick.entry!.slot!.id); setPick(null) }}>Odebrat z pravidelného rozvrhu</ConfirmButton>
              </>
            )}
            {pick.entry && pick.entry.status === 'cancelled' && (
              <>
                <p className="text-slate-600">Hodina tento den odpadá{pick.entry.reason ? ` (${pick.entry.reason})` : ''}.</p>
                {pick.entry.change?.lessonNumber != null ? <button className="btn-primary w-full justify-start" onClick={async () => { await db.timetableChanges.delete(pick.entry!.change!.id); setPick(null) }}>Obnovit hodinu</button> : <p className="text-xs text-slate-500">Odpadá celý den – obnovte jej tlačítkem „Obnovit den“ v řádku.</p>}
              </>
            )}
            {pick.entry && pick.entry.status === 'substitution' && (
              <>
                <p className="text-slate-600">Suplování: <b>{sAbbr(pick.entry.subjectId)}</b> {gName(pick.entry)}{pick.entry.change?.note ? ` · ${pick.entry.change.note}` : ''}</p>
                <button className="btn-secondary w-full justify-start" onClick={() => { setChangeDraft({ ...pick.entry!.change! }); setPick(null) }}>Upravit suplování</button>
                <ConfirmButton className="btn-secondary w-full justify-start text-red-700" onConfirm={async () => { await db.timetableChanges.delete(pick.entry!.change!.id); setPick(null) }}>Zrušit suplování</ConfirmButton>
              </>
            )}
            <div className="border-t border-slate-200 pt-2 space-y-2">
              <button className="btn-secondary w-full justify-start" onClick={() => { setChangeDraft(newChange(pick.date, 'suplovani', pick.lessonNumber)); setPick(null) }}>Přidat suplování jen {fmtDate(pick.date, 'd. M.')}</button>
              {!pick.entry && (
                <>
                  <button className="btn-secondary w-full justify-start" onClick={() => { setSlotDraft(newSlot(days.findIndex((d) => d.date === pick.date) + 1, pick.lessonNumber)); setPick(null) }}>Přidat pravidelnou hodinu (každý týden)</button>
                  <button className="btn-secondary w-full justify-start" onClick={() => { setSlotDraft(newSlot(days.findIndex((d) => d.date === pick.date) + 1, pick.lessonNumber, 'krouzek')); setPick(null) }}><Sparkles size={14} /> Přidat kroužek (každý týden)</button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Pravidelná hodina / kroužek */}
      <Modal open={!!slotDraft} onClose={() => setSlotDraft(null)} title={slotDraft ? `${slotDraft.kind === 'krouzek' ? 'Kroužek' : 'Pravidelná hodina'} – ${WEEKDAYS[slotDraft.weekday - 1]}, ${slotDraft.lessonNumber}. hodina` : ''}>
        {slotDraft && (
          <div className="space-y-3">
            <Field label="Typ">
              <select className="input" value={slotDraft.kind ?? 'hodina'} onChange={(e) => setSlotDraft({ ...slotDraft, kind: e.target.value as 'hodina' | 'krouzek' })}><option value="hodina">Vyučovací hodina</option><option value="krouzek">Kroužek</option></select>
            </Field>
            {slotDraft.kind === 'krouzek' && <Field label="Název kroužku"><input className="input" autoFocus value={slotDraft.title ?? ''} onChange={(e) => setSlotDraft({ ...slotDraft, title: e.target.value })} placeholder="např. Konverzace v angličtině" /></Field>}
            <Field label="Předmět"><select className="input" value={slotDraft.subjectId ?? ''} onChange={(e) => setSlotDraft({ ...slotDraft, subjectId: Number(e.target.value) || undefined })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label={slotDraft.kind === 'krouzek' ? 'Skupina (členové kroužku)' : 'Skupina / třída'}>
              <select className="input" value={slotDraft.groupId ? `g${slotDraft.groupId}` : slotDraft.classId ? `c${slotDraft.classId}` : ''} onChange={(e) => { const v = e.target.value; setSlotDraft({ ...slotDraft, groupId: v.startsWith('g') ? Number(v.slice(1)) : undefined, classId: v.startsWith('c') ? Number(v.slice(1)) : undefined }) }}>
                <option value="">—</option>
                <optgroup label="Skupiny">{groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
                <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
              </select>
              {slotDraft.kind === 'krouzek' && <p className="mt-1 text-xs text-slate-500">Skupinu kroužku napříč ročníky založíte v Třídy a skupiny → „Nový kroužek“. Pak půjde zapisovat docházku i zápisy z hodin.</p>}
            </Field>
            <Field label="Učebna"><input className="input" value={slotDraft.room ?? ''} onChange={(e) => setSlotDraft({ ...slotDraft, room: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveSlot()} /></Field>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setSlotDraft(null)}>Zrušit</button><button className="btn-primary" onClick={saveSlot}>Uložit</button></div>
          </div>
        )}
      </Modal>

      {/* Změna v konkrétní den */}
      <Modal open={!!changeDraft} onClose={() => setChangeDraft(null)} title={changeDraft ? (changeDraft.kind === 'odpada' ? `Odpadá – ${fmtDate(changeDraft.date)}${changeDraft.lessonNumber ? `, ${changeDraft.lessonNumber}. hodina` : ' (celý den)'}` : `Suplování – ${fmtDate(changeDraft.date)}`) : ''}>
        {changeDraft && (
          <div className="space-y-3">
            {changeDraft.kind === 'odpada' ? (
              <Field label="Důvod">
                <input className="input" list="reasons" autoFocus value={changeDraft.note ?? ''} onChange={(e) => setChangeDraft({ ...changeDraft, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveChange()} />
                <datalist id="reasons">{CHANGE_REASONS.map((r) => <option key={r} value={r} />)}</datalist>
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hodina"><select className="input" value={changeDraft.lessonNumber ?? 1} onChange={(e) => setChangeDraft({ ...changeDraft, lessonNumber: Number(e.target.value) })}>{LESSON_NUMBERS.map((l) => <option key={l} value={l}>{l}. ({lessonRange(l)})</option>)}</select></Field>
                  <Field label="Předmět"><select className="input" value={changeDraft.subjectId ?? ''} onChange={(e) => setChangeDraft({ ...changeDraft, subjectId: Number(e.target.value) || undefined })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                </div>
                <Field label="Třída / skupina">
                  <select className="input" value={changeDraft.groupId ? `g${changeDraft.groupId}` : changeDraft.classId ? `c${changeDraft.classId}` : ''} onChange={(e) => { const v = e.target.value; setChangeDraft({ ...changeDraft, groupId: v.startsWith('g') ? Number(v.slice(1)) : undefined, classId: v.startsWith('c') ? Number(v.slice(1)) : undefined }) }}>
                    <option value="">—</option>
                    <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
                    <optgroup label="Skupiny">{groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Učebna"><input className="input" value={changeDraft.room ?? ''} onChange={(e) => setChangeDraft({ ...changeDraft, room: e.target.value })} /></Field>
                  <Field label="Poznámka (za koho, téma…)"><input className="input" value={changeDraft.note ?? ''} onChange={(e) => setChangeDraft({ ...changeDraft, note: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveChange()} /></Field>
                </div>
              </>
            )}
            <div className="flex justify-between">
              {changeDraft.id ? <ConfirmButton onConfirm={async () => { await db.timetableChanges.delete(changeDraft.id!); setChangeDraft(null) }}>Smazat</ConfirmButton> : <span />}
              <div className="flex gap-2"><button className="btn-secondary" onClick={() => setChangeDraft(null)}>Zrušit</button><button className="btn-primary" onClick={saveChange}>Uložit</button></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
