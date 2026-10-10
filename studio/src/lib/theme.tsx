import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { forgetFileUrls, readText, useImageUrl } from './files'
import type { SetupJob, Theme } from './types'

/* Studio wears the person's brand. The setup agent reads their website and writes
   /brand/theme.json (colours, fonts, logo); this applies it at load and again
   when the brand job finishes. Until then the neutral look in styles.css applies.
   Light mode takes the brand's colours as they are; dark mode keeps its own dark
   surfaces and borrows only the accent and the fonts, lightened to read on dark. */

const HEX = /^#[0-9a-f]{3,8}$/i
const FONT = /^[\w\s-]{1,60}$/

function css(theme: Theme): string {
  const c = theme.colors || {}
  const ok = (v?: string) => (v && HEX.test(v) ? v : undefined)
  const light: [string, string | undefined][] = [
    ['--paper', ok(c.bg)],
    ['--panel', ok(c.surface)],
    ['--ink', ok(c.ink)],
    ['--ink-2', ok(c.ink_2)],
    ['--muted', ok(c.muted)],
    ['--line', ok(c.line)],
    ['--accent', ok(c.accent)],
    ['--accent-ink', ok(c.accent_ink)],
    ['--accent-soft', ok(c.accent_soft)],
    ['--primary', ok(c.ink)],
    ['--primary-ink', ok(c.bg)],
  ]
  const lightVars = light.filter(([, v]) => v).map(([k, v]) => `${k}: ${v};`)
  if (ok(c.bg)) lightVars.push(`--sunk: color-mix(in srgb, ${c.bg} 92%, ${ok(c.ink) || '#000'});`)
  if (ok(c.line)) lightVars.push(`--line-2: color-mix(in srgb, ${c.line} 70%, ${ok(c.ink) || '#000'});`)
  const fonts: string[] = []
  if (theme.fonts?.body && FONT.test(theme.fonts.body)) fonts.push(`--font: '${theme.fonts.body}', system-ui, -apple-system, sans-serif;`)
  if (theme.fonts?.display && FONT.test(theme.fonts.display)) fonts.push(`--serif: '${theme.fonts.display}', Georgia, serif;`)
  const dark: string[] = []
  if (ok(c.accent)) {
    dark.push(`--accent: color-mix(in srgb, ${c.accent} 62%, #ffffff);`)
    dark.push(`--accent-ink: #0e0f12;`)
    dark.push(`--accent-soft: color-mix(in srgb, ${c.accent} 24%, #0e0f12);`)
  }
  const darkBlock = dark.join(' ')
  const lightBlock = lightVars.join(' ')
  // Light colours only where the page is light: the system says light and nobody
  // picked dark, or somebody picked light.
  return [
    `:root { ${fonts.join(' ')} }`,
    `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${lightBlock} } }`,
    `:root[data-theme="light"] { ${lightBlock} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${darkBlock} } }`,
    `:root[data-theme="dark"] { ${darkBlock} }`,
  ].join('\n')
}

function apply(theme: Theme | null) {
  const head = document.head
  let style = document.getElementById('brand-theme') as HTMLStyleElement | null
  let link = document.getElementById('brand-fonts') as HTMLLinkElement | null
  if (!theme || theme.is_default) {
    style?.remove()
    link?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = 'brand-theme'
    head.appendChild(style)
  }
  style.textContent = css(theme)
  const url = theme.fonts?.google_fonts_url
  if (url && url.startsWith('https://fonts.googleapis.com/')) {
    if (!link) {
      link = document.createElement('link')
      link.id = 'brand-fonts'
      link.rel = 'stylesheet'
      head.appendChild(link)
    }
    if (link.href !== url) link.href = url
  }
}

interface Ctx {
  theme: Theme | null
  logo: string | null
  logoOnDark: string | null
  company: string
}
const ThemeContext = createContext<Ctx>({ theme: null, logo: null, logoOnDark: null, company: '' })
export const useBrand = () => useContext(ThemeContext)

export function BrandProvider({ setup, children }: { setup: SetupJob[]; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme | null>(null)
  // Re-read when the brand job finishes, so Studio changes look as setup ends.
  const brandDone = setup.filter((j) => j.job === 'brand' && j.status === 'done').map((j) => j.finished_at || j.id).join('|')
  useEffect(() => {
    let alive = true
    if (brandDone) forgetFileUrls('/brand/')
    void readText('/brand/theme.json').then((text) => {
      if (!alive || !text) return
      try {
        const t = JSON.parse(text) as Theme
        setTheme(t)
        apply(t)
      } catch {
        /* a half-written file: keep the current look */
      }
    })
    return () => {
      alive = false
    }
  }, [brandDone])
  const logo = useImageUrl(theme ? theme.logo || null : null, brandDone)
  const logoOnDark = useImageUrl(theme?.logo_on_dark || null, brandDone)
  const value = useMemo(() => ({ theme, logo, logoOnDark, company: theme?.company_name || '' }), [theme, logo, logoOnDark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
