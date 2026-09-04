import { getISODay, parseISO } from 'date-fns'
import type { TimetableChange, TimetableSlot } from '../db/schema'

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
  kind: 'hodina' | 'krouzek' | 'suplovani'
}

/** Skutečný rozvrh pro dané datum = pravidelné hodiny − odpadlé + suplování. */
export function scheduleForDate(date: string, slots: TimetableSlot[], changes: TimetableChange[]): ScheduleEntry[] {
  const weekday = getISODay(parseISO(date))
  const dayChanges = changes.filter((c) => c.date === date)
  const wholeDay = dayChanges.find((c) => c.kind === 'odpada' && c.lessonNumber == null)
  const entries: ScheduleEntry[] = []
  for (const slot of slots.filter((s) => s.weekday === weekday)) {
    const cancel = wholeDay ?? dayChanges.find((c) => c.kind === 'odpada' && c.lessonNumber === slot.lessonNumber)
    entries.push({
      lessonNumber: slot.lessonNumber, status: cancel ? 'cancelled' : 'regular', slot, change: cancel, reason: cancel?.note,
      subjectId: slot.subjectId, groupId: slot.groupId, classId: slot.classId, room: slot.room, title: slot.title, kind: slot.kind === 'krouzek' ? 'krouzek' : 'hodina',
    })
  }
  for (const c of dayChanges.filter((c) => c.kind === 'suplovani')) {
    entries.push({ lessonNumber: c.lessonNumber ?? 0, status: 'substitution', change: c, subjectId: c.subjectId, groupId: c.groupId, classId: c.classId, room: c.room, title: c.title, kind: 'suplovani' })
  }
  return entries.sort((a, b) => a.lessonNumber - b.lessonNumber)
}

/** Jen hodiny, které se skutečně odučí. */
export const activeLessons = (entries: ScheduleEntry[]) => entries.filter((e) => e.status !== 'cancelled')

export const CHANGE_REASONS = ['projektový den', 'třída na akci / exkurzi', 'nepřítomnost učitele', 'ředitelské volno', 'jiný důvod']
