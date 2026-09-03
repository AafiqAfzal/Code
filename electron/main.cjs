// Hlavní proces Electronu – otevře okno s aplikací a obsluhuje zálohy do souborů.
const { app, BrowserWindow, Menu, ipcMain, shell, dialog, Notification } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { autoUpdater } = require('electron-updater')

const APP_NAME = 'Pedagogický deník'
const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER_URL

/** Složka pro automatické zálohy: Dokumenty\Pedagogický deník\zalohy */
function backupDir() {
  const dir = path.join(app.getPath('documents'), APP_NAME, 'zalohy')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    autoHideMenuBar: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  })
  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  // Externí odkazy (Škola online) otevírat v systémovém prohlížeči
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

function buildMenu(win) {
  const template = [
    {
      label: 'Soubor',
      submenu: [
        { label: 'Uložit zálohu jako…', accelerator: 'CmdOrCtrl+S', click: () => win.webContents.send('menu:backup-save-as') },
        { label: 'Otevřít složku záloh', click: () => shell.openPath(backupDir()) },
        { type: 'separator' },
        { label: 'Tisk', accelerator: 'CmdOrCtrl+P', click: () => win.webContents.print() },
        { type: 'separator' },
        { label: 'Ukončit', role: 'quit' },
      ],
    },
    {
      label: 'Zobrazení',
      submenu: [
        { label: 'Zvětšit', role: 'zoomIn' },
        { label: 'Zmenšit', role: 'zoomOut' },
        { label: 'Původní velikost', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Celá obrazovka', role: 'togglefullscreen' },
        { label: 'Obnovit', role: 'reload' },
      ],
    },
    {
      label: 'Nápověda',
      submenu: [
        { label: 'Škola online', click: () => shell.openExternal('https://aplikace.skolaonline.cz') },
        { label: 'Zkontrolovat aktualizace', click: () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); else dialog.showMessageBox(win, { message: 'Aktualizace fungují jen v nainstalované verzi.' }) } },
        { label: 'Vývojářské nástroje', role: 'toggleDevTools' },
        { label: 'O aplikaci', click: () => dialog.showMessageBox(win, { title: APP_NAME, message: APP_NAME, detail: `Verze ${app.getVersion()}\nData jsou uložena v: ${app.getPath('userData')}\nZálohy: ${backupDir()}` }) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// IPC: automatická záloha (volá renderer jednou denně)
ipcMain.handle('backup:auto', async (_e, json) => {
  const dir = backupDir()
  const date = new Date().toISOString().slice(0, 10)
  const file = path.join(dir, `pedagogicky-denik-${date}.json`)
  fs.writeFileSync(file, json, 'utf8')
  // ponechat posledních 30 záloh
  const files = fs.readdirSync(dir).filter((f) => /^pedagogicky-denik-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  for (const old of files.slice(0, Math.max(0, files.length - 30))) fs.unlinkSync(path.join(dir, old))
  return file
})

// IPC: uložit zálohu do souboru zvoleného uživatelem
ipcMain.handle('backup:save-as', async (e, json) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Uložit zálohu',
    defaultPath: path.join(backupDir(), `pedagogicky-denik-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'Záloha (JSON)', extensions: ['json'] }],
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, json, 'utf8')
  return filePath
})

ipcMain.handle('notify', (_e, title, body) => {
  if (!Notification.isSupported()) return false
  const n = new Notification({ title, body, icon: path.join(__dirname, '..', 'build', 'icon.png') })
  n.on('click', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus() } })
  n.show()
  return true
})
ipcMain.handle('backup:dir', () => backupDir())
ipcMain.handle('backup:open-dir', () => shell.openPath(backupDir()))

// ---------- Automatické aktualizace (GitHub Releases) ----------
let updateState = { status: 'idle', version: null, error: null }
function broadcast() { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('update:state', updateState) }
function setupUpdater() {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => { updateState = { status: 'checking', version: null, error: null }; broadcast() })
  autoUpdater.on('update-available', (info) => { updateState = { status: 'downloading', version: info.version, error: null }; broadcast() })
  autoUpdater.on('update-not-available', () => { updateState = { status: 'up-to-date', version: app.getVersion(), error: null }; broadcast() })
  autoUpdater.on('error', (err) => { updateState = { status: 'error', version: null, error: String(err?.message ?? err) }; broadcast() })
  autoUpdater.on('update-downloaded', async (info) => {
    updateState = { status: 'ready', version: info.version, error: null }; broadcast()
    const win = BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', title: 'Aktualizace', buttons: ['Restartovat a nainstalovat', 'Později'], defaultId: 0, cancelId: 1,
      message: `Nová verze ${info.version} je stažena.`,
      detail: 'Aplikace se restartuje a aktualizace se nainstaluje. Vaše data zůstanou zachována. Pokud zvolíte Později, nainstaluje se při příštím ukončení aplikace.',
    })
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall())
  })
  autoUpdater.checkForUpdates().catch(() => {})
  // znovu zkontrolovat každé 4 hodiny, pokud aplikace zůstane spuštěná
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000)
}
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { status: 'dev', version: app.getVersion(), error: null }
  try { await autoUpdater.checkForUpdates() } catch (e) { updateState = { status: 'error', version: null, error: String(e?.message ?? e) } }
  return updateState
})
ipcMain.handle('update:state', () => updateState)
ipcMain.handle('app:version', () => app.getVersion())

app.setName(APP_NAME)
app.whenReady().then(() => {
  const win = createWindow()
  buildMenu(win)
  setupUpdater()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
