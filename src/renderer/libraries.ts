import { useCallback, useEffect, useState } from 'react'
import { loadToolLibrary, type ToolLibrary } from '@core/index'
import { usePlatform } from './platform'

/** Files that no longer match the schema are skipped rather than breaking the list. */
const parseAll = (texts: string[]) =>
  texts.flatMap((text) => {
    const r = loadToolLibrary(text)
    return r.ok ? [r.value] : []
  })

/** The user's tool libraries, wherever the platform keeps them. */
export function useLibraries() {
  const platform = usePlatform()
  const [user, setUser] = useState<ToolLibrary[]>([])

  const refresh = useCallback(async () => setUser(parseAll(await platform.libraries.list())), [platform])
  useEffect(() => {
    void platform.libraries.list().then((texts) => setUser(parseAll(texts)))
  }, [platform])

  const save = useCallback(
    async (lib: ToolLibrary) => {
      await platform.libraries.save(lib.id, `${JSON.stringify(lib, null, 2)}\n`)
      await refresh()
    },
    [platform, refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await platform.libraries.remove(id)
      await refresh()
    },
    [platform, refresh]
  )

  return { user, save, remove }
}
