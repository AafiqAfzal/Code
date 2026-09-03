// Bezpečný most mezi aplikací v okně a hlavním procesem.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('denik', {
  isDesktop: true,
  autoBackup: (json) => ipcRenderer.invoke('backup:auto', json),
  saveBackupAs: (json) => ipcRenderer.invoke('backup:save-as', json),
  backupDir: () => ipcRenderer.invoke('backup:dir'),
  openBackupDir: () => ipcRenderer.invoke('backup:open-dir'),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  version: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  updateState: () => ipcRenderer.invoke('update:state'),
  onUpdateState: (handler) => {
    const listener = (_e, state) => handler(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
  onMenu: (channel, handler) => {
    const listener = () => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
