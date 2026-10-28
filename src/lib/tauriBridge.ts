/**
 * Desktopová vrstva pro Tauri: poskytuje stejné rozhraní `window.denik`, jaké
 * dřív dodával Electron (zálohy do Dokumentů, oznámení, aktualizace).
 */
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { ask, save } from '@tauri-apps/plugin-dialog'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { openPath, openUrl } from '@tauri-apps/plugin-opener'
import { documentDir, join } from '@tauri-apps/api/path'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { exportBackup, hasUserData } from './backup'
import { todayISO } from './format'
import { backupStamp } from './desktop'

const APP_DIR = 'Pedagogický deník'
const BACKUP_DIR = `${APP_DIR}/zalohy`
const KEEP = 30

export const isTauri = () => '__TAURI_INTERNALS__' in window

async function ensureBackupDir() {
  if (!(await exists(BACKUP_DIR, { baseDir: BaseDirectory.Document }))) await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.Document, recursive: true })
}
/** Automatické denní zálohy (jen ty se po 30 kusech mažou; ruční a bezpečnostní zůstávají). */
const backupFileRe = /^pedagogicky-denik-\d{4}-\d{2}-\d{2}\.json$/

/** Zápis přes dočasný soubor a přejmenování – při pádu nebo plném disku zůstane stará záloha celá. */
async function writeBackupFile(name: string, json: string) {
  await ensureBackupDir()
  const tmp = `${BACKUP_DIR}/${name}.tmp`
  await writeTextFile(tmp, json, { baseDir: BaseDirectory.Document })
  try {
    await rename(tmp, `${BACKUP_DIR}/${name}`, { oldPathBaseDir: BaseDirectory.Document, newPathBaseDir: BaseDirectory.Document })
  } catch (e) {
    // pojistka: když přejmenování selže, zapsat postaru přímo (záloha nesmí zůstat neuložená)
    log(`rename failed, writing directly: ${String((e as Error)?.message ?? e)}`)
    await writeTextFile(`${BACKUP_DIR}/${name}`, json, { baseDir: BaseDirectory.Document })
    await remove(tmp, { baseDir: BaseDirectory.Document }).catch(() => {})
  }
}

/** Záloha teď (zavření okna, instalace aktualizace) – prázdnou databázi nezálohuje. */
async function backupNow(): Promise<string | null> {
  if (!window.denik || !(await hasUserData())) return null
  const blob = await exportBackup()
  return window.denik.autoBackup(await blob.text())
}

let updateState: UpdateState = { status: 'idle', version: null, error: null }
const updateListeners = new Set<(s: UpdateState) => void>()
const setUpdate = (s: UpdateState) => { updateState = s; updateListeners.forEach((l) => l(s)) }
let pending: Update | null = null

async function checkForUpdates(silent = true): Promise<UpdateState> {
  setUpdate({ status: 'checking', version: null, error: null })
  try {
    const upd = await check()
    if (!upd) { setUpdate({ status: 'up-to-date', version: await getVersion(), error: null }); return updateState }
    pending = upd
    // instalátor ve Windows ukončí aplikaci bez zálohy při zavření – zálohujeme předem
    try { await backupNow() } catch (e) { log(`backup before update failed: ${String((e as Error)?.message ?? e)}`) }
    setUpdate({ status: 'downloading', version: upd.version, error: null })
    await upd.downloadAndInstall()
    setUpdate({ status: 'ready', version: upd.version, error: null })
    const yes = await ask(`Nová verze ${upd.version} je připravena. Aplikace se restartuje a aktualizace se nainstaluje. Vaše data zůstanou zachována.`, { title: 'Aktualizace', okLabel: 'Restartovat nyní', cancelLabel: 'Později', kind: 'info' })
    if (yes) await relaunch()
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    setUpdate({ status: 'error', version: null, error: msg })
    if (!silent) console.error(e)
  }
  return updateState
}

const log = (msg: string) => { invoke('log_line', { msg }).catch(() => {}) }

