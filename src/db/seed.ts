import { db } from './schema'

/** Výchozí data podle "Průběžné hodnocení 2026-27" – lze upravit v Nastavení. */
export const DEFAULT_CATEGORIES = [
  { name: 'Čtvrtletní / velký test', weight: 3, color: '#dc2626', order: 1 },
  { name: 'Test / písemná práce', weight: 2, color: '#ea580c', order: 2 },
  { name: 'Ústní zkoušení', weight: 2, color: '#7c3aed', order: 3 },
  { name: 'Projekt / prezentace', weight: 2, color: '#0891b2', order: 4 },
  { name: 'Slovíčka / krátký test', weight: 1, color: '#16a34a', order: 5 },
  { name: 'Domácí úkol', weight: 1, color: '#64748b', order: 6 },
  { name: 'Aktivita v hodině', weight: 1, color: '#ca8a04', order: 7 },
]

export const DEFAULT_RULES_TEXT = `Průběžné hodnocení 2026/27 – shrnutí pravidel

• Známky mají různou váhu podle typu hodnocení (viz kategorie).
• Výsledná známka se počítá jako vážený průměr.
• Převod procent na známku: 1 = 90–100 %, 2 = 75–89 %, 3 = 50–74 %, 4 = 30–49 %, 5 = 0–29 %.
• Žák, který v hodině chyběl, si test dopíše v náhradním termínu.
• Do hodnocení se promítá také aktivita v hodině a plnění domácích úkolů.

(Text lze upravit v Nastavení → Hodnocení.)`

export async function ensureDefaults() {
  const settings = await db.settings.get(1)
  if (!settings) {
    await db.settings.put({
      id: 1,
      teacherName: '',
      schoolName: '',
      schoolYear: '2026/2027',
      yearStart: '2026-09-01',
      yearEnd: '2027-06-30',
      skolaOnlineUrl: 'https://aplikace.skolaonline.cz',
    })
  }
  if ((await db.subjects.count()) === 0) {
    const id = await db.subjects.add({ name: 'Anglický jazyk', abbreviation: 'Aj', color: '#2563eb' })
    await db.subjects.add({ name: 'Zeměpis', abbreviation: 'Z', color: '#16a34a' })
    await db.settings.update(1, { defaultSubjectId: id })
  }
  if ((await db.gradeCategories.count()) === 0) {
    await db.gradeCategories.bulkAdd(DEFAULT_CATEGORIES)
  }
  if (!(await db.gradingScales.get(1))) {
    await db.gradingScales.put({
      id: 1,
      name: 'Průběžné hodnocení 2026-27',
      thresholds: [90, 75, 50, 30],
      rulesText: DEFAULT_RULES_TEXT,
    })
  }
}

