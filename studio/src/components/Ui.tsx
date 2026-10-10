import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

/* Small shared pieces: toasts, status badges, the not-set-up state. */

const ToastContext = createContext<(msg: string) => void>(() => undefined)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 3600)
  }, [])
  const value = useMemo(() => show, [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={'toast' + (msg ? ' on' : '')} role="status" aria-live="polite">
        {msg}
      </div>
    </ToastContext.Provider>
  )
}

export function NotSetUp() {
  return (
    <div className="empty">
      <strong>Nobody is set up yet</strong>
      Answer five short questions and the studio sets itself up. <a href="#/welcome">Start</a>
    </div>
  )
}

export function Initial({ name }: { name?: string | null }) {
  return (
    <span className="av" aria-hidden="true">
      {(name || '?').trim().charAt(0)}
    </span>
  )
}

/* Theme: System (follows the OS), Light or Dark — remembered in this browser. */
export type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'studio-theme'

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, t)
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const pick = (t: Theme) => {
    applyTheme(t)
    setTheme(t)
  }
  const options: [Theme, string, ReactNode][] = [
    ['system', 'Match system', <Monitor key="s" size={14} />],
    ['light', 'Light', <Sun key="l" size={14} />],
    ['dark', 'Dark', <Moon key="d" size={14} />],
  ]
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {options.map(([t, label, icon]) => (
        <button key={t} type="button" aria-pressed={theme === t} aria-label={label} title={label} onClick={() => pick(t)}>
          {icon}
        </button>
      ))}
    </div>
  )
}
