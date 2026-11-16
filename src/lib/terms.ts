import { addDays, parseISO } from 'date-fns'
import type { Settings } from '../db/schema'
import { isoDate, todayISO } from './format'

export type Term = 1 | 2 | 0 // 0 = celý rok

/** Konec 1. pololetí: z nastavení, jinak 31. 1. roku, ve kterém končí školní rok. */
export function term1End(settings?: Settings): string {
  if (settings?.term1End) return settings.term1End
  const endYear = settings?.yearEnd?.slice(0, 4) ?? String(new Date().getFullYear())
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

/** Období pro report na třídní schůzky */
export type ReportPeriod = 'q1' | 'h1' | 'q3' | 'h2'
export const REPORT_PERIODS: ReportPeriod[] = ['q1', 'h1', 'q3', 'h2']
export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = { q1: '1. čtvrtletí', h1: '1. pololetí', q3: '3. čtvrtletí', h2: '2. pololetí' }

/** Konec 1. čtvrtletí: z nastavení, jinak 15. 11. */
export function q1End(settings?: Settings): string {
  return settings?.q1End || `${settings?.yearStart?.slice(0, 4) ?? new Date().getFullYear()}-11-15`
}
/** Konec 3. čtvrtletí: z nastavení, jinak 15. 4. */
export function q3End(settings?: Settings): string {
  return settings?.q3End || `${settings?.yearEnd?.slice(0, 4) ?? new Date().getFullYear()}-04-15`
}

/** Rozmezí dat období reportu (od, do včetně). Čtvrtletí = od začátku pololetí do konce čtvrtletí. */
export function periodRange(p: ReportPeriod, settings?: Settings): { from: string; to: string } {
  const h1 = termRange(1, settings), h2 = termRange(2, settings)
  if (p === 'q1') return { from: h1.from, to: q1End(settings) }
  if (p === 'h1') return h1
  if (p === 'q3') return { from: h2.from, to: q3End(settings) }
  return h2
}

/** Období, které se právě uzavírá (podle dnešního data) – výchozí volba reportu. */
export function currentReportPeriod(settings?: Settings): ReportPeriod {
  const t = todayISO()
  if (t <= q1End(settings)) return 'q1'
  if (t <= term1End(settings)) return 'h1'
  if (t <= q3End(settings)) return 'q3'
  return 'h2'
}
