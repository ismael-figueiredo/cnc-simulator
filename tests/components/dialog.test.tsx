import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../../src/renderer/components/Dialog'
import { StockEditor } from '../../src/renderer/components/StockEditor'
import { renderApp } from './render'

afterEach(cleanup)

describe('Dialog', () => {
  it('is a labelled modal dialog that takes the focus and closes with Esc', () => {
    const onClose = vi.fn()
    renderApp(
      <Dialog title="Stock" className="stock-editor" footer={<button>OK</button>} onClose={onClose}>
        <p>body</p>
      </Dialog>
    )
    const dialog = screen.getByRole('dialog', { name: 'Stock' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes on a click outside only when asked to', () => {
    const onClose = vi.fn()
    const { rerender } = renderApp(
      <Dialog title="Keys" className="shortcuts" footer={null} onClose={onClose}>
        <p>body</p>
      </Dialog>
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    rerender(
      <Dialog title="Keys" className="shortcuts" footer={null} onClose={onClose} closeOnBackdrop>
        <p>body</p>
      </Dialog>
    )
    fireEvent.click(screen.getByText('body'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('StockEditor', () => {
  const props = { machineDefault: null, fromProgram: null, workOffsets: ['G54', 'G55'], onClose: () => undefined }

  it('applies the edited block', () => {
    const onApply = vi.fn()
    renderApp(<StockEditor {...props} stock={{ shape: 'block', x: 100, y: 80, z: 30 }} lathe={false} onApply={onApply} />)
    const [x] = screen.getAllByRole('spinbutton')
    fireEvent.change(x as HTMLElement, { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ shape: 'block', x: 120, y: 80, z: 30 }))
  })

  it('does not apply a stock with an empty size', () => {
    renderApp(<StockEditor {...props} stock={{ shape: 'cylinder', diameter: 50, length: 80 }} lathe onApply={() => undefined} />)
    const [diameter] = screen.getAllByRole('spinbutton')
    fireEvent.change(diameter as HTMLElement, { target: { value: '' } })
    expect(screen.getByRole('button', { name: /apply/i }).hasAttribute('disabled')).toBe(true)
  })
})
