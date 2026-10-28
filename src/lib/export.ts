import ExcelJS from 'exceljs/dist/exceljs.min.js'
import type { Assessment, GradeCategory, GradingScale, Student } from '../db/schema'
import { effectiveGrade, weightedAverage, percentOf } from './grading'
import { fullName, byName, fmtDate } from './format'
import { downloadBlob } from './backup'

type Cell = string | number | null | undefined

/**
 * Bezpečný název souboru: odstraní jen znaky, které Windows/macOS/Linux v názvu nedovolí,
 * lomítko (např. ve školním roce 2026/2027) nahradí pomlčkou a sloučí mezery.
 */
export function safeFileName(name: string, ext = 'xlsx') {
  const base = name
    .replace(/[\\/]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return `${base || 'export'}.${ext}`
}

/** Přidá list s řádky; prázdné řetězce zapíše jako prázdné buňky. */
export function addSheet(wb: ExcelJS.Workbook, name: string, rows: Cell[][], widths?: number[]) {
  const ws = wb.addWorksheet(name)
  for (const r of rows) ws.addRow(r.map((v) => (v === '' || v === undefined ? null : v)))
  widths?.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  return ws
}

/** Uloží sešit jako .xlsx (v prohlížeči i v desktopové aplikaci jako stažený soubor). */
export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
}

/**
 * Export známek do Excelu ve formátu vhodném pro přepis do Škola online:
 * řádek = žák, sloupec = hodnocení (datum + název), poslední sloupce = průměr a návrh.
 */
export async function exportGradesXlsx(opts: {
  students: Student[]
  assessments: Assessment[]
  categories: GradeCategory[]
  scale: GradingScale
  title: string
}) {
  const { students, assessments, categories, scale, title } = opts
  const cols = Array.from(
    new Map(assessments.map((a) => [`${a.date}|${a.title}|${a.categoryId}`, a])).values(),
  ).sort((a, b) => a.date.localeCompare(b.date))
  const catName = (id: number) => categories.find((c) => c.id === id)?.name ?? ''

  const header = ['Příjmení', 'Jméno', ...cols.map((c) => `${fmtDate(c.date)} ${c.title} (${catName(c.categoryId)}, váha ${c.weight})`), 'Vážený průměr', 'Návrh známky']
  const rows = [...students].sort(byName).map((s) => {
    const mine = assessments.filter((a) => a.studentId === s.id)
    const cells = cols.map((c) => {
      const a = mine.find((x) => x.date === c.date && x.title === c.title && x.categoryId === c.categoryId)
      if (!a) return ''
      if (a.absent) return 'N'
      const g = effectiveGrade(a, scale)
      const p = percentOf(a)
      return p != null ? `${g} (${a.points}/${a.maxPoints}, ${p} %)` : g ?? ''
    })
    const avg = weightedAverage(mine, scale)
    return [s.lastName, s.firstName, ...cells, avg ?? '', avg != null ? Math.round(avg) : '']
  })

  const wb = new ExcelJS.Workbook()
  addSheet(wb, 'Hodnocení', [[title], [], header, ...rows], [16, 12, ...cols.map(() => 22), 14, 14])

  // Druhý list: seznam všech známek po řádcích (dlouhý formát – snadný pro hromadný zápis)
  const long = [['Příjmení', 'Jméno', 'Datum', 'Název', 'Kategorie', 'Váha', 'Známka', 'Body', 'Max', 'Procenta', 'Poznámka']]
  for (const s of [...students].sort(byName)) {
    for (const a of assessments.filter((x) => x.studentId === s.id).sort((x, y) => x.date.localeCompare(y.date))) {
      long.push([s.lastName, s.firstName, fmtDate(a.date), a.title, catName(a.categoryId), String(a.weight), a.absent ? 'N' : String(effectiveGrade(a, scale) ?? ''), String(a.points ?? ''), String(a.maxPoints ?? ''), String(percentOf(a) ?? ''), a.note ?? ''])
    }
  }
  addSheet(wb, 'Seznam známek', long)
  await downloadWorkbook(wb, safeFileName(title))
}

export async function exportStudentsXlsx(students: Student[], className: (id?: number) => string, groupsOf: (id: number) => string) {
  const rows = [['Třída', 'Příjmení', 'Jméno', 'Č. v katalogu', 'Skupiny', 'Štítky', 'Poznámka'],
    ...[...students].sort(byName).map((s) => [className(s.classId), s.lastName, s.firstName, s.catalogNumber ?? '', groupsOf(s.id), s.tags.join(', '), s.note ?? ''])]
  const wb = new ExcelJS.Workbook()
  addSheet(wb, 'Žáci', rows)
  await downloadWorkbook(wb, 'zaci.xlsx')
}

export { fullName }
