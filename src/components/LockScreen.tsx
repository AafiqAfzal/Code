import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { clearPin, verifyPin } from '../lib/pin'
import { importBackup } from '../lib/backup'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [forgot, setForgot] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = async () => {
    if (await verifyPin(pin)) onUnlock()
    else { setError('Nesprávný PIN.'); setPin(''); ref.current?.focus() }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-950">
      <div className="card w-full max-w-sm p-6 text-center">
        <Lock className="mx-auto mb-2 text-blue-800" size={32} />
        <h1 className="text-lg font-bold">Pedagogický deník je zamčený</h1>
        <p className="text-sm text-slate-500 mb-4">Zadejte PIN.</p>
        <input ref={ref} type="password" inputMode="numeric" autoComplete="off" className="input text-center text-2xl tracking-[0.5em]" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button className="btn-primary mt-4 w-full justify-center" onClick={submit}>Odemknout</button>
        <button className="mt-3 text-xs text-slate-400 hover:underline" onClick={() => setForgot(!forgot)}>Zapomněl jsem PIN</button>
        {forgot && (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-600">
            <p>PIN nelze obnovit. Můžete ale nahrát zálohu ze složky Dokumenty → Pedagogický deník → zalohy: data se obnoví ze zálohy a PIN se zruší.</p>
            <label className="btn-secondary btn-sm mt-2">Obnovit ze zálohy a zrušit PIN
              <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return
                try { await importBackup(f, 'replace'); await clearPin(); onUnlock() } catch (err) { setError((err as Error).message) }
              }} />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
