import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDisplayOptions } from '../../src/renderer/useDisplayOptions'

beforeEach(() => localStorage.clear())

describe('display options', () => {
  it('shows everything at first, the finished part only when asked', () => {
    const { result } = renderHook(() => useDisplayOptions())
    expect(result.current.display).toMatchObject({ holding: true, vise: true, tailstock: true, finished: false })
  })

  it('keeps the choices for the next document, but not the finished part', () => {
    const first = renderHook(() => useDisplayOptions())
    act(() => first.result.current.changeDisplay({ tailstock: false, vise: false, finished: true }))
    expect(first.result.current.display).toMatchObject({ tailstock: false, vise: false, finished: true })
    const next = renderHook(() => useDisplayOptions())
    expect(next.result.current.display).toMatchObject({ tailstock: false, vise: false, holding: true, finished: false })
  })

  it('starts from the defaults when what was kept is unreadable', () => {
    localStorage.setItem('cncsim.display', '[1,2]')
    const { result } = renderHook(() => useDisplayOptions())
    expect(result.current.display.tailstock).toBe(true)
  })
})
