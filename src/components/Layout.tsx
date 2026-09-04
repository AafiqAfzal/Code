import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, School, Users, UserRound, ClipboardList, BookOpenCheck, ListChecks, Clock, Settings as SettingsIcon, Menu, CalendarCheck } from 'lucide-react'
import { useState } from 'react'
import { useSettings } from './hooks'
import { MiniCalendar } from './MiniCalendar'
import { StudentSearch } from './StudentSearch'

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; also?: string[] }
interface NavGroup { title?: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { items: [
    { to: '/', label: 'Přehled', icon: LayoutDashboard, end: true },
    { to: '/rozvrh', label: 'Rozvrh', icon: Clock, also: ['/kalendar'] },
  ] },
  { title: 'Žáci a třídy', items: [
    { to: '/zaci', label: 'Žáci', icon: UserRound, also: ['/tisk'] },
    { to: '/tridy', label: 'Třídy a skupiny', icon: School, also: ['/zasedaci'] },
  ] },
  { title: 'Výuka', items: [
    { to: '/hodnoceni', label: 'Hodnocení', icon: ClipboardList },
    { to: '/zapisy', label: 'Zápisy z hodin', icon: BookOpenCheck },
    { to: '/dochazka', label: 'Docházka', icon: CalendarCheck },
    { to: '/plany', label: 'Tematické plány', icon: ListChecks },
  ] },
  { items: [
    { to: '/nastaveni', label: 'Nastavení', icon: SettingsIcon, also: ['/import'] },
  ] },
]

export function Layout() {
  const settings = useSettings()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  return (
    <div className="flex h-full">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-60 transform flex-col bg-blue-900 text-blue-100 transition-transform md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-2 px-4 py-4 border-b border-blue-800">
          <Users size={22} />
          <div>
            <div className="font-bold text-white leading-tight">Pedagogický deník</div>
            <div className="text-xs text-blue-300">{settings?.schoolYear ?? ''}</div>
          </div>
        </div>
        <div className="px-2 pt-2"><StudentSearch onNavigate={() => setOpen(false)} /></div>
        <nav className="p-2 overflow-y-auto flex-1 min-h-0">
          {NAV.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-3 border-t border-blue-800 pt-2' : ''}>
              {group.title && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-400">{group.title}</div>}
              {group.items.map(({ to, label, icon: Icon, end, also }) => {
                const extra = also?.some((p) => pathname.startsWith(p)) ?? false
                return (
                  <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm ${isActive || extra ? 'bg-blue-700 text-white font-medium' : 'hover:bg-blue-800 text-blue-100'}`}>
                    <Icon size={17} /> {label}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="p-2 border-t border-blue-800"><MiniCalendar onNavigate={() => setOpen(false)} /></div>
        {settings?.teacherName && <div className="px-4 py-2 text-xs text-blue-300 border-t border-blue-800">{settings.teacherName}</div>}
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

/** Záložky Nastavení / Import dat nad obsahem obou stránek. */
export function SettingsTabs() {
  const { pathname } = useLocation()
  const tab = (to: string, label: string, active: boolean) => (
    <NavLink key={to} to={to} className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-blue-700 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{label}</NavLink>
  )
  return (
    <div className="mb-4 flex gap-2 no-print">
      {tab('/nastaveni', 'Nastavení', pathname.startsWith('/nastaveni'))}
      {tab('/import', 'Import dat', pathname.startsWith('/import'))}
    </div>
  )
}
