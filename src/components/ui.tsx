import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} mt-8`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="card-title">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Zavřít"><X size={16} /></button>
        </div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="card card-body text-center text-sm text-slate-500">{children}</div>
}

/** Tlačítko, které při prvním kliknutí požádá o potvrzení. */
export function ConfirmButton({ onConfirm, children, className = 'btn-danger btn-sm', confirmLabel = 'Opravdu?' }: { onConfirm: () => void; children: ReactNode; className?: string; confirmLabel?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={className}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm() } else setArmed(true)
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

export function Badge({ children, className = 'bg-slate-100 text-slate-700', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <span className={`badge ${className}`} style={style}>{children}</span>
}

/** Barevný štítek s automatickou barvou textu z hex pozadí. */
export function ColorDot({ color, size = 10 }: { color?: string; size?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color ?? '#94a3b8' }} />
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="fixed bottom-4 right-4 z-50 rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{message}</div>
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const show = (m: string) => {
    setMessage(m)
    setTimeout(() => setMessage(null), 2500)
  }
  return { message, show }
}
