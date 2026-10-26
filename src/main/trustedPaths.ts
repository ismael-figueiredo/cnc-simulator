import { isAbsolute, resolve } from 'node:path'

/**
 * Files the user chose: picked in a dialog, opened from the recent list or saved to. Only these can
 * be read or overwritten without a dialog, so a path sent by the window is never trusted on its own.
 */
export function createTrustedPaths(isRecent: (path: string) => boolean) {
  const granted = new Set<string>()
  return {
    grant(path: string): void {
      if (isAbsolute(path)) granted.add(resolve(path))
    },
    has(path: string): boolean {
      if (!isAbsolute(path)) return false
      const full = resolve(path)
      return granted.has(full) || isRecent(full)
    }
  }
}

export type TrustedPaths = ReturnType<typeof createTrustedPaths>
