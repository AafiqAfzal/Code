import ExcelJS from 'exceljs/dist/exceljs.min.js'
import JSZip from 'jszip'
import type { Settings, SchoolHoliday, TimetableChange, TimetableSlot, WorkDay } from '../db/schema'
import { holidayName, schoolHolidayName } from './holidays'
import { activeLessons, scheduleForDate } from './schedule'

export const WORK_CODES = ['D', 'Sa', 'Sv', 'L', 'OČR', 'DVPP'] as const
export const WORK_CODE_LABEL: Record<string, string> = { D: 'dovolená', Sa: 'samostudium', Sv: 'svátek', L: 'lékař', OČR: 'ošetřování člena rodiny', DVPP: 'další vzdělávání' }

export const pad = (n: number) => String(n).padStart(2, '0')
export const daysInMonth = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
export const dateOf = (month: string, day: number) => `${month}-${pad(day)}`

/** "7:30" → zlomek dne pro Excel (0.3125) */
export function timeToFraction(t?: string): number | undefined {
  const m = t?.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  return (Number(m[1]) * 60 + Number(m[2])) / 1440
}
/** "7:30" + 8 h → "15:30" */
export function addHours(t: string, hours: number): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return ''
  const total = Number(m[1]) * 60 + Number(m[2]) + Math.round(hours * 60)
  return `${Math.floor(total / 60) % 24}:${pad(total % 60)}`
}

/** Rozdíl dvou časů v hodinách ("7:30" → "16:00" = 8.5). */
export function hoursBetween(from: string, to: string): number {
  const a = timeToFraction(from); const b = timeToFraction(to)
  if (a == null || b == null) return 0
  return Math.max(0, Math.round((b - a) * 24 * 4) / 4)
}

export const DEFAULT_LUNCH_MINUTES = 30
/** Pracovní doba pro daný den v týdnu (1 = Po … 5 = Pá): přítomnost od–do a odpracované hodiny bez oběda. */
export function workdaySpan(settings: Settings | undefined, weekday: number): { start: string; end: string; hours: number; lunch: number } {
  const lunch = settings?.epdLunchMinutes ?? DEFAULT_LUNCH_MINUTES
  const wd = settings?.epdWeekdays?.[weekday - 1]
  if (wd?.start && wd?.end) {
    // přestávka na jídlo se podle § 88 zákoníku práce poskytuje až po 6 hodinách práce
    const span = hoursBetween(wd.start, wd.end)
    const dayLunch = span > 6 ? lunch : 0
    return { start: wd.start, end: wd.end, hours: Math.max(0, span - dayLunch / 60), lunch: dayLunch }
  }
  const start = settings?.epdStartTime || '7:30'
  const hours = settings?.epdDailyHours ?? 8
  return { start, end: addHours(start, hours + lunch / 60), hours, lunch }
}

export interface AutoFillInput {
  month: string
  slots: TimetableSlot[]
  changes: TimetableChange[]
  schoolHolidays: SchoolHoliday[]
  settings?: Settings
}

/** Je den pracovní (ne víkend, svátek ani prázdniny)? */
const isWorkingDay = (date: string, schoolHolidays: SchoolHoliday[]) => {
  const wd = new Date(date).getDay()
  return wd !== 0 && wd !== 6 && !holidayName(date) && !schoolHolidayName(date, schoolHolidays)
}

/** Co se daný den podle rozvrhu a výjimek skutečně odučilo */
function lessonsOn(date: string, slots: TimetableSlot[], changes: TimetableChange[]) {
  const active = activeLessons(scheduleForDate(date, slots, changes))
  const lessons = active.filter((e) => e.kind === 'hodina')
  const plus = lessons.filter((e) => e.slot?.overLoad).length // hodiny nad úvazek („+1“)
  const supl = active.filter((e) => e.kind === 'suplovani').length // suplování / hodina navíc
  const clubs = active.filter((e) => e.kind === 'krouzek')
  return { direct: lessons.length - plus + supl, plus, supl, clubs }
}

/** Kolik hodin by se ten den učilo v normálním týdnu (pravidelný rozvrh, bez výjimek) */
function normalLessonsOn(date: string, slots: TimetableSlot[]) {
  const wd = new Date(date).getDay()
  return slots.filter((s) => s.weekday === wd && (s.kind ?? 'hodina') === 'hodina').length
}

