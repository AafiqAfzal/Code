import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, CalendarDays, School, Users, UserRound, ClipboardList, BookOpenCheck, ListChecks, Clock, Upload, Settings as SettingsIcon, ExternalLink, Menu, CalendarCheck, Printer, Armchair } from 'lucide-react'
import { useState } from 'react'
import { useSettings } from './hooks'

const NAV = [
  { to: '/', label: 'Přehled', icon: LayoutDashboard, end: true },
  { to: '/kalendar', label: 'Kalendář', icon: CalendarDays },
  { to: '/tridy', label: 'Třídy a skupiny', icon: School },
  { to: '/zaci', label: 'Žáci', icon: UserRound },
  { to: '/hodnoceni', label: 'Hodnocení', icon: ClipboardList },
  { to: '/zapisy', label: 'Zápisy z hodin', icon: BookOpenCheck },
  { to: '/dochazka', label: 'Docházka', icon: CalendarCheck },
  { to: '/plany', label: 'Tematické plány', icon: ListChecks },
  { to: '/rozvrh', label: 'Rozvrh', icon: Clock },
  { to: '/zasedaci', label: 'Zasedací pořádek', icon: Armchair },
  { to: '/tisk', label: 'Tisk pro rodiče', icon: Printer },
  { to: '/import', label: 'Import dat', icon: Upload },
  { to: '/nastaveni', label: 'Nastavení', icon: SettingsIcon },
]

export function Layout() {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex h-full">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-60 transform bg-blue-900 text-blue-100 transition-transform md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-blue-800">
          <Users size={22} />
          <div>
            <div className="font-bold text-white leading-tight">Pedagogický deník</div>
            <div className="text-xs text-blue-300">{settings?.schoolYear ?? ''}</div>
          </div>
        </div>
        <nav className="p-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-120px)]">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-blue-700 text-white font-medium' : 'hover:bg-blue-800 text-blue-100'}`}>
              <Icon size={17} /> {label}
            </NavLink>
          ))}
          <a href={settings?.skolaOnlineUrl || 'https://aplikace.skolaonline.cz'} target="_blank" rel="noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-blue-100 hover:bg-blue-800 mt-2 border-t border-blue-800 pt-3">
            <ExternalLink size={17} /> Škola online
          </a>
        </nav>
        {settings?.teacherName && <div className="absolute bottom-0 w-full px-4 py-3 text-xs text-blue-300 border-t border-blue-800">{settings.teacherName}</div>}
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
      <main className="flex-1 overflow-y-auto">
        <div className="md:hidden no-print flex items-center gap-2 bg-blue-900 text-white px-3 py-2">
          <button onClick={() => setOpen(true)} aria-label="Menu"><Menu /></button>
          <span className="font-semibold">Pedagogický deník</span>
        </div>
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
