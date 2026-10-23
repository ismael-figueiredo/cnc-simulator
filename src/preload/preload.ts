import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type CncApi } from './api'

/** Listens to a main-process event and returns the unsubscribe function. */
function subscribe(channel: string, listener: (...args: never[]) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...(args as never[]))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CncApi = {
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  saveFile: (file, saveAs) => ipcRenderer.invoke(CHANNELS.saveFile, file, saveAs),
  saveProject: (request, saveAs) => ipcRenderer.invoke(CHANNELS.saveProject, request, saveAs),
  listLibraries: () => ipcRenderer.invoke(CHANNELS.listLibraries),
  saveLibrary: (id, json) => ipcRenderer.invoke(CHANNELS.saveLibrary, id, json),
  deleteLibrary: (id) => ipcRenderer.invoke(CHANNELS.deleteLibrary, id),
  setDirty: (dirty) => ipcRenderer.invoke(CHANNELS.setDirty, dirty),
  onMenuCommand: (listener) => subscribe(CHANNELS.menuCommand, listener),
  listRecent: () => ipcRenderer.invoke(CHANNELS.listRecent),
  openRecent: (path) => ipcRenderer.invoke(CHANNELS.openRecent, path),
  removeRecent: (path) => ipcRenderer.invoke(CHANNELS.removeRecent, path),
  onRecentChanged: (listener) => subscribe(CHANNELS.recentChanged, listener),
  onShowStart: (listener) => subscribe(CHANNELS.showStart, listener),
  setLanguage: (lang) => ipcRenderer.invoke(CHANNELS.setLanguage, lang),
  onLanguageChanged: (listener) => subscribe(CHANNELS.languageChanged, listener),
  onFileOpened: (listener) => subscribe(CHANNELS.fileOpened, listener),
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
