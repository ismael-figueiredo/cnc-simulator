import type { CncApi } from '../../preload/api'
import type { Platform } from './types'

/** The desktop app: everything goes through the main process (see src/main/main.ts). */
export function electronPlatform(api: CncApi): Platform {
  return {
    desktop: true,
    os: api.platform,
    openFile: () => api.openFile(),
    saveProgram: (file, saveAs) =>
      // The example and new programs have no file yet: always ask where to save
      api.saveFile(file, saveAs || !file.path || file.path.startsWith('example:')),
    saveProject: ({ project, projectPath, program }, saveAs) => api.saveProject({ project, projectPath: saveAs ? '' : (projectPath ?? ''), programPath: program.path }, saveAs),
    projectNeedsProgramFile: true,
    libraries: {
      list: () => api.listLibraries(),
      save: (id, json) => api.saveLibrary(id, json),
      remove: (id) => api.deleteLibrary(id)
    },
    recent: {
      list: () => api.listRecent(),
      open: (item) => api.openRecent(item.path),
      remove: async (item) => {
        await api.removeRecent(item.path)
      },
      record: () => undefined,
      onChange: (listener) => api.onRecentChanged(listener)
    },
    setDirty: (dirty) => void api.setDirty(dirty),
    setLanguage: (lang) => void api.setLanguage(lang),
    onLanguageChanged: (listener) => api.onLanguageChanged(listener),
    onMenuCommand: (listener) => api.onMenuCommand(listener),
    onFileOpened: (listener) => api.onFileOpened(listener),
    onShowStart: (listener) => api.onShowStart(listener)
  }
}
