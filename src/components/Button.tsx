import './Button.css'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({ variant = 'default', size = 'sm', className, ...props }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`}
      {...props}
    />
  )
}
