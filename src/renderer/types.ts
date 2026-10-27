import type { AlarmCatalog, ConfigIssue, Control, Machine, ToolLibrary } from '@core/index'

// Shapes shared by the window's modules, kept apart from bundled.ts (which needs Vite to load the files).

export interface Program {
  name: string
  /** File path on the desktop; the file name (or "example:…") in the browser. */
  path: string
  text: string
}

export interface BundledConfigs {
  machines: Machine[]
  controls: Control[]
  library: ToolLibrary | null
  libraries: ToolLibrary[]
  alarmCatalogs: AlarmCatalog[]
  issues: ConfigIssue[]
}