/**
 * Vyplní dny měsíce podle rozvrhu, svátků a prázdnin. Víkendy zůstanou prázdné.
 * Přímá práce = odučené hodiny včetně suplování („5+1“ = hodina nad úvazek).
 * Přespočetné hodiny se vyrovnávají za týden: jen to, o co týden přesáhl normální týden
 * (odpadlá hodina a suplování ve stejném týdnu se vyruší); připíšou se ke dnům se suplováním.
 */
export function autoFillMonth({ month, slots, changes, schoolHolidays, settings }: AutoFillInput): Record<number, WorkDay> {
  const vacationCode = settings?.epdVacationCode ?? 'Sa'
  const out: Record<number, WorkDay> = {}
  // přespočetné hodiny po týdnech (týden může zasahovat do sousedního měsíce)
  const extraByDate = new Map<string, number>()
  const weekDone = new Set<string>()
  const weekOf = (date: string) => { const d = new Date(date + 'T12:00:00'); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d }
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  for (let d = 1; d <= daysInMonth(month); d++) {
    const mon = weekOf(dateOf(month, d)); const key = iso(mon)
    if (weekDone.has(key)) continue
    weekDone.add(key)
    const days = Array.from({ length: 5 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return iso(x) }).filter((x) => isWorkingDay(x, schoolHolidays))
    const normal = days.reduce((n, x) => n + normalLessonsOn(x, slots), 0)
    const actual = days.map((x) => ({ date: x, ...lessonsOn(x, slots, changes) }))
    let over = Math.max(0, actual.reduce((n, a) => n + a.direct + a.plus, 0) - normal)
    // od konce týdne: přebytek vzniká až tím, co se odučilo navíc
    for (const a of [...actual].reverse()) {
      if (!over) break
      const k = Math.min(over, a.supl)
      if (k) { extraByDate.set(a.date, k); over -= k }
    }
  }
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = dateOf(month, d)
    const wd = new Date(date).getDay() // 0 = neděle
    if (wd === 0 || wd === 6) { out[d] = {}; continue }
    if (holidayName(date)) { out[d] = { code: 'Sv' }; continue }
    if (schoolHolidayName(date, schoolHolidays)) { out[d] = vacationCode ? { code: vacationCode } : {}; continue }
    const { start, end, hours: daily } = workdaySpan(settings, wd)
    const { direct, plus, clubs } = lessonsOn(date, slots, changes)
    const extra = extraByDate.get(date) ?? 0
    const dayOff = changes.find((c) => c.date === date && c.kind === 'odpada' && c.lessonNumber == null)
    // související (nepřímá) práce = odpracováno − přímá (vč. suplování) − nad úvazek − kroužky (konverzace)
    const day: WorkDay = { start, direct, related: Math.max(0, daily - direct - plus - clubs.length), end }
    if (plus) day.directPlus = plus
    if (extra) day.extra = extra
    if (clubs.length) { day.activityHours = clubs.length; day.activityName = clubs.map((c) => c.title || 'kroužek').join(', ') }
    if (dayOff?.note && /dvpp|školení|seminář/i.test(dayOff.note)) day.code = 'DVPP'
    out[d] = day
  }
  return out
}

/** Odpracované hodiny dne = přímá (vč. suplování, + nad úvazek) + související + kroužky; přespočetné jsou jen informace, kolik z přímé je navíc */
export function dayWorked(d: WorkDay): number {
  return (d.direct ?? 0) + (d.directPlus ?? 0) + (d.related ?? 0) + (d.activityHours ?? 0)
}

/** Přímá práce, jak se píše do výkazu: „5“ nebo „5+1“ */
export function directLabel(direct?: number, plus?: number): string {
  if (direct == null && !plus) return ''
  return plus ? `${direct ?? 0}+${plus}` : String(direct)
}

