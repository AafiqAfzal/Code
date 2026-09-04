import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useClasses, useStudents } from './hooks'
import { fullName } from '../lib/format'

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Rychlé hledání žáka v levém menu: psaní příjmení, Enter nebo klik otevře kartu. */
export function StudentSearch({ onNavigate }: { onNavigate?: () => void }) {
  const students = useStudents()
  const classes = useClasses()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const hits = q.trim().length >= 2 ? students.filter((s) => fold(`${s.lastName} ${s.firstName}`).includes(fold(q)) || fold(`${s.firstName} ${s.lastName}`).includes(fold(q))).slice(0, 8) : []
  useEffect(() => { setIdx(0) }, [q])
  // Ctrl+K / Ctrl+F zaměří hledání
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus() } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  const go = (id: number) => { navigate(`/zaci/${id}`); setQ(''); onNavigate?.(); ref.current?.blur() }
  return (
    <div className="relative">
      <Search size={14} className="absolute left-2.5 top-2 text-blue-300" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Najít žáka… (Ctrl+K)"
        className="w-full rounded-md bg-blue-800 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-blue-300 focus:bg-white focus:text-slate-800 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, hits.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
          if (e.key === 'Enter' && hits[idx]) go(hits[idx].id)
          if (e.key === 'Escape') setQ('')
        }} />
      {hits.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white text-slate-800 shadow-lg">
          {hits.map((s, i) => (
            <li key={s.id}>
              <button className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${i === idx ? 'bg-blue-100' : 'hover:bg-slate-50'}`} onMouseDown={(e) => { e.preventDefault(); go(s.id) }}>
                <span>{fullName(s)}</span><span className="text-xs text-slate-400">{classes.find((c) => c.id === s.classId)?.name ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-lg">Nikdo nenalezen.</div>}
    </div>
  )
}
