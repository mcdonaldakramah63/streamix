/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
        sans:    ['DM Sans', 'sans-serif'],
      },
      colors: {
        // Deep cinematic dark palette
        dark: {
          DEFAULT: '#07080c',
          surface: '#0e1018',
          card:    '#13161f',
          border:  '#1e2235',
          hover:   '#1a1e2e',
        },
        brand: {
          DEFAULT: '#14b8a6',
          dark:    '#0d9488',
          light:   '#2dd4bf',
          glow:    'rgba(20,184,166,0.15)',
        },
        // Premium accent
        gold: '#f59e0b',
      },
      backgroundImage: {
        'gradient-radial':  'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':   'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'card-gradient':    'linear-gradient(180deg, transparent 40%, rgba(7,8,12,0.97) 100%)',
        'hero-gradient':    'linear-gradient(to right, rgba(7,8,12,0.98) 0%, rgba(7,8,12,0.7) 50%, rgba(7,8,12,0.15) 100%)',
        'hero-bottom':      'linear-gradient(to top, rgba(7,8,12,1) 0%, transparent 60%)',
      },
      boxShadow: {
        'brand':   '0 0 30px rgba(20,184,166,0.2)',
        'brand-sm':'0 0 12px rgba(20,184,166,0.15)',
        'card':    '0 4px 24px rgba(0,0,0,0.5)',
        'deep':    '0 8px 48px rgba(0,0,0,0.7)',
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in':   'scaleIn 0.2s ease-out',
        'shimmer':    'shimmer 1.8s infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                      to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(20,184,166,0.1)' },
          '50%':      { boxShadow: '0 0 40px rgba(20,184,166,0.3)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
