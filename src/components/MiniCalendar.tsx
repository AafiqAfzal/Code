import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, getISODay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { db, type EventKind } from '../db/schema'
import { fmtDate, todayISO } from '../lib/format'
import { holidayName, schoolHolidayName } from '../lib/holidays'

const DOT: Record<EventKind, string> = {
  test: 'bg-red-500', pisemka: 'bg-orange-500', schuzka: 'bg-blue-500', porada: 'bg-purple-500', akce: 'bg-green-500', ukol: 'bg-yellow-500', jine: 'bg-slate-400',
}

/** Malý měsíční kalendář v levém menu; klik na den otevře velký kalendář. */
export function MiniCalendar({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const today = todayISO()
  const from = format(startOfWeek(month, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const to = format(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const events = useLiveQuery(() => db.events.where('date').between(from, to, true, true).toArray(), [from, to]) ?? []
  const changes = useLiveQuery(() => db.timetableChanges.where('date').between(from, to, true, true).toArray(), [from, to]) ?? []
  const schoolHolidays = useLiveQuery(() => db.schoolHolidays.toArray(), []) ?? []
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month])
  const open = (date?: string) => { navigate(date ? `/kalendar?date=${date}` : `/kalendar?date=${format(month, 'yyyy-MM-dd')}`); onNavigate?.() }

  return (
    <div className="rounded-md bg-white text-slate-800 p-2 text-[11px] shadow-inner">
      <div className="flex items-center justify-between mb-1">
        <button className="rounded p-0.5 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, -1))} aria-label="Předchozí měsíc"><ChevronLeft size={14} /></button>
        <button className="font-semibold capitalize hover:underline" onClick={() => open()} title="Otevřít kalendář">{fmtDate(format(month, 'yyyy-MM-dd'), 'LLLL yyyy')}</button>
        <button className="rounded p-0.5 hover:bg-slate-100" onClick={() => setMonth(addMonths(month, 1))} aria-label="Další měsíc"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px] font-semibold text-slate-400">
        {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((d, i) => <div key={d} className={i >= 5 ? 'text-amber-600' : ''}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((d) => {
          const iso = format(d, 'yyyy-MM-dd')
          const inMonth = isSameMonth(d, month)
          const wd = getISODay(d)
          const holiday = holidayName(iso)
          const vacation = schoolHolidayName(iso, schoolHolidays)
          const kinds = Array.from(new Set(events.filter((e) => e.date === iso).map((e) => e.kind))).slice(0, 3)
          const dayOff = changes.some((c) => c.date === iso && c.kind === 'odpada')
          const subst = changes.some((c) => c.date === iso && c.kind === 'suplovani')
          const bg = !inMonth ? '' : holiday ? 'bg-rose-100' : vacation ? 'bg-emerald-100' : wd >= 6 ? 'bg-amber-50' : ''
          const title = [holiday, vacation, ...events.filter((e) => e.date === iso).map((e) => e.title), dayOff ? 'odpadá' : '', subst ? 'suplování' : ''].filter(Boolean).join(' · ')
          return (
            <button key={iso} onClick={() => open(iso)} title={title || fmtDate(iso)}
              className={`flex h-7 flex-col items-center justify-start rounded pt-0.5 leading-none ${bg} ${inMonth ? 'text-slate-800 hover:bg-blue-100' : 'text-slate-300'} ${iso === today ? 'ring-2 ring-inset ring-blue-500 font-bold' : ''}`}>
              <span className={holiday && inMonth ? 'text-rose-700' : ''}>{d.getDate()}</span>
              <span className="mt-0.5 flex gap-px">
                {kinds.map((k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />)}
                {dayOff && <span className="h-1.5 w-1.5 rounded-full border border-red-500" />}
                {subst && <span className="h-1.5 w-1.5 rounded-full border border-amber-500" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
