import * as XLSX from 'xlsx'
import type { Assessment, GradeCategory, GradingScale, Student } from '../db/schema'
import { effectiveGrade, weightedAverage, percentOf } from './grading'
import { fullName, byName, fmtDate } from './format'

/**
 * Export známek do Excelu ve formátu vhodném pro přepis do Škola online:
 * řádek = žák, sloupec = hodnocení (datum + název), poslední sloupce = průměr a návrh.
 */
export function exportGradesXlsx(opts: {
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

  const ws = XLSX.utils.aoa_to_sheet([[title], [], header, ...rows])
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, ...cols.map(() => ({ wch: 22 })), { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hodnocení')

  // Druhý list: seznam všech známek po řádcích (dlouhý formát – snadný pro hromadný zápis)
  const long = [['Příjmení', 'Jméno', 'Datum', 'Název', 'Kategorie', 'Váha', 'Známka', 'Body', 'Max', 'Procenta', 'Poznámka']]
  for (const s of [...students].sort(byName)) {
    for (const a of assessments.filter((x) => x.studentId === s.id).sort((x, y) => x.date.localeCompare(y.date))) {
      long.push([s.lastName, s.firstName, fmtDate(a.date), a.title, catName(a.categoryId), String(a.weight), a.absent ? 'N' : String(effectiveGrade(a, scale) ?? ''), String(a.points ?? ''), String(a.maxPoints ?? ''), String(percentOf(a) ?? ''), a.note ?? ''])
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(long), 'Seznam známek')
  XLSX.writeFile(wb, `${title.replace(/[^\w\dáčďéěíňóřšťúůýž .-]/gi, '')}.xlsx`)
}

export function exportStudentsXlsx(students: Student[], className: (id?: number) => string, groupsOf: (id: number) => string) {
  const rows = [['Třída', 'Příjmení', 'Jméno', 'Č. v katalogu', 'Skupiny', 'Štítky', 'Poznámka'],
    ...[...students].sort(byName).map((s) => [className(s.classId), s.lastName, s.firstName, s.catalogNumber ?? '', groupsOf(s.id), s.tags.join(', '), s.note ?? ''])]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Žáci')
  XLSX.writeFile(wb, 'zaci.xlsx')
}

export { fullName }
