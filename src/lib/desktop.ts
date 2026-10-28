import { format } from 'date-fns'
import { downloadBlob, exportBackup, hasUserData, importBackup } from './backup'
import { todayISO } from './format'

export const isDesktop = () => !!window.denik?.isDesktop

/** Časové razítko do názvu souboru: 2026-10-28-1530 */
export const backupStamp = () => format(new Date(), 'yyyy-MM-dd-HHmm')

/**
 * Automatická záloha do Dokumentů (jen desktop). Prázdnou databázi nezálohuje –
 * po ztrátě dat by jinak přepsala poslední dobrou zálohu.
 */
async function autoBackupIfData(): Promise<string | null> {
  if (!window.denik) return null
  if (!(await hasUserData())) return null
  const blob = await exportBackup()
  return window.denik.autoBackup(await blob.text())
}

/** Jednou denně uloží zálohu do složky Dokumenty (jen v desktopové verzi). */
export async function runDailyAutoBackup(): Promise<string | null> {
  if (!window.denik) return null
  const today = todayISO()
  try {
    if (localStorage.getItem('lastAutoBackup') === today) return null
  } catch { /* localStorage nedostupné */ }
  const file = await autoBackupIfData()
  if (file) try { localStorage.setItem('lastAutoBackup', today) } catch { /* ignore */ }
  return file
}

/** Okamžitá záloha bez ohledu na to, zda dnes už proběhla. */
export async function runDailyAutoBackupForce(): Promise<string | null> {
  const file = await autoBackupIfData()
  if (file) try { localStorage.setItem('lastAutoBackup', todayISO()) } catch { /* ignore */ }
  return file
}

export async function saveBackupAs(): Promise<string | null> {
  if (!window.denik) return null
  const blob = await exportBackup()
  return window.denik.saveBackupAs(await blob.text())
}

/**
 * Bezpečnostní kopie před obnovou nebo velkou změnou. Ukládá se jako samostatný
 * soubor, který automatické mazání starých záloh nemaže. V prohlížeči se stáhne.
 */
export async function safetyBackup(label: string): Promise<string | null> {
  if (!(await hasUserData())) return null
  const blob = await exportBackup()
  const name = `pedagogicky-denik-${backupStamp()}-${label}.json`
  if (window.denik?.saveNamedBackup) return window.denik.saveNamedBackup(name, await blob.text())
  downloadBlob(blob, name)
  return name
}

/** Obnova ze zálohy: nejdřív uloží současný stav („pred-obnovou“), pak data nahradí. */
export async function restoreBackup(file: File): Promise<string | null> {
  const safety = await safetyBackup('pred-obnovou')
  await importBackup(file, 'replace')
  return safety
}
