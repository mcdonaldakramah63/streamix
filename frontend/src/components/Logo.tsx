// Streamix wordmark — prism mark + gradient type from the Stitch brand logo
interface Props {
  className?: string
  markOnly?:  boolean
}

export default function Logo({ className = '', markOnly = false }: Props) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 44 44" className="h-8 w-8 flex-shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="sx-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FF3366" />
            <stop offset="50%"  stopColor="#E50914" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <rect x="0.75" y="0.75" width="42.5" height="42.5" rx="12" fill="#141A26" stroke="#232B3E" strokeWidth="1.5" />
        <path d="M30 15.5c-1.6-1.7-4.2-2.5-7-2.5-4 0-7 2-7 5.2 0 7.3 14.5 3.6 14.5 10.7 0 3.3-3.1 5.6-7.6 5.6-3 0-5.8-1-7.5-2.9"
          stroke="url(#sx-grad)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <polygon points="20,19.5 25,22 20,24.5" fill="#F59E0B" />
      </svg>
      {!markOnly && (
        <span className="font-extrabold text-lg min-[360px]:text-xl tracking-tight leading-none text-white">
          STREAM<span className="text-gradient">IX</span>
        </span>
      )}
    </span>
  )
}
