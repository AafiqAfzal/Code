import { getISODay, parseISO } from 'date-fns'
import type { TimetableChange, TimetableSlot } from '../db/schema'
import { BREAK_RANGES, LESSON_RANGES } from './format'

export type ScheduleStatus = 'regular' | 'cancelled' | 'substitution'

/** Jedna položka skutečného rozvrhu pro konkrétní den. */
export interface ScheduleEntry {
  lessonNumber: number
  status: ScheduleStatus
  slot?: TimetableSlot
  change?: TimetableChange
  /** u zrušené hodiny důvod (poznámka změny) */
  reason?: string
  subjectId?: number
  groupId?: number
  classId?: number
  room?: string
  title?: string
  kind: 'hodina' | 'krouzek' | 'suplovani' | 'dozor'
  /** u dozoru čas (standardní přestávka nebo vlastní) */
  timeFrom?: string
  timeTo?: string
}

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
/** Dozor během hodiny (polední pauza): explicitně, nebo když vlastní čas zasahuje do hodiny. */
export function isDuringLesson(slot: Pick<TimetableSlot, 'kind' | 'lessonNumber' | 'timeFrom' | 'timeTo' | 'duringLesson'>): boolean {
  if (slot.kind !== 'dozor') return false
  if (slot.duringLesson != null) return slot.duringLesson
  const r = LESSON_RANGES[slot.lessonNumber]
  if (!r || !slot.timeFrom || !slot.timeTo) return false
  return mins(slot.timeTo) > mins(r[0]) + 5 && mins(slot.timeFrom) < mins(r[1])
}

/** Skutečný rozvrh pro dané datum = pravidelné hodiny − odpadlé + suplování. */
export function scheduleForDate(date: string, slots: TimetableSlot[], changes: TimetableChange[]): ScheduleEntry[] {
  const weekday = getISODay(parseISO(date))
  const dayChanges = changes.filter((c) => c.date === date)
  const wholeDay = dayChanges.find((c) => c.kind === 'odpada' && c.lessonNumber == null)
  const entries: ScheduleEntry[] = []
  for (const slot of slots.filter((s) => s.weekday === weekday)) {
    // výjimka „koná se“ ruší odpadnutí celého dne pro danou hodinu
    const keep = wholeDay && dayChanges.some((c) => c.kind === 'konase' && c.lessonNumber === slot.lessonNumber)
    // dozor ruší jen odpadnutí celého dne, ne odpadnutí jedné hodiny
    const cancel = keep ? undefined : wholeDay ?? (slot.kind === 'dozor' ? undefined : dayChanges.find((c) => c.kind === 'odpada' && c.lessonNumber === slot.lessonNumber))
    entries.push({
      lessonNumber: slot.lessonNumber, status: cancel ? 'cancelled' : 'regular', slot, change: cancel, reason: cancel?.note,
      subjectId: slot.subjectId, groupId: slot.groupId, classId: slot.classId, room: slot.room, title: slot.title, kind: slot.kind === 'krouzek' ? 'krouzek' : slot.kind === 'dozor' ? 'dozor' : 'hodina',
      timeFrom: slot.kind === 'dozor' ? slot.timeFrom || BREAK_RANGES[slot.lessonNumber]?.[0] : undefined,
      timeTo: slot.kind === 'dozor' ? slot.timeTo || BREAK_RANGES[slot.lessonNumber]?.[1] : undefined,
    })
  }
  for (const c of dayChanges.filter((c) => c.kind === 'suplovani')) {
    entries.push({ lessonNumber: c.lessonNumber ?? 0, status: 'substitution', change: c, subjectId: c.subjectId, groupId: c.groupId, classId: c.classId, room: c.room, title: c.title, kind: 'suplovani' })
  }
  // dozor před n-tou hodinou se řadí před ni
  const key = (e: ScheduleEntry) => e.lessonNumber - (e.kind === 'dozor' && !(e.slot && isDuringLesson(e.slot)) ? 0.5 : 0)
  return entries.sort((a, b) => key(a) - key(b))
}

/** Jen hodiny, které se skutečně odučí (bez dozorů). */
export const activeLessons = (entries: ScheduleEntry[]) => entries.filter((e) => e.status !== 'cancelled' && e.kind !== 'dozor')
/** Dozory daného dne (neodpadlé). */
export const activeDuties = (entries: ScheduleEntry[]) => entries.filter((e) => e.status !== 'cancelled' && e.kind === 'dozor')

export const CHANGE_REASONS = ['projektový den', 'třída na akci / exkurzi', 'nepřítomnost učitele', 'ředitelské volno', 'jiný důvod']
