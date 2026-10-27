import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Player } from '../../src/renderer/components/Player'
import { renderApp } from './render'

afterEach(cleanup)

const panel = { singleBlock: false, optionalStop: false, blockSkip: false, feed: 100, rapid: 100, spindle: 100 }
const base = { time: 10, total: 60, playing: false, speed: 20, disabled: false, runDisabled: false, panel, onSeek: () => undefined, onTogglePlay: () => undefined, onStep: () => undefined, onSpeed: () => undefined, onPanel: () => undefined }

describe('Player', () => {
  it('runs, steps, goes to the end and back to RESET', () => {
    const onTogglePlay = vi.fn()
    const onStep = vi.fn()
    const onSeek = vi.fn()
    renderApp(<Player {...base} onTogglePlay={onTogglePlay} onStep={onStep} onSeek={onSeek} />)
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    fireEvent.click(screen.getByRole('button', { name: /forward|next/i }))
    fireEvent.click(screen.getByRole('button', { name: /end/i }))
    fireEvent.click(screen.getByRole('button', { name: 'RESET' }))
    expect(onTogglePlay).toHaveBeenCalledOnce()
    expect(onStep).toHaveBeenCalledWith(1)
    expect(onSeek.mock.calls).toEqual([[60], [0]])
  })

  it('cannot run in EDIT, and the panel keys toggle single block', () => {
    const onPanel = vi.fn()
    renderApp(<Player {...base} runDisabled onPanel={onPanel} />)
    const run = screen.getAllByRole('button').find((b) => b.classList.contains('play'))
    expect(run?.hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { pressed: false, name: /single block/i }))
    expect(onPanel).toHaveBeenCalledWith({ singleBlock: true })
  })

  it('leaves RESET to the operator panel on the machine screen', () => {
    renderApp(<Player {...base} simOnly />)
    expect(screen.queryByRole('button', { name: 'RESET' })).toBeNull()
  })
})
