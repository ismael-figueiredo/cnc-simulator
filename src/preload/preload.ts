import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type CncApi, type OpenedFile } from './api'

const api: CncApi = {
  openFile: () => ipcRenderer.invoke(CHANNELS.openFile),
  setLanguage: (lang) => ipcRenderer.invoke(CHANNELS.setLanguage, lang),
  onLanguageChanged: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, lang: string) => listener(lang)
    ipcRenderer.on(CHANNELS.languageChanged, handler)
    return () => ipcRenderer.removeListener(CHANNELS.languageChanged, handler)
  },
  onFileOpened: (listener) => {
    const handler = (_e: Electron.IpcRendererEvent, file: OpenedFile) => listener(file)
    ipcRenderer.on(CHANNELS.fileOpened, handler)
    return () => ipcRenderer.removeListener(CHANNELS.fileOpened, handler)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)
