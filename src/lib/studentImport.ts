import { db, type Group, type SchoolClass, type Student, type Subject } from '../db/schema'
import { gradeFromClassName, type ImportRow } from './excelImport'

/**
 * Import žáků ve dvou krocích: nejdřív se z řádků a aktuálního stavu databáze
 * spočítá plán (nanečisto, nic se neukládá), pak se plán – přepočítaný nad čerstvými
 * daty – zapíše v jediné transakci. Nové záznamy mají v plánu dočasná záporná id.
 */

export interface StudentImportOptions {
  /** Předmět, jehož skupin se import týká (nutný, pokud řádky obsahují skupinu). */
  subject?: Subject
  groupScope: 'grade' | 'class'
  defaultClass: string
  tagForeign: boolean
}

export interface StudentImportSummary {
  created: number
  updated: number
  unchanged: number
  classMoves: number
  /** žáci, kterým se změnilo zařazení do skupin předmětu */
  groupChanges: number
  newClasses: number
  newGroups: number
  /** upozornění k jednotlivým řádkům (nejednoznačné párování apod.) */
  notes: string[]
}

export interface StudentImportPlan {
  newClasses: { tempId: number; name: string; gradeLevel: number }[]
  newStudents: { tempId: number; data: Omit<Student, 'id'> }[]
  studentUpdates: { id: number; changes: Partial<Student> }[]
  newGroups: { tempId: number; name: string; subjectId: number; gradeLevel: number; studentIds: number[] }[]
  groupUpdates: { id: number; studentIds: number[] }[]
  summary: StudentImportSummary
}

