// Profile accent themes — swap the --brand colour variables used across the app
export const THEMES = {
  scarlet: { label: 'Scarlet', brand: '229 9 20',   dark: '192 0 12',   light: '255 51 102',  soft: '255 180 170' },
  ocean:   { label: 'Ocean',   brand: '14 132 255', dark: '0 98 204',   light: '77 166 255',  soft: '170 210 255' },
  violet:  { label: 'Violet',  brand: '139 92 246', dark: '109 40 217', light: '167 139 250', soft: '221 214 254' },
  emerald: { label: 'Emerald', brand: '16 185 129', dark: '5 150 105',  light: '52 211 153',  soft: '167 243 208' },
  sunset:  { label: 'Sunset',  brand: '249 115 22', dark: '234 88 12',  light: '251 146 60',  soft: '254 215 170' },
  rose:    { label: 'Rose',    brand: '236 72 153', dark: '219 39 119', light: '244 114 182', soft: '251 207 232' },
} as const
export type ThemeName = keyof typeof THEMES

export function applyTheme(name?: string | null) {
  const t = THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : 'scarlet']
  const root = document.documentElement.style
  root.setProperty('--brand', t.brand)
  root.setProperty('--brand-dark', t.dark)
  root.setProperty('--brand-light', t.light)
  root.setProperty('--brand-soft', t.soft)
}
