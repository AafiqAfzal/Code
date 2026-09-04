import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ensureDefaults } from './db/seed'
import { runDailyAutoBackup, saveBackupAs } from './lib/desktop'
import { pushReminderNotifications } from './lib/reminders'
import { LockScreen } from './components/LockScreen'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { Dashboard } from './pages/Dashboard'
import { CalendarPage } from './pages/Calendar'
import { ClassesPage } from './pages/Classes'
import { StudentsPage } from './pages/Students'
import { StudentDetail } from './pages/StudentDetail'
import { GradesPage } from './pages/Grades'
import { LessonLogsPage } from './pages/LessonLogs'
import { PlansPage } from './pages/Plans'
import { PlanDetail } from './pages/PlanDetail'
import { TimetablePage } from './pages/Timetable'
import { ImportPage } from './pages/Import'
import { SettingsPage } from './pages/Settings'
import { AttendancePage } from './pages/Attendance'
import { PrintReportPage } from './pages/PrintReport'
import { SeatingPage } from './pages/Seating'
import { WorkReportPage } from './pages/WorkReport'

export default function App() {
  const [ready, setReady] = useState(false)
  const settings = useLiveQuery(() => db.settings.get(1), [])
  const [locked, setLocked] = useState<boolean | null>(null)
  // Zámek PINem: při spuštění a po nečinnosti
  useEffect(() => {
    if (!settings) return
    if (locked === null) setLocked(!!settings.pinHash)
    if (!settings.pinHash) { setLocked(false); return }
    const minutes = settings.lockAfterMinutes ?? 0
    if (!minutes) return
    let timer: ReturnType<typeof setTimeout>
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => setLocked(true), minutes * 60_000) }
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach((ev) => window.addEventListener(ev, arm, { passive: true }))
    arm()
    return () => { clearTimeout(timer); events.forEach((ev) => window.removeEventListener(ev, arm)) }
  }, [settings?.pinHash, settings?.lockAfterMinutes, locked === null, settings])
  useEffect(() => {
    ensureDefaults().then(() => setReady(true)).then(() => runDailyAutoBackup()).catch((e) => console.error('Automatická záloha selhala', e))
    const reminders = setTimeout(() => pushReminderNotifications().catch(() => {}), 3000)
    const hourly = setInterval(() => pushReminderNotifications().catch(() => {}), 60 * 60_000)
    const off = window.denik?.onMenu('menu:backup-save-as', () => { saveBackupAs() })
    return () => { clearTimeout(reminders); clearInterval(hourly); off?.() }
  }, [])
  if (!ready || locked === null) return <div className="p-8 text-slate-500">Načítám…</div>
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="kalendar" element={<CalendarPage />} />
          <Route path="tridy" element={<ClassesPage />} />
          <Route path="zaci" element={<StudentsPage />} />
          <Route path="zaci/:id" element={<StudentDetail />} />
          <Route path="hodnoceni" element={<GradesPage />} />
          <Route path="zapisy" element={<LessonLogsPage />} />
          <Route path="plany" element={<PlansPage />} />
          <Route path="plany/:id" element={<PlanDetail />} />
          <Route path="rozvrh" element={<TimetablePage />} />
          <Route path="dochazka" element={<AttendancePage />} />
          <Route path="tisk" element={<PrintReportPage />} />
          <Route path="zasedaci" element={<SeatingPage />} />
          <Route path="vykaz" element={<WorkReportPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="nastaveni" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
