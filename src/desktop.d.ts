/** Rozhraní dostupné jen v desktopové verzi (Tauri), viz src/lib/tauriBridge.ts */
interface DenikDesktop {
  isDesktop: true
  autoBackup: (json: string) => Promise<string>
  saveBackupAs: (json: string) => Promise<string | null>
  backupDir: () => Promise<string>
  openBackupDir: () => Promise<void>
  notify: (title: string, body: string) => Promise<boolean>
  version: () => Promise<string>
  checkForUpdates: () => Promise<UpdateState>
  updateState: () => Promise<UpdateState>
  onUpdateState: (handler: (state: UpdateState) => void) => () => void
  onMenu: (channel: 'menu:backup-save-as', handler: () => void) => () => void
  /** Seznam záloh ve složce Dokumenty (nejnovější první) – jen Tauri */
  listBackups?: () => Promise<string[]>
  readBackup?: (name: string) => Promise<string>
  openExternal?: (url: string) => Promise<void>
}
interface UpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'up-to-date' | 'ready' | 'error' | 'dev'
  version: string | null
  error: string | null
}
interface Window {
  denik?: DenikDesktop
}