const fold = (s: string | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

/** Řádky, které mění skupiny (vyplněná skupina nebo „-“). Prázdná buňka skupiny nic nemění. */
export const rowsTouchingGroups = (rows: ImportRow[]) => rows.filter((r) => r.group !== undefined).length

export function planStudentImport(
  rows: ImportRow[],
  existing: { students: Student[]; classes: SchoolClass[]; groups: Group[] },
  opts: StudentImportOptions,
): StudentImportPlan {
  const subj = opts.subject
  let tmp = -1
  const plan: StudentImportPlan = {
    newClasses: [], newStudents: [], studentUpdates: [], newGroups: [], groupUpdates: [],
    summary: { created: 0, updated: 0, unchanged: 0, classMoves: 0, groupChanges: 0, newClasses: 0, newGroups: 0, notes: [] },
  }
  const sum = plan.summary
  const classByName = new Map(existing.classes.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const classNameById = new Map(existing.classes.map((c) => [c.id, c.name]))
  // pracovní kopie skupin vybraného předmětu (jiných předmětů se import nedotýká)
  const subjGroups = subj ? existing.groups.filter((g) => g.subjectId === subj.id).map((g) => ({ ...g, studentIds: [...g.studentIds] })) : []
  const origMembers = new Map(subjGroups.map((g) => [g.id, g.studentIds.join(',')]))
  const pool = [...existing.students]
  const matched = new Set<number>()
  const groupTouched = new Set<number>()

  rows.forEach((r, idx) => {
    const label = `ř. ${idx + 1}: ${[r.lastName, r.firstName].filter(Boolean).join(' ')}`
    const cname = (r.className || opts.defaultClass).trim()
    let classId: number | undefined
    if (cname) {
      classId = classByName.get(cname.toLowerCase())
      if (classId === undefined) {
        classId = tmp--
        plan.newClasses.push({ tempId: classId, name: cname, gradeLevel: r.gradeLevel || gradeFromClassName(cname) })
        classByName.set(cname.toLowerCase(), classId); classNameById.set(classId, cname); sum.newClasses++
      }
    }

    // --- párování na existujícího žáka ---
    const sameName = pool.filter((s) => !matched.has(s.id) && fold(s.lastName) === fold(r.lastName) && fold(s.firstName) === fold(r.firstName))
    let target: Student | undefined
    let candidates = sameName
    let ambiguous = false
    if (r.birthDate) {
      const withBD = sameName.filter((s) => s.birthDate === r.birthDate)
      if (withBD.length === 1) target = withBD[0] // stejné jméno i datum narození = tentýž žák (i po změně třídy)
      else if (withBD.length > 1) { candidates = withBD; ambiguous = true }
      else candidates = sameName.filter((s) => !s.birthDate) // jiné datum narození = jiný žák
    }
    if (!target) {
      if (classId !== undefined) {
        const inClass = candidates.filter((s) => s.classId === classId)
        const noClass = candidates.filter((s) => s.classId === undefined)
        if (inClass.length === 1) target = inClass[0]
        else if (inClass.length > 1) ambiguous = true
        else if (noClass.length === 1) target = noClass[0]
        else if (candidates.length > 0 && !ambiguous) {
          const where = candidates.map((s) => classNameById.get(s.classId ?? NaN) ?? 'bez třídy').join(', ')
          sum.notes.push(`${label} – jmenovec už je v ${where}; bez data narození nejde poznat, zda jde o téhož žáka, zakládá se nový`)
        }
      } else if (candidates.length === 1 && !ambiguous) target = candidates[0]
      else if (candidates.length > 1) ambiguous = true
    }
    if (ambiguous && !target) sum.notes.push(`${label} – více žáků se stejným jménem, nelze jednoznačně spárovat; zakládá se nový`)

    const isForeign = !!r.citizenship && !/^(cesk|czech|cr$)/.test(fold(r.citizenship))
    const extraTags = opts.tagForeign && isForeign ? ['OMJ'] : []
    let studentId: number
    if (target) {
      studentId = target.id
      matched.add(target.id)
      const next: Partial<Student> = {
        classId: classId ?? target.classId, catalogNumber: r.catalogNumber ?? target.catalogNumber, birthDate: r.birthDate ?? target.birthDate,
        citizenship: r.citizenship || target.citizenship, gender: r.gender ?? target.gender, active: true,
      }
      const tags = Array.from(new Set([...(target.tags ?? []), ...extraTags]))
      const changes: Partial<Student> = {}
      for (const [k, v] of Object.entries(next) as [keyof Student, never][]) if (target[k] !== v) (changes as Record<string, unknown>)[k] = v
      if (tags.length !== (target.tags ?? []).length) changes.tags = tags
      if (changes.classId !== undefined && target.classId !== undefined) sum.classMoves++
      if (Object.keys(changes).length) { plan.studentUpdates.push({ id: target.id, changes }); sum.updated++ } else sum.unchanged++
    } else {
      studentId = tmp--
      const data: Omit<Student, 'id'> = { firstName: r.firstName ?? '', lastName: r.lastName ?? '', classId, catalogNumber: r.catalogNumber, birthDate: r.birthDate, citizenship: r.citizenship || undefined, gender: r.gender, tags: extraTags, active: true }
      plan.newStudents.push({ tempId: studentId, data })
      matched.add(studentId)
      sum.created++
    }

    // --- skupiny (jen vybraného předmětu); prázdná buňka = beze změny ---
    if (r.group === undefined || !subj) return
    const grade = r.gradeLevel || (cname ? gradeFromClassName(cname) : 0)
    const before = subjGroups.filter((g) => g.studentIds.includes(studentId)).map((g) => g.id).sort().join(',')
    let keep: number | undefined
    if (r.group) {
      const gname = opts.groupScope === 'class' && cname
        ? `${subj.abbreviation} ${cname} – sk. ${r.group}`.trim()
        : `${subj.abbreviation} ${grade ? `${grade}. r.` : ''} – sk. ${r.group}`.replace(/\s+/g, ' ').trim()
      let g = subjGroups.find((x) => x.name.trim().toLowerCase() === gname.toLowerCase())
      if (!g) {
        g = { id: tmp--, name: gname, subjectId: subj.id, gradeLevel: grade, studentIds: [] }
        subjGroups.push(g); sum.newGroups++
      }
      if (!g.studentIds.includes(studentId)) g.studentIds.push(studentId)
      keep = g.id
    }
    // žák může být v ročníku jen v jedné skupině předmětu: z ostatních vyřadit („-“ = ze všech)
    for (const other of subjGroups) {
      if (other.id !== keep && other.gradeLevel === grade && other.studentIds.includes(studentId)) other.studentIds = other.studentIds.filter((x) => x !== studentId)
    }
    const after = subjGroups.filter((g) => g.studentIds.includes(studentId)).map((g) => g.id).sort().join(',')
    if (before !== after) groupTouched.add(studentId)
  })

  for (const g of subjGroups) {
    if (g.id < 0) plan.newGroups.push({ tempId: g.id, name: g.name, subjectId: g.subjectId!, gradeLevel: g.gradeLevel, studentIds: g.studentIds })
    else if (origMembers.get(g.id) !== g.studentIds.join(',')) plan.groupUpdates.push({ id: g.id, studentIds: g.studentIds })
  }
  sum.groupChanges = groupTouched.size
  return plan
}

/** Spočítá plán nad aktuálními daty a zapíše ho v jedné transakci (při chybě se nezapíše nic). */
export async function runStudentImport(rows: ImportRow[], opts: StudentImportOptions): Promise<StudentImportSummary> {
  return db.transaction('rw', db.classes, db.students, db.groups, async () => {
    const [students, classes, groups] = await Promise.all([db.students.toArray(), db.classes.toArray(), db.groups.toArray()])
    const plan = planStudentImport(rows, { students, classes, groups }, opts)
    const ids = new Map<number, number>()
    const real = (id: number | undefined) => (id !== undefined && id < 0 ? ids.get(id) : id)
    for (const c of plan.newClasses) ids.set(c.tempId, await db.classes.add({ name: c.name, gradeLevel: c.gradeLevel }))
    for (const s of plan.newStudents) ids.set(s.tempId, await db.students.add({ ...s.data, classId: real(s.data.classId) } as Student))
    for (const u of plan.studentUpdates) await db.students.update(u.id, { ...u.changes, ...('classId' in u.changes ? { classId: real(u.changes.classId) } : {}) })
    for (const g of plan.newGroups) await db.groups.add({ name: g.name, subjectId: g.subjectId, gradeLevel: g.gradeLevel, studentIds: g.studentIds.map((x) => real(x)!) } as Group)
    for (const g of plan.groupUpdates) await db.groups.update(g.id, { studentIds: g.studentIds.map((x) => real(x)!) })
    return plan.summary
  })
}

/** Krátké shrnutí plánu česky. */
export function describeSummary(s: StudentImportSummary): string {
  const parts = [`${s.created} nových žáků`, `${s.updated} aktualizovaných`]
  if (s.unchanged) parts.push(`${s.unchanged} beze změny`)
  if (s.classMoves) parts.push(`${s.classMoves} přeřazených do jiné třídy`)
  if (s.groupChanges) parts.push(`${s.groupChanges} se změnou skupiny`)
  if (s.newClasses) parts.push(`${s.newClasses} nových tříd`)
  if (s.newGroups) parts.push(`${s.newGroups} nových skupin`)
  if (s.notes.length) parts.push(`${s.notes.length} nejednoznačných řádků`)
  return parts.join(', ')
}
