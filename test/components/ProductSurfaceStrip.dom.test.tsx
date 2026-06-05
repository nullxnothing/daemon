// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductSurfaceStrip } from '../../src/components/ProductSurfaceStrip'
import { useUIStore } from '../../src/store/ui'

describe('ProductSurfaceStrip', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeWorkspaceToolId: null,
      dashboardTabActive: false,
      browserTabActive: false,
      drawerOpen: false,
      drawerTool: null,
    } as any)
  })

  it('shows current state instead of reopening the active target surface', () => {
    useUIStore.setState({ activeWorkspaceToolId: 'degentools' } as any)

    render(
      <ProductSurfaceStrip
        surfaceId="degentools"
        stateLabel="Connected"
        setupLabel="Ready"
        primaryLabel="Generate assets"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Generate assets' })).not.toBeInTheDocument()
    expect(screen.getByText('Viewing')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Integrations' })).toBeInTheDocument()
  })

  it('keeps custom primary actions available on the current surface', async () => {
    const onPrimary = vi.fn()
    useUIStore.setState({ activeWorkspaceToolId: 'meterflow' } as any)

    render(
      <ProductSurfaceStrip
        surfaceId="meterflow"
        stateLabel="Connected"
        setupLabel="Ready"
        primaryLabel="Test paid call"
        onPrimary={onPrimary}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Test paid call' }))

    expect(onPrimary).toHaveBeenCalledOnce()
  })
})
