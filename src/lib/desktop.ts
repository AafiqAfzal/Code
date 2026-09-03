import { exportBackup } from './backup'

export const isDesktop = () => !!window.denik?.isDesktop

/** Jednou denně uloží zálohu do složky Dokumenty (jen v desktopové verzi). */
export async function runDailyAutoBackup(): Promise<string | null> {
  if (!window.denik) return null
  const today = new Date().toISOString().slice(0, 10)
  try {
    if (localStorage.getItem('lastAutoBackup') === today) return null
  } catch { /* localStorage nedostupné */ }
  const blob = await exportBackup()
  const file = await window.denik.autoBackup(await blob.text())
  try { localStorage.setItem('lastAutoBackup', today) } catch { /* ignore */ }
  return file
}

/** Okamžitá záloha bez ohledu na to, zda dnes už proběhla. */
export async function runDailyAutoBackupForce(): Promise<string | null> {
  if (!window.denik) return null
  const blob = await exportBackup()
  const file = await window.denik.autoBackup(await blob.text())
  try { localStorage.setItem('lastAutoBackup', new Date().toISOString().slice(0, 10)) } catch { /* ignore */ }
  return file
}

export async function saveBackupAs(): Promise<string | null> {
  if (!window.denik) return null
  const blob = await exportBackup()
  return window.denik.saveBackupAs(await blob.text())
}
