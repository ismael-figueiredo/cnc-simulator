import { useCallback, useEffect, useState } from 'react'
import type { OpenedFile, RecentItem } from '../preload/api'
import { usePlatform } from './platform'

/** Recently opened files, newest first, as the platform keeps them. */
export function useRecent() {
  const platform = usePlatform()
  const [items, setItems] = useState<RecentItem[]>([])

  useEffect(() => {
    void platform.recent.list().then(setItems)
    return platform.recent.onChange(setItems)
  }, [platform])

  const open = useCallback((item: RecentItem): Promise<OpenedFile | null> => platform.recent.open(item), [platform])
  const remove = useCallback((item: RecentItem) => platform.recent.remove(item), [platform])
  const record = useCallback((file: OpenedFile) => platform.recent.record(file), [platform])

  return { items, open, remove, record }
}
