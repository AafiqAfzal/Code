import { db } from '../db/schema'

/**
 * Smaže žáka i všechno, co se ho týká, v jedné transakci: známky, slovní hodnocení,
 * poznámky, členství ve skupinách, místo v zasedacím pořádku a absence v zápisech.
 */
export async function deleteStudent(id: number) {
  await db.transaction('rw', [db.students, db.studentNotes, db.assessments, db.termEvaluations, db.groups, db.seatingPlans, db.lessonLogs, db.reportNotes], async () => {
    await db.studentNotes.where('studentId').equals(id).delete()
    await db.assessments.where('studentId').equals(id).delete()
    await db.termEvaluations.where('studentId').equals(id).delete()
    await db.reportNotes.where('studentId').equals(id).delete()
    await db.groups.filter((g) => g.studentIds.includes(id)).modify((g) => { g.studentIds = g.studentIds.filter((x) => x !== id) })
    await db.seatingPlans.filter((p) => Object.values(p.seats).includes(id)).modify((p) => {
      for (const [k, v] of Object.entries(p.seats)) if (v === id) delete p.seats[Number(k)]
    })
    await db.lessonLogs.filter((l) => l.absentStudentIds.includes(id)).modify((l) => { l.absentStudentIds = l.absentStudentIds.filter((x) => x !== id) })
    await db.students.delete(id)
  })
}

/** Kolik toho smazání žáka odstraní (pro potvrzovací dotaz). */
export async function studentDeleteSummary(id: number) {
  const [grades, notes] = await Promise.all([db.assessments.where('studentId').equals(id).count(), db.studentNotes.where('studentId').equals(id).count()])
  return { grades, notes }
}

/**
 * Smaže třídu, jen když v ní nejsou žádní žáci (ani neaktivní) – jinak by žáci
 * „zmizeli“ z přehledů. S třídou odejde její zasedací pořádek a hodiny v rozvrhu.
 * Vrací chybovou hlášku, nebo null při úspěchu.
 */
export async function deleteClass(id: number): Promise<string | null> {
  const students = await db.students.where('classId').equals(id).count()
  if (students) return `Ve třídě je ${students} žáků (včetně neaktivních). Nejdřív je přesuňte do jiné třídy nebo smažte.`
  await db.transaction('rw', [db.classes, db.seatingPlans, db.timetable], async () => {
    await db.seatingPlans.where('classId').equals(id).delete()
    await db.timetable.filter((t) => t.classId === id).delete()
    await db.classes.delete(id)
  })
  return null
}

/** Předmět lze smazat jen tehdy, když ho nic nepoužívá – jinak by známky a zápisy „zmizely“ z přehledů. */
export async function deleteSubject(id: number): Promise<string | null> {
  const [grades, groups, plans, logs, slots] = await Promise.all([
    db.assessments.where('subjectId').equals(id).count(), db.groups.where('subjectId').equals(id).count(),
    db.plans.where('subjectId').equals(id).count(), db.lessonLogs.where('subjectId').equals(id).count(),
    db.timetable.filter((t) => t.subjectId === id).count(),
  ])
  const used = [grades && `${grades} známek`, groups && `${groups} skupin`, plans && `${plans} tematických plánů`, logs && `${logs} zápisů z hodin`, slots && `${slots} hodin v rozvrhu`].filter(Boolean)
  if (used.length) return `Předmět se používá (${used.join(', ')}). Smazáním by tyto záznamy přestaly být vidět – předmět proto smazat nejde.`
  await db.subjects.delete(id)
  return null
}

/** Co smazání skupiny ovlivní (pro potvrzovací dotaz). */
export async function groupDeleteSummary(id: number) {
  const [grades, logs, slots] = await Promise.all([
    db.assessments.where('groupId').equals(id).count(), db.lessonLogs.where('groupId').equals(id).count(),
    db.timetable.filter((t) => t.groupId === id).count(),
  ])
  return { grades, logs, slots }
}

/** Smaže skupinu i s jejími hodinami v rozvrhu a zasedacím pořádkem; známky a zápisy zůstanou u žáků. */
export async function deleteGroup(id: number) {
  await db.transaction('rw', [db.groups, db.timetable, db.seatingPlans], async () => {
    await db.timetable.filter((t) => t.groupId === id).delete()
    await db.seatingPlans.where('groupId').equals(id).delete()
    await db.groups.delete(id)
  })
}
