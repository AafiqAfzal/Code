import Dexie, { type EntityTable } from 'dexie'

/** Školní rok a základní nastavení aplikace (jediný záznam s id = 1). */
export interface Settings {
  id: number
  teacherName: string
  schoolName: string
  schoolYear: string // např. "2026/2027"
  yearStart: string // ISO datum
  yearEnd: string
  skolaOnlineUrl: string
  /** Předmět, který je vybrán jako výchozí (např. Anglický jazyk). */
  defaultSubjectId?: number
  /** Zámek aplikace PINem (hash + sůl); undefined = bez zámku. */
  pinHash?: string
  pinSalt?: string
  /** Po kolika minutách nečinnosti se aplikace zamkne (0 = jen při spuštění). */
  lockAfterMinutes?: number
  /** Připomínky událostí (den předem a v den konání). */
  remindersEnabled?: boolean
}

export interface Subject {
  id: number
  name: string
  abbreviation: string
  color: string
}

/** Kmenová třída, např. 6.A */
export interface SchoolClass {
  id: number
  name: string
  gradeLevel: number // ročník 1–9
  classTeacher?: string
  note?: string
}

/**
 * Skupina žáků pro výuku (např. dělená angličtina). Může obsahovat žáky
 * z více tříd v rámci ročníku.
 */
export interface Group {
  id: number
  name: string
  subjectId?: number
  gradeLevel: number
  studentIds: number[]
  color?: string
  note?: string
}

export interface Student {
  id: number
  firstName: string
  lastName: string
  classId?: number
  catalogNumber?: number
  birthDate?: string
  email?: string
  parentName?: string
  parentContact?: string
  citizenship?: string
  /** Štítky, např. "IVP", "PLPP", "SPU", "nadaný" */
  tags: string[]
  note?: string
  active: boolean
}

/** Časová osa poznámek k žákovi (pochvaly, napomenutí, komunikace s rodiči…) */
export type StudentNoteKind = 'poznamka' | 'pochvala' | 'napomenuti' | 'rodice' | 'podpora'
export interface StudentNote {
  id: number
  studentId: number
  date: string
  kind: StudentNoteKind
  text: string
}

/** Kategorie hodnocení dle "Průběžné hodnocení 2026-27" (váhy). */
export interface GradeCategory {
  id: number
  name: string
  weight: number
  color: string
  order: number
}

/** Převod procent na známku – dolní hranice v procentech pro každou známku. */
export interface GradingScale {
  id: number
  name: string
  /** thresholds[grade-1] = minimální procenta pro známku `grade` (1..4); 5 je vše ostatní */
  thresholds: [number, number, number, number]
  /** Volný text pravidel hodnocení (text dokumentu Průběžné hodnocení). */
  rulesText: string
}

/** Jedno hodnocení žáka (známka, body nebo procenta). */
export interface Assessment {
  id: number
  studentId: number
  subjectId: number
  groupId?: number
  categoryId: number
  date: string
  title: string
  /** Známka 1–5; pokud jsou vyplněny body, dopočítá se ze škály. */
  grade?: number
  points?: number
  maxPoints?: number
  /** Váha – výchozí z kategorie, lze upravit u jednotlivé známky. */
  weight: number
  note?: string
  /** true = žák nebyl hodnocen (chyběl) – do průměru se nepočítá */
  absent?: boolean
}

/** Slovní hodnocení / návrh známky na vysvědčení za pololetí. */
export interface TermEvaluation {
  id: number
  studentId: number
  subjectId: number
  term: 1 | 2
  proposedGrade?: number
  text: string
  updatedAt: string
}

export type EventKind = 'test' | 'pisemka' | 'schuzka' | 'porada' | 'akce' | 'ukol' | 'jine'
export interface CalendarEvent {
  id: number
  title: string
  kind: EventKind
  date: string
  timeFrom?: string
  timeTo?: string
  groupId?: number
  classId?: number
  subjectId?: number
  note?: string
  done: boolean
}

/** Tematický plán (nahraný z Wordu nebo zapsaný ručně). */
export interface ThematicPlan {
  id: number
  title: string
  subjectId?: number
  gradeLevel?: number
  groupId?: number
  sourceFileName?: string
  createdAt: string
}

export interface PlanItem {
  id: number
  planId: number
  order: number
  text: string
  month?: string
  hours?: number
  done: boolean
  doneDate?: string
  note?: string
  /** Hierarchie – nadpis/tematický celek (level 0) vs. téma (level 1) */
  level: number
}

/** Zápis z hodiny – jádro pedagogického deníku. */
export interface LessonLog {
  id: number
  date: string
  groupId?: number
  classId?: number
  subjectId: number
  lessonNumber?: number
  topic: string
  homework?: string
  note?: string
  absentStudentIds: number[]
  planItemId?: number
}

/** Zasedací pořádek skupiny nebo třídy. */
export interface SeatingPlan {
  id: number
  groupId?: number
  classId?: number
  rows: number
  cols: number
  /** index sedadla (row*cols+col) → id žáka */
  seats: Record<number, number>
  updatedAt: string
}

/** Rozvrh hodin učitele. */
export interface TimetableSlot {
  id: number
  weekday: number // 1 = pondělí … 5 = pátek
  lessonNumber: number
  subjectId: number
  groupId?: number
  classId?: number
  room?: string
}

export class DiaryDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  subjects!: EntityTable<Subject, 'id'>
  classes!: EntityTable<SchoolClass, 'id'>
  groups!: EntityTable<Group, 'id'>
  students!: EntityTable<Student, 'id'>
  studentNotes!: EntityTable<StudentNote, 'id'>
  gradeCategories!: EntityTable<GradeCategory, 'id'>
  gradingScales!: EntityTable<GradingScale, 'id'>
  assessments!: EntityTable<Assessment, 'id'>
  termEvaluations!: EntityTable<TermEvaluation, 'id'>
  events!: EntityTable<CalendarEvent, 'id'>
  plans!: EntityTable<ThematicPlan, 'id'>
  planItems!: EntityTable<PlanItem, 'id'>
  lessonLogs!: EntityTable<LessonLog, 'id'>
  timetable!: EntityTable<TimetableSlot, 'id'>
  seatingPlans!: EntityTable<SeatingPlan, 'id'>

  constructor() {
    super('pedagogicky-denik')
    this.version(1).stores({
      settings: 'id',
      subjects: '++id, name',
      classes: '++id, name, gradeLevel',
      groups: '++id, name, gradeLevel, subjectId',
      students: '++id, lastName, classId, active',
      studentNotes: '++id, studentId, date',
      gradeCategories: '++id, order',
      gradingScales: 'id',
      assessments: '++id, studentId, subjectId, groupId, date, [studentId+subjectId]',
      termEvaluations: '++id, studentId, [studentId+subjectId+term]',
      events: '++id, date, kind',
      plans: '++id, subjectId, gradeLevel',
      planItems: '++id, planId, order',
      lessonLogs: '++id, date, groupId, classId, subjectId',
      timetable: '++id, weekday, lessonNumber',
    })
    this.version(2).stores({
      seatingPlans: '++id, groupId, classId',
    })
  }
}

export const db = new DiaryDB()

export const ALL_TABLES = [
  'settings', 'subjects', 'classes', 'groups', 'students', 'studentNotes',
  'gradeCategories', 'gradingScales', 'assessments', 'termEvaluations',
  'events', 'plans', 'planItems', 'lessonLogs', 'timetable', 'seatingPlans',
] as const
export type TableName = (typeof ALL_TABLES)[number]
