/** @type {import('tailwindcss').Config} */
// Design tokens from the Stitch "Movie Stream Tracker" project — Obsidian Cinema system
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Obsidian surfaces
        dark: {
          DEFAULT: '#0f131c',  // surface
          void:    '#0a0e17',  // surface-container-lowest
          surface: '#181b25',  // surface-container-low
          card:    '#1c2029',  // surface-container
          border:  '#262a34',  // surface-container-high
          hover:   '#262a34',
          high:    '#31353f',  // surface-container-highest
        },
        // Neon scarlet — playback, primary actions, progress
        // Follows the profile's theme (CSS variables set in src/utils/theme.ts; scarlet by default)
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark:    'rgb(var(--brand-dark) / <alpha-value>)',
          light:   'rgb(var(--brand-light) / <alpha-value>)',
          soft:    'rgb(var(--brand-soft) / <alpha-value>)',
          glow:    'rgb(var(--brand) / 0.15)',
        },
        // Cinema gold — ratings, curation
        gold: '#f59e0b',
        // Ion cyan — downloads, telemetry, codec badges
        cyan: { DEFAULT: '#4cd7f6', deep: '#06b6d4' },
        ink: {
          DEFAULT: '#dfe2ef',  // on-surface
          muted:   '#94a3b8',
          faint:   '#64748b',
        },
      },
      fontSize: {
        'tech-pill': ['10px', { lineHeight: '12px', letterSpacing: '0.08em', fontWeight: '800' }],
        'label-sm':  ['11px', { lineHeight: '14px', letterSpacing: '0.06em', fontWeight: '700' }],
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(to right, rgba(10,14,23,0.95) 0%, rgba(10,14,23,0.6) 50%, rgba(10,14,23,0.1) 100%)',
        'hero-bottom':   'linear-gradient(to top, #0f131c 0%, transparent 60%)',
        'brand-grad':    'linear-gradient(135deg, rgb(var(--brand-light)) 0%, rgb(var(--brand)) 50%, #f59e0b 100%)',
      },
      boxShadow: {
        'brand':    '0 0 24px rgb(var(--brand) / 0.45)',
        'brand-sm': '0 0 12px rgb(var(--brand) / 0.35)',
        'cyan':     '0 0 16px rgba(6,182,212,0.4)',
        'card':     '0 4px 24px rgba(0,0,0,0.5)',
        'deep':     '0 12px 32px -8px rgba(0,0,0,0.8)',
        'focus':    '0 12px 32px -8px rgba(0,0,0,0.8), 0 0 24px -2px rgb(var(--brand) / 0.35)',
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in':   'scaleIn 0.2s ease-out',
        'shimmer':    'shimmer 1.8s infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
    },
  },
  plugins: [
    // phoneland: phones held sideways (short landscape screens) → video-first layouts.
    // A variant, not a screen: a raw screen would switch off Tailwind's max-* breakpoint variants.
    ({ addVariant }) => addVariant('phoneland', '@media (orientation: landscape) and (max-height: 500px)'),
  ],
}
