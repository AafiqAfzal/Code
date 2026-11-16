import { addDays, parseISO } from 'date-fns'
import type { Settings } from '../db/schema'
import { isoDate, todayISO } from './format'

export type Term = 1 | 2 | 0 // 0 = celý rok

/** Konec 1. pololetí: z nastavení, jinak 31. 1. roku, ve kterém končí školní rok. */
export function term1End(settings?: Settings): string {
  const start = settings?.yearStart || '', end = settings?.yearEnd || ''
  // uložené datum platí jen uvnitř školního roku (po přechodu na nový rok by jinak zůstalo loňské)
  if (settings?.term1End && (!start || settings.term1End > start) && (!end || settings.term1End < end)) return settings.term1End
  const endYear = end.slice(0, 4) || String(new Date().getFullYear())
  return `${endYear}-01-31`
}

/** Rozmezí dat pro pololetí (od, do včetně). */
export function termRange(term: Term, settings?: Settings): { from: string; to: string } {
  const from = settings?.yearStart ?? '2000-01-01'
  const to = settings?.yearEnd ?? '2100-12-31'
  if (term === 1) return { from, to: term1End(settings) }
  if (term === 2) {
    return { from: isoDate(addDays(parseISO(term1End(settings)), 1)), to }
  }
  return { from, to }
}

/** Aktuální pololetí podle dnešního data. */
export function currentTerm(settings?: Settings): 1 | 2 {
  return todayISO() <= term1End(settings) ? 1 : 2
}

export const TERM_LABEL: Record<Term, string> = { 1: '1. pololetí', 2: '2. pololetí', 0: 'celý rok' }

/** Pololetí, do kterého spadá datum (např. den sepsání reportu) */
export function termOf(date: string, settings?: Settings): 1 | 2 {
  return date <= term1End(settings) ? 1 : 2
}
