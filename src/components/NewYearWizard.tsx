import { useState } from 'react'
import { db } from '../db/schema'
import { useClasses, useSettings } from './hooks'
import { Modal } from './ui'
import { exportBackup, downloadBlob } from '../lib/backup'
import { saveBackupAs } from '../lib/desktop'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

/** "VI.Z" → "VII.Z", "6.A" → "7.A" */
export function nextClassName(name: string): string {
  const r = name.match(/^([IVX]+)(.*)$/i)
  if (r) { const i = ROMAN.indexOf(r[1].toUpperCase()); if (i >= 0 && i < ROMAN.length - 1) return ROMAN[i + 1] + r[2] }
  const a = name.match(/^(\d+)(.*)$/)
  if (a) return String(Number(a[1]) + 1) + a[2]
  return name
}

export function NewYearWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings()
  const classes = useClasses()
  const [backedUp, setBackedUp] = useState(false)
  const [opts, setOpts] = useState({ promote: true, retire9: true, clearGrades: true, clearLogs: true, clearEvents: true, resetPlans: true, clearNotes: false, clearTimetable: false })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [y1, y2] = (settings?.schoolYear ?? '2026/2027').split('/').map(Number)
  const nextYear = y1 && y2 ? `${y1 + 1}/${y2 + 1}` : ''

  const run = async () => {
    setBusy(true)
    const summary: string[] = []
    await db.transaction('rw', [db.classes, db.groups, db.students, db.assessments, db.lessonLogs, db.events, db.planItems, db.studentNotes, db.timetable, db.termEvaluations, db.settings, db.seatingPlans, db.timetableChanges, db.schoolHolidays], async () => {
      if (opts.promote) {
        const rename = new Map<string, string>()
        for (const c of classes) {
          if (c.gradeLevel >= 9 && opts.retire9) {
            const ids = (await db.students.where('classId').equals(c.id).toArray()).map((s) => s.id)
            await db.students.where('classId').equals(c.id).modify({ active: false })
            await db.classes.delete(c.id)
            await db.groups.filter((g) => g.gradeLevel === c.gradeLevel).delete()
            await db.seatingPlans.where('classId').equals(c.id).delete()
            summary.push(`${c.name}: ${ids.length} žáků ukončilo docházku (neaktivní)`)
          } else {
            const newName = nextClassName(c.name)
            rename.set(c.name, newName)
            await db.classes.update(c.id, { name: newName, gradeLevel: c.gradeLevel + 1 })
          }
        }
        for (const g of await db.groups.toArray()) {
          let name = g.name
          for (const [o, n] of rename) name = name.replace(new RegExp(o.replace('.', '\\.') + '(?![IVX])', 'g'), n)
          await db.groups.update(g.id, { name, gradeLevel: g.gradeLevel + 1 })
        }
        summary.push(`Třídy povýšeny: ${[...rename].map(([o, n]) => `${o}→${n}`).join(', ')}`)
      }
      if (opts.clearGrades) { summary.push(`Smazáno známek: ${await db.assessments.count()}`); await db.assessments.clear(); await db.termEvaluations.clear() }
      if (opts.clearLogs) { summary.push(`Smazáno zápisů z hodin: ${await db.lessonLogs.count()}`); await db.lessonLogs.clear() }
      if (opts.clearEvents) { const n = await db.events.where('date').below(settings?.yearEnd ?? '2100').delete(); summary.push(`Smazáno událostí: ${n}`) }
      if (opts.resetPlans) { const n = await db.planItems.filter((i) => i.done).modify({ done: false, doneDate: undefined }); summary.push(`Odškrtnutí v plánech zrušeno: ${n}`) }
      if (opts.clearNotes) { summary.push(`Smazáno poznámek: ${await db.studentNotes.count()}`); await db.studentNotes.clear() }
      await db.timetableChanges.clear()
      await db.schoolHolidays.where('to').below(`${y1 + 1}-09-01`).delete()
      if (opts.clearTimetable) { await db.timetable.clear(); summary.push('Rozvrh vymazán') }
      if (nextYear && y1) await db.settings.update(1, { schoolYear: nextYear, yearStart: `${y1 + 1}-09-01`, yearEnd: `${y2 + 1}-06-30` })
    })
    setBusy(false)
    setDone(summary.join('\n'))
  }

  return (
    <Modal open={open} onClose={onClose} title={`Nový školní rok ${nextYear}`}>
      {done ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-green-700">Hotovo.</p>
          <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{done}</pre>
          <p className="text-slate-600">Nyní naimportujte nový seznam žáků ze Školy online (přiřadí nové žáky a skupiny) a zkontrolujte rozvrh.</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => location.reload()}>Zavřít</button></div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="rounded border border-amber-300 bg-amber-50 p-3">
            <b>1. Nejprve zálohu.</b> Průvodce maže letošní známky a zápisy. Záloha je jediná cesta zpět.
            <div className="mt-2"><button className="btn-secondary btn-sm" onClick={async () => { if (window.denik) { if (await saveBackupAs()) setBackedUp(true) } else { downloadBlob(await exportBackup(), `pedagogicky-denik-${settings?.schoolYear?.replace('/', '-')}-zaver.json`); setBackedUp(true) } }}>Uložit zálohu</button> {backedUp && <span className="text-green-700 ml-2">✓ uloženo</span>}</div>
          </div>
          <div><b>2. Co se má stát</b></div>
          {([
            ['promote', `Povýšit třídy o ročník (${classes.slice(0, 3).map((c) => `${c.name}→${nextClassName(c.name)}`).join(', ')}…) a přejmenovat skupiny`],
            ['retire9', 'Žáky 9. ročníku označit jako neaktivní a jejich třídu a skupiny odstranit'],
            ['clearGrades', 'Smazat známky a slovní hodnocení'],
            ['clearLogs', 'Smazat zápisy z hodin (včetně absencí)'],
            ['clearEvents', 'Smazat události kalendáře do konce letošního roku'],
            ['resetPlans', 'Zrušit odškrtnutí v tematických plánech (plány zůstanou)'],
            ['clearNotes', 'Smazat poznámky k žákům (pochvaly, napomenutí…)'],
            ['clearTimetable', 'Vymazat rozvrh'],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {l}</label>
          ))}
          <p className="text-xs text-slate-500">Školní rok se přepne na {nextYear}. Žáci, třídy, skupiny, předměty, kategorie hodnocení a plány zůstávají.</p>
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Zrušit</button><button className="btn-danger" disabled={!backedUp || busy} onClick={run}>Provést přechod</button></div>
        </div>
      )}
    </Modal>
  )
}
