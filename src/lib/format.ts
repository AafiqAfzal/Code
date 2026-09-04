import { format, parseISO, isValid } from 'date-fns'
import { cs } from 'date-fns/locale'
import type { Student } from '../db/schema'

export function fmtDate(iso?: string, pattern = 'd. M. yyyy') {
  if (!iso) return ''
  const d = parseISO(iso)
  return isValid(d) ? format(d, pattern, { locale: cs }) : iso
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function fullName(s: Pick<Student, 'firstName' | 'lastName'>) {
  return `${s.lastName} ${s.firstName}`.trim()
}

export const collator = new Intl.Collator('cs')
export function byName(a: Student, b: Student) {
  return collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
}

export const WEEKDAYS = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek']
export const WEEKDAYS_SHORT = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
export const MONTHS = ['září', 'říjen', 'listopad', 'prosinec', 'leden', 'únor', 'březen', 'duben', 'květen', 'červen']

export const EVENT_KINDS: Record<string, { label: string; color: string }> = {
  test: { label: 'Test', color: 'bg-red-100 text-red-800' },
  pisemka: { label: 'Písemka', color: 'bg-orange-100 text-orange-800' },
  schuzka: { label: 'Schůzka', color: 'bg-blue-100 text-blue-800' },
  porada: { label: 'Porada', color: 'bg-purple-100 text-purple-800' },
  akce: { label: 'Akce / exkurze', color: 'bg-green-100 text-green-800' },
  ukol: { label: 'Úkol / termín', color: 'bg-yellow-100 text-yellow-800' },
  jine: { label: 'Jiné', color: 'bg-slate-100 text-slate-700' },
}

export const NOTE_KINDS: Record<string, { label: string; color: string }> = {
  poznamka: { label: 'Poznámka', color: 'bg-slate-100 text-slate-700' },
  pochvala: { label: 'Pochvala', color: 'bg-green-100 text-green-800' },
  napomenuti: { label: 'Napomenutí', color: 'bg-red-100 text-red-800' },
  rodice: { label: 'Komunikace s rodiči', color: 'bg-blue-100 text-blue-800' },
  podpora: { label: 'Podpůrná opatření', color: 'bg-purple-100 text-purple-800' },
}

/** Rozmezí hodin – index = číslo hodiny (1.–9. hodina; index 0 se nepoužívá). */
export const LESSON_RANGES: (readonly [string, string] | null)[] = [
  null,
  ['8:00', '8:45'], ['8:50', '9:35'], ['9:50', '10:35'], ['10:45', '11:30'], ['11:40', '12:25'],
  ['12:35', '13:20'], ['13:30', '14:15'], ['14:25', '15:10'], ['15:20', '16:05'],
]
export const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
/** Začátek hodiny, např. "8:00". */
export const LESSON_TIMES = LESSON_RANGES.map((r) => r?.[0] ?? '')
/** Celé rozmezí, např. "8:00–8:45". */
export const lessonRange = (n: number) => { const r = LESSON_RANGES[n]; return r ? `${r[0]}–${r[1]}` : '' }