/** Ukázková data pro vyzkoušení aplikace. */
export async function loadDemoData() {
  await ensureDefaults()
  const subjectId = (await db.subjects.toCollection().first())!.id
  const a = await db.classes.add({ name: '6.A', gradeLevel: 6, classTeacher: 'Mgr. Nováková' })
  const b = await db.classes.add({ name: '6.B', gradeLevel: 6, classTeacher: 'Mgr. Svoboda' })
  const namesA = [
    ['Adam', 'Bartoš'], ['Eliška', 'Dvořáková'], ['Jakub', 'Horák'], ['Karolína', 'Jelínková'],
    ['Matěj', 'Kučera'], ['Natálie', 'Malá'], ['Ondřej', 'Němec'], ['Tereza', 'Pokorná'],
    ['Vojtěch', 'Růžička'], ['Anna', 'Sedláková'], ['Filip', 'Urban'], ['Viktorie', 'Zemanová'],
  ]
  const namesB = [
    ['Daniel', 'Beneš'], ['Ema', 'Fialová'], ['Lukáš', 'Hájek'], ['Klára', 'Kolářová'],
    ['Marek', 'Král'], ['Nela', 'Marková'], ['Petr', 'Novotný'], ['Sofie', 'Procházková'],
    ['Tomáš', 'Šimek'], ['Veronika', 'Vlčková'], ['Šimon', 'Vávra'], ['Zuzana', 'Černá'],
  ]
  const idsA: number[] = []
  const idsB: number[] = []
  for (const [i, [f, l]] of namesA.entries()) {
    idsA.push(await db.students.add({ firstName: f, lastName: l, classId: a, catalogNumber: i + 1, tags: i === 3 ? ['IVP'] : [], active: true }))
  }
  for (const [i, [f, l]] of namesB.entries()) {
    idsB.push(await db.students.add({ firstName: f, lastName: l, classId: b, catalogNumber: i + 1, tags: i === 7 ? ['PLPP'] : [], active: true }))
  }
  const g1 = await db.groups.add({ name: 'AJ 6.A – 1. skupina', subjectId, gradeLevel: 6, studentIds: idsA.slice(0, 6), color: '#2563eb' })
  const g2 = await db.groups.add({ name: 'AJ 6.B – 1. skupina', subjectId, gradeLevel: 6, studentIds: idsB.slice(0, 6), color: '#16a34a' })
  await db.groups.add({ name: 'AJ 6.A – 2. skupina (kolegyně)', subjectId, gradeLevel: 6, studentIds: idsA.slice(6), color: '#94a3b8' })

  const cats = await db.gradeCategories.orderBy('order').toArray()
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d }
  for (const [gid, ids] of [[g1, idsA.slice(0, 6)], [g2, idsB.slice(0, 6)]] as [number, number[]][]) {
    for (const sid of ids) {
      await db.assessments.bulkAdd([
        { studentId: sid, subjectId, groupId: gid, categoryId: cats[4].id, date: iso(daysAgo(14)), title: 'Unit 1 vocabulary', points: Math.floor(Math.random() * 6) + 5, maxPoints: 10, weight: cats[4].weight },
        { studentId: sid, subjectId, groupId: gid, categoryId: cats[1].id, date: iso(daysAgo(7)), title: 'Test – Present simple', grade: Math.floor(Math.random() * 3) + 1, weight: cats[1].weight },
        { studentId: sid, subjectId, groupId: gid, categoryId: cats[5].id, date: iso(daysAgo(3)), title: 'Workbook p. 12', grade: Math.floor(Math.random() * 2) + 1, weight: cats[5].weight },
      ])
    }
  }
  await db.events.bulkAdd([
    { title: 'Test – Unit 2', kind: 'test', date: iso(daysAgo(-5)), timeFrom: '08:55', groupId: g1, subjectId, done: false },
    { title: 'Třídní schůzky', kind: 'schuzka', date: iso(daysAgo(-12)), timeFrom: '16:30', done: false },
    { title: 'Pedagogická rada', kind: 'porada', date: iso(daysAgo(-20)), timeFrom: '14:00', done: false },
  ])
  const planId = await db.plans.add({ title: 'Tematický plán AJ – 6. ročník', subjectId, gradeLevel: 6, createdAt: new Date().toISOString() })
  const items = [
    ['Introduction – revision', 0, 'září'], ['Present simple – daily routines', 1, 'září'], ['Family and friends – vocabulary', 1, 'září'],
    ['Unit 2 – My home', 0, 'říjen'], ['There is / there are', 1, 'říjen'], ['Prepositions of place', 1, 'říjen'],
    ['Unit 3 – Free time', 0, 'listopad'], ['Present continuous', 1, 'listopad'], ['Hobbies and sports', 1, 'listopad'],
  ] as [string, number, string][]
  await db.planItems.bulkAdd(items.map(([text, level, month], i) => ({ planId, order: i, text, level, month, done: i < 3 })))
  await db.lessonLogs.add({ date: iso(daysAgo(1)), groupId: g1, subjectId, lessonNumber: 3, topic: 'Present simple – questions', homework: 'WB p. 14/1,2', absentStudentIds: [idsA[2]] })
  await db.timetable.bulkAdd([
    { weekday: 1, lessonNumber: 2, subjectId, groupId: g1, room: '12' },
    { weekday: 1, lessonNumber: 4, subjectId, groupId: g2, room: '12' },
    { weekday: 3, lessonNumber: 1, subjectId, groupId: g1, room: '12' },
    { weekday: 4, lessonNumber: 3, subjectId, groupId: g2, room: '12' },
  ])
}

/** Soubor s rozvrhem (JSON), např. připravený z exportu Školy online. */
export interface TimetableFile {
  app: 'pedagogicky-denik'
  type: 'timetable'
  name?: string
  subjects?: { abbr: string; name: string; color?: string }[]
  /** groupNo = číslo skupiny v rámci třídy (null = celá třída) */
  slots: { weekday: number; lessonNumber: number; subject: string; className: string; groupNo?: number | null; room?: string }[]
}

