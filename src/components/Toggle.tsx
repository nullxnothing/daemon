interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

const styles = {
  sm: {
    width: 28,
    height: 16,
    knob: 12,
    offset: 2,
    travel: 12,
  },
  md: {
    width: 36,
    height: 20,
    knob: 16,
    offset: 2,
    travel: 16,
  },
} as const

export function Toggle({ checked, onChange, size = 'sm', disabled = false }: ToggleProps) {
  const s = styles[size]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onChange(!checked)
    }
  }

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={handleKeyDown}
      style={{
        width: s.width,
        height: s.height,
        background: checked ? 'var(--green)' : 'var(--s4)',
        borderRadius: s.height / 2,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: s.offset,
          left: s.offset,
          width: s.knob,
          height: s.knob,
          background: 'var(--t1)',
          borderRadius: '50%',
          transition: 'transform 0.15s',
          transform: checked ? `translateX(${s.travel}px)` : 'translateX(0)',
        }}
      />
    </div>
  )
}
