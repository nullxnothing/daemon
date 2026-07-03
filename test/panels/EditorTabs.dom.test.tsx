// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorTabs } from '../../src/panels/Editor/EditorTabs'

function StubIcon({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} />
}

function makeProps(overrides: Partial<Parameters<typeof EditorTabs>[0]> = {}) {
  return {
    toolTabs: Array.from({ length: 12 }, (_, i) => ({ id: `tool-${i}`, name: `Tool ${i}`, Icon: StubIcon })),
    activeToolId: 'tool-11',
    onSelectTool: vi.fn(),
    onCloseTool: vi.fn(),
    files: [],
    activeFilePath: null,
    savedFlash: null,
    onSelectFile: vi.fn(),
    onCloseFile: vi.fn(),
    browserTabOpen: false,
    browserTabActive: false,
    onBrowserTabClick: vi.fn(),
    dashboardTabOpen: false,
    dashboardTabActive: false,
    onDashboardTabClick: vi.fn(),
    ...overrides,
  }
}

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollIntoView,
  })
})

afterEach(() => {
  delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

function fakeOverflow(el: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth })
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: scrollLeft })
}

describe('EditorTabs overflow handling', () => {
  it('scrolls the active tab into view so a newly opened panel is never hidden', () => {
    const { rerender } = render(<EditorTabs {...makeProps()} />)
    scrollIntoView.mockClear()

    rerender(<EditorTabs {...makeProps({ activeToolId: 'tool-5' })} />)

    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('shows scroll affordances only when the strip overflows', () => {
    const { container } = render(<EditorTabs {...makeProps()} />)
    const strip = container.querySelector<HTMLElement>('.editor-tabs')!

    expect(screen.queryByLabelText('Scroll tabs right')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Scroll tabs left')).not.toBeInTheDocument()

    fakeOverflow(strip, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 })
    fireEvent.scroll(strip)

    expect(screen.getByLabelText('Scroll tabs right')).toBeEnabled()
    expect(screen.getByLabelText('Scroll tabs left')).toBeDisabled()

    fakeOverflow(strip, { scrollWidth: 900, clientWidth: 300, scrollLeft: 600 })
    fireEvent.scroll(strip)

    expect(screen.getByLabelText('Scroll tabs left')).toBeEnabled()
    expect(screen.getByLabelText('Scroll tabs right')).toBeDisabled()
  })

  it('scroll buttons move the strip', () => {
    const { container } = render(<EditorTabs {...makeProps()} />)
    const strip = container.querySelector<HTMLElement>('.editor-tabs')!
    const scrollBy = vi.fn()
    ;(strip as HTMLElement & { scrollBy: typeof scrollBy }).scrollBy = scrollBy

    fakeOverflow(strip, { scrollWidth: 900, clientWidth: 300, scrollLeft: 100 })
    fireEvent.scroll(strip)

    fireEvent.click(screen.getByLabelText('Scroll tabs right'))
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 160 }))

    fireEvent.click(screen.getByLabelText('Scroll tabs left'))
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: -160 }))
  })
})