export function installTauriBridge() {
  if (!isTauri()) return
  window.addEventListener('error', (e) => log(`error: ${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => log(`unhandled: ${String((e.reason as Error)?.stack ?? e.reason)}`))
  log('bridge installed')
  const denik: DenikDesktop = {
    isDesktop: true,
    autoBackup: async (json) => {
      log('autoBackup start')
      const name = `pedagogicky-denik-${todayISO()}.json`
      await writeBackupFile(name, json)
      // ponechat posledních 30 záloh
      const files = (await readDir(BACKUP_DIR, { baseDir: BaseDirectory.Document })).map((f) => f.name).filter((n): n is string => !!n && backupFileRe.test(n)).sort()
      for (const old of files.slice(0, Math.max(0, files.length - KEEP))) await remove(`${BACKUP_DIR}/${old}`, { baseDir: BaseDirectory.Document })
      const full = await join(await documentDir(), BACKUP_DIR, name)
      log(`autoBackup ok: ${full}`)
      return full
    },
    saveBackupAs: async (json) => {
      await ensureBackupDir()
      const dir = await join(await documentDir(), BACKUP_DIR)
      // jiný název než automatická záloha – ta by ruční zálohu při zavření aplikace přepsala
      const path = await save({ title: 'Uložit zálohu', defaultPath: await join(dir, `pedagogicky-denik-${backupStamp()}-rucni.json`), filters: [{ name: 'Záloha (JSON)', extensions: ['json'] }] })
      if (!path) return null
      await writeTextFile(path, json)
      return path
    },
    saveNamedBackup: async (name, json) => {
      await writeBackupFile(name, json)
      const full = await join(await documentDir(), BACKUP_DIR, name)
      log(`named backup ok: ${full}`)
      return full
    },
    backupDir: async () => join(await documentDir(), BACKUP_DIR),
    openBackupDir: async () => { await ensureBackupDir(); await openPath(await join(await documentDir(), BACKUP_DIR)) },
    listBackups: async () => {
      if (!(await exists(BACKUP_DIR, { baseDir: BaseDirectory.Document }))) return []
      return (await readDir(BACKUP_DIR, { baseDir: BaseDirectory.Document })).map((f) => f.name).filter((n): n is string => !!n && n.endsWith('.json')).sort().reverse()
    },
    readBackup: (name) => readTextFile(`${BACKUP_DIR}/${name}`, { baseDir: BaseDirectory.Document }),
    notify: async (title, body) => {
      let ok = await isPermissionGranted()
      if (!ok) ok = (await requestPermission()) === 'granted'
      if (ok) sendNotification({ title, body })
      return ok
    },
    version: () => getVersion(),
    checkForUpdates: () => checkForUpdates(false),
    updateState: async () => updateState,
    onUpdateState: (handler) => { updateListeners.add(handler); return () => { updateListeners.delete(handler) } },
    onMenu: () => () => {},
    openExternal: (url) => openUrl(url),
  }
  window.denik = denik
  // externí odkazy otevírat v systémovém prohlížeči
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="http"]') as HTMLAnchorElement | null
    if (a && a.target === '_blank') { e.preventDefault(); openUrl(a.href) }
  })
  // záloha do Dokumentů při každém zavření okna (nejvýše 8 s, pak se okno zavře i tak)
  let closing = false
  const win = getCurrentWindow()
  win.onCloseRequested(async (event) => {
    if (closing) return
    closing = true
    event.preventDefault()
    log('close requested, backing up')
    try {
      const backup = backupNow()
      await Promise.race([backup, new Promise((r) => setTimeout(r, 8000))])
    } catch (e) {
      log(`backup on close failed: ${String((e as Error)?.message ?? e)}`)
    }
    await win.destroy()
  }).catch((e) => log(`onCloseRequested failed: ${String(e)}`))
  // kontrola aktualizací po startu a každé 4 hodiny
  setTimeout(() => checkForUpdates(true), 4000)
  setInterval(() => checkForUpdates(true), 4 * 60 * 60 * 1000)
  void pending
}
