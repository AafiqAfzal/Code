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

export interface AutoFillInput {
  month: string
  slots: TimetableSlot[]
  changes: TimetableChange[]
  schoolHolidays: SchoolHoliday[]
  settings?: Settings
}

/** Vyplní dny měsíce podle rozvrhu, svátků a prázdnin. Víkendy zůstanou prázdné. */
export function autoFillMonth({ month, slots, changes, schoolHolidays, settings }: AutoFillInput): Record<number, WorkDay> {
  const start = settings?.epdStartTime || '7:30'
  const daily = settings?.epdDailyHours ?? 8
  const vacationCode = settings?.epdVacationCode ?? 'Sa'
  const out: Record<number, WorkDay> = {}
  for (let d = 1; d <= daysInMonth(month); d++) {
    const date = dateOf(month, d)
    const wd = new Date(date).getDay() // 0 = neděle
    if (wd === 0 || wd === 6) { out[d] = {}; continue }
    if (holidayName(date)) { out[d] = { code: 'Sv' }; continue }
    if (schoolHolidayName(date, schoolHolidays)) { out[d] = vacationCode ? { code: vacationCode } : {}; continue }
    const sched = scheduleForDate(date, slots, changes)
    const active = activeLessons(sched)
    const direct = active.filter((e) => e.kind === 'hodina').length
    const extra = active.filter((e) => e.kind === 'suplovani').length
    const clubs = active.filter((e) => e.kind === 'krouzek')
    const dayOff = changes.find((c) => c.date === date && c.kind === 'odpada' && c.lessonNumber == null)
    const day: WorkDay = { start, direct, related: Math.max(0, daily - direct), end: addHours(start, daily) }
    if (extra) day.extra = extra
    if (clubs.length) { day.activityHours = clubs.length; day.activityName = clubs.map((c) => c.title || 'kroužek').join(', ') }
    if (dayOff?.note && /dvpp|školení|seminář/i.test(dayOff.note)) day.code = 'DVPP'
    out[d] = day
  }
  return out
}

export function monthTotals(days: Record<number, WorkDay>) {
  const t = { direct: 0, related: 0, extra: 0, worked: 0, overtime: 0, activity: 0, codes: {} as Record<string, number>, workedDays: 0 }
  for (const d of Object.values(days)) {
    t.direct += d.direct ?? 0; t.related += d.related ?? 0; t.extra += d.extra ?? 0; t.overtime += d.overtime ?? 0; t.activity += d.activityHours ?? 0
    t.worked += (d.direct ?? 0) + (d.related ?? 0)
    if (d.code) t.codes[d.code] = (t.codes[d.code] ?? 0) + 1
    if ((d.direct ?? 0) + (d.related ?? 0) > 0) t.workedDays++
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
    set(col('C', 'S'), day.direct)
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
