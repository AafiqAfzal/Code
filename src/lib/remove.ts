import { db } from '../db/schema'

/**
 * Smaže žáka i všechno, co se ho týká, v jedné transakci: známky, slovní hodnocení,
 * poznámky, členství ve skupinách, místo v zasedacím pořádku a absence v zápisech.
 */
export async function deleteStudent(id: number) {
  await db.transaction('rw', [db.students, db.studentNotes, db.assessments, db.termEvaluations, db.groups, db.seatingPlans, db.lessonLogs], async () => {
    await db.studentNotes.where('studentId').equals(id).delete()
    await db.assessments.where('studentId').equals(id).delete()
    await db.termEvaluations.where('studentId').equals(id).delete()
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