/** Soubor s tematickými plány (JSON). */
export interface PlansFile {
  app: 'pedagogicky-denik'
  type: 'plans'
  subject: { abbr: string; name: string; color?: string }
  plans: { title: string; gradeLevel: number; items: { text: string; level: number; note?: string; month?: string }[] }[]
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 }
const gradeOf = (cls: string) => ROMAN[cls.split('.')[0].toUpperCase()] ?? Number(cls.match(/^\d+/)?.[0] ?? 0)

async function ensureSubject(sub: { abbr: string; name: string; color?: string }): Promise<number> {
  const subjects = await db.subjects.toArray()
  const ex = subjects.find((s) => s.abbreviation.toLowerCase() === sub.abbr.toLowerCase() || s.name.toLowerCase() === sub.name.toLowerCase())
  return ex?.id ?? db.subjects.add({ name: sub.name, abbreviation: sub.abbr, color: sub.color ?? '#64748b' })
}

/**
 * Nahraje rozvrh ze souboru: založí chybějící třídy a předměty a hodiny dělených
 * skupin naváže na existující skupiny „sk. N“ dané třídy (jinak na třídu).
 */
export async function importTimetableFile(file: TimetableFile): Promise<number> {
  if (file.app !== 'pedagogicky-denik' || file.type !== 'timetable') throw new Error('Soubor není rozvrh pro Pedagogický deník.')
  await ensureDefaults()
  for (const sub of file.subjects ?? []) await ensureSubject(sub)
  const classes = await db.classes.toArray()
  const groups = await db.groups.toArray()
  const subjects = await db.subjects.toArray()
  const classIdFor = async (name: string) => {
    const ex = classes.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (ex) return ex.id
    const id = await db.classes.add({ name, gradeLevel: gradeOf(name) })
    classes.push({ id, name, gradeLevel: gradeOf(name) })
    return id
  }
  await db.timetable.clear()
  let n = 0
  for (const sl of file.slots) {
    const subjectId = subjects.find((s) => s.abbreviation.toLowerCase() === sl.subject.toLowerCase() || s.name.toLowerCase() === sl.subject.toLowerCase())?.id ?? (await ensureSubject({ abbr: sl.subject, name: sl.subject }))
    const classId = await classIdFor(sl.className)
    let groupId: number | undefined
    if (sl.groupNo != null) {
      const grade = gradeOf(sl.className)
      const re = new RegExp(`(sk\\.?|skupina)\\s*${sl.groupNo}\\b|${sl.groupNo}\\.\\s*skupina`, 'i')
      groupId = groups.find((g) => g.gradeLevel === grade && g.subjectId === subjectId && re.test(g.name) && g.name.toLowerCase().includes(sl.className.toLowerCase()))?.id
        ?? groups.find((g) => g.gradeLevel === grade && g.subjectId === subjectId && re.test(g.name))?.id
    }
    await db.timetable.add({ weekday: sl.weekday, lessonNumber: sl.lessonNumber, subjectId, classId: groupId ? undefined : classId, groupId, room: sl.room })
    n++
  }
  return n
}

/** Nahraje tematické plány ze souboru; plány se stejným názvem se nepřepisují. Vrací počet nových. */
export async function importPlansFile(file: PlansFile): Promise<number> {
  if (file.app !== 'pedagogicky-denik' || file.type !== 'plans') throw new Error('Soubor není tematický plán pro Pedagogický deník.')
  await ensureDefaults()
  const subjectId = await ensureSubject(file.subject)
  const existing = new Set((await db.plans.toArray()).map((p) => p.title))
  let created = 0
  for (const preset of file.plans) {
    if (existing.has(preset.title)) continue
    const planId = await db.plans.add({ title: preset.title, subjectId, gradeLevel: preset.gradeLevel, sourceFileName: 'soubor JSON', createdAt: new Date().toISOString() })
    await db.planItems.bulkAdd(preset.items.map((it, i) => ({ planId, order: i, text: it.text, level: it.level, note: it.note, month: it.month, done: false })))
    created++
  }
  return created
}

export async function readJsonFile<T>(f: File): Promise<T> {
  return JSON.parse(await f.text()) as T
}
