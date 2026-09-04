import { getISODay, parseISO } from 'date-fns'

/** Velikonoční neděle (gregoriánský kalendář, algoritmus Meeus/Jones/Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (d: Date, days: number) => { const x = new Date(d); x.setDate(x.getDate() + days); return x }

const FIXED: [string, string][] = [
  ['01-01', 'Nový rok, Den obnovy samostatného českého státu'],
  ['05-01', 'Svátek práce'],
  ['05-08', 'Den vítězství'],
  ['07-05', 'Den slovanských věrozvěstů Cyrila a Metoděje'],
  ['07-06', 'Den upálení mistra Jana Husa'],
  ['09-28', 'Den české státnosti'],
  ['10-28', 'Den vzniku samostatného československého státu'],
  ['11-17', 'Den boje za svobodu a demokracii'],
  ['12-24', 'Štědrý den'],
  ['12-25', '1. svátek vánoční'],
  ['12-26', '2. svátek vánoční'],
]

const cache = new Map<number, Map<string, string>>()

/** Mapa ISO datum → název státního svátku pro daný rok. */
export function czechHolidays(year: number): Map<string, string> {
  let m = cache.get(year)
  if (m) return m
  m = new Map(FIXED.map(([md, name]) => [`${year}-${md}`, name]))
  const easter = easterSunday(year)
  m.set(iso(shift(easter, -2)), 'Velký pátek')
  m.set(iso(shift(easter, 1)), 'Velikonoční pondělí')
  cache.set(year, m)
  return m
}

export function holidayName(dateISO: string): string | undefined {
  return czechHolidays(Number(dateISO.slice(0, 4))).get(dateISO)
}

export function isWeekend(dateISO: string): boolean {
  return getISODay(parseISO(dateISO)) >= 6
}

/** Den, kdy se neučí: víkend nebo státní svátek. */
export function isDayOff(dateISO: string): boolean {
  return isWeekend(dateISO) || !!holidayName(dateISO)
}