/** „5+1“ / „5“ / „4,5“ → { direct, plus } (undefined = nevyplněno) */
export function parseDirect(text: string): { direct?: number; plus?: number } | null {
  const m = text.trim().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)?\s*(?:\+\s*(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  return { direct: m[1] != null ? Number(m[1]) : undefined, plus: m[2] != null ? Number(m[2]) : undefined }
}

export function monthTotals(days: Record<number, WorkDay>) {
  const t = { direct: 0, directPlus: 0, related: 0, extra: 0, worked: 0, overtime: 0, activity: 0, codes: {} as Record<string, number>, workedDays: 0 }
  for (const d of Object.values(days)) {
    t.direct += d.direct ?? 0; t.directPlus += d.directPlus ?? 0; t.related += d.related ?? 0; t.extra += d.extra ?? 0; t.overtime += d.overtime ?? 0; t.activity += d.activityHours ?? 0
    t.worked += dayWorked(d)
    if (d.code) t.codes[d.code] = (t.codes[d.code] ?? 0) + 1
    if (dayWorked(d) > 0) t.workedDays++
  }
  return t
}

export interface FillHeader { month: string; name: string; position: string; personalNumber: string; workload: string }

/** Vyplní školní šablonu (xlsx) – zachová formátování, vzorce a tiskové nastavení. */
export async function fillTemplate(template: Blob, header: FillHeader, days: Record<number, WorkDay>): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await template.arrayBuffer())
  const ws = wb.worksheets[0]
  const [y, m] = header.month.split('-').map(Number)
  ws.getCell('C3').value = header.name || null
  ws.getCell('K3').value = header.position || null
  ws.getCell('C4').value = new Date(Date.UTC(y, m - 1, 1))
  ws.getCell('G4').value = header.workload || null
  ws.getCell('C5').value = header.personalNumber || null
  const set = (addr: string, v: string | number | undefined | null) => { ws.getCell(addr).value = v == null || v === '' ? null : v }
  for (let d = 1; d <= 31; d++) {
    const day = days[d] ?? {}
    // levý blok: dny 1–15 v řádcích 9–23; pravý blok: dny 16–31 v řádcích 4–19
    const left = d <= 15
    const r = left ? d + 8 : d - 12
    const col = (l: string, rgt: string) => (left ? l : rgt) + r
    set(col('B', 'R'), timeToFraction(day.start))
    set(col('C', 'S'), day.directPlus ? (day.direct ?? 0) + day.directPlus : day.direct)
    // „5+1“: v buňce je součet (aby seděly vzorce šablony), zobrazí se ale jako 5+1
    // styl buňky je v šabloně sdílený s dalšími buňkami – změnit jen kopii pro tuto buňku
    if (day.directPlus) { const c = ws.getCell(col('C', 'S')); c.style = { ...c.style, numFmt: `"${directLabel(day.direct, day.directPlus)}"` } }
    set(col('D', 'T'), day.related)
    set(col('F', 'W'), day.extra)
    set(col('G', 'X'), timeToFraction(day.end))
    set(col('H', 'Y'), day.code ? (day.codeNote ? `${day.code} ${day.codeNote}` : day.code) : null)
    set(col('K', 'AB'), day.overtime)
    set(col('L', 'AC'), day.activityHours)
    set(col('M', 'AD'), day.activityName)
    set(col('N', 'AE'), day.webinar)
  }
  wb.calcProperties.fullCalcOnLoad = true
  const buf = await wb.xlsx.writeBuffer()
  const fixed = await restorePrintArea(template, buf)
  return new Blob([fixed], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * ExcelJS zachová jen první oblast tisku; školní šablona má dvě (dny 1–15 a 16–31).
 * Přeneseme proto definici Print_Area ze šablony do výstupu beze změny.
 */
async function restorePrintArea(template: Blob, output: ArrayBuffer): Promise<ArrayBuffer> {
  const re = /<definedName name="_xlnm\.Print_Area"[^>]*>[^<]*<\/definedName>/g
  const src = await JSZip.loadAsync(await template.arrayBuffer())
  const original = (await src.file('xl/workbook.xml')?.async('string'))?.match(re)?.[0]
  if (!original) return output
  const zip = await JSZip.loadAsync(output)
  const wbXml = await zip.file('xl/workbook.xml')?.async('string')
  if (!wbXml) return output
  let out = wbXml.replace(re, '')
  if (/<definedNames>/.test(out)) out = out.replace('<definedNames>', `<definedNames>${original}`)
  else if (/<definedNames\/>/.test(out)) out = out.replace('<definedNames/>', `<definedNames>${original}</definedNames>`)
  else out = out.replace('</workbook>', `<definedNames>${original}</definedNames></workbook>`)
  zip.file('xl/workbook.xml', out)
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
