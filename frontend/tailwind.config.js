/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#14b8a6', dark: '#0d9488' },
        dark:  { DEFAULT: '#06090f', surface: '#0d1117', card: '#161b27', border: '#1e2530' },
      },
      fontFamily: { sans: ['"DM Sans"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
