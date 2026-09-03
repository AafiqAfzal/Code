import type { Assessment, GradingScale } from '../db/schema'

/** Převod procent na známku podle škály. */
export function percentToGrade(percent: number, scale: GradingScale): number {
  const [g1, g2, g3, g4] = scale.thresholds
  if (percent >= g1) return 1
  if (percent >= g2) return 2
  if (percent >= g3) return 3
  if (percent >= g4) return 4
  return 5
}

/** Efektivní známka hodnocení – buď zadaná, nebo dopočtená z bodů. */
export function effectiveGrade(a: Assessment, scale: GradingScale): number | undefined {
  if (a.absent) return undefined
  if (a.grade != null) return a.grade
  if (a.points != null && a.maxPoints) return percentToGrade((a.points / a.maxPoints) * 100, scale)
  return undefined
}

export function percentOf(a: Assessment): number | undefined {
  if (a.points != null && a.maxPoints) return Math.round((a.points / a.maxPoints) * 1000) / 10
  return undefined
}

/** Vážený průměr; vrací undefined, když není z čeho počítat. */
export function weightedAverage(list: Assessment[], scale: GradingScale): number | undefined {
  let sum = 0
  let w = 0
  for (const a of list) {
    const g = effectiveGrade(a, scale)
    if (g == null) continue
    sum += g * a.weight
    w += a.weight
  }
  if (w === 0) return undefined
  return Math.round((sum / w) * 100) / 100
}

/** Návrh známky na vysvědčení z průměru (zaokrouhlení s hranicí .5 → horší známka dle běžné praxe .5 ↑). */
export function proposedGrade(avg: number | undefined): number | undefined {
  if (avg == null) return undefined
  return Math.min(5, Math.max(1, Math.round(avg)))
}

export const GRADE_COLORS: Record<number, string> = {
  1: 'bg-green-100 text-green-800 border-green-300',
  2: 'bg-lime-100 text-lime-800 border-lime-300',
  3: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  4: 'bg-orange-100 text-orange-800 border-orange-300',
  5: 'bg-red-100 text-red-800 border-red-300',
}

export function avgColor(avg?: number) {
  if (avg == null) return 'text-slate-400'
  if (avg < 1.5) return 'text-green-700'
  if (avg < 2.5) return 'text-lime-700'
  if (avg < 3.5) return 'text-yellow-700'
  if (avg < 4.5) return 'text-orange-700'
  return 'text-red-700'
}
