// Material Symbols icon (font loaded in index.html)
interface Props {
  name:       string
  className?: string
  fill?:      boolean
  size?:      number
}

export default function Icon({ name, className = '', fill = false, size }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`icon ${fill ? 'icon-fill' : ''} ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  )
}
