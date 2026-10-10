import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGuard, useCurrentUser } from 'lemma-sdk/react'
import { Plus } from 'lucide-react'
import { lemmaClient } from './lemma-client'
import { DataProvider, usePod } from './lib/data'
import { BrandProvider, useBrand } from './lib/theme'
import { firstName } from './lib/types'
import { PendingProvider, usePending } from './lib/pending'
import { href, useRoute, type Route } from './lib/route'
import { useFileUrl } from './lib/files'
import { AskProvider, ChatButton, ChatPage } from './components/Ask'
import { NewPost } from './components/NewPost'
import { ToastProvider, applyTheme, loadTheme, useToast } from './components/Ui'
import { Ideas } from './views/Ideas'
import { Source } from './views/Source'
import { Onboarding, Progress, useShowProgress } from './views/Onboarding'
import { News } from './views/News'
import { Drafts } from './views/Drafts'
import { Voice } from './views/Voice'
import './styles.css'

// Apply the saved theme before the first paint, so there's no flash.
applyTheme(loadTheme())

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })

function Mark() {
  const { logo, logoOnDark, company } = useBrand()
  if (!logo) return <span className="wordmark">{company || 'Content Studio'}</span>
  if (logoOnDark)
    return (
      <>
        <img className="logo light-only" src={logo} alt={company || 'Home'} />
        <img className="logo dark-only" src={logoOnDark} alt={company || 'Home'} />
      </>
    )
  return <img className="logo single" src={logo} alt={company || 'Home'} />
}

/* The section names scroll sideways when the window is narrow; fade the cut edge
   so a half word reads as "more this way", not as a bug. */
function useClipped() {
  const ref = useRef<HTMLElement>(null)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setClipped(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
  }, [])
  return { ref, clipped }
}

function Shell() {
  const route = useRoute()
  const tabs = useClipped()
  const { drafts, sparks, sources, items, founders, setup, me, active, pickFounder, loaded, errors, reload } = usePod()
  const { jobs } = usePending()
  const [newPost, setNewPost] = useState(false)
  const [showProgress, leaveProgress] = useShowProgress(me, setup)
  const mine = sparks.filter((s) => me && s.owner_handle === me.handle)
  const day = mine.reduce((d, s) => (s.day > d ? s.day : d), '')
  const ideas = mine.filter((s) => s.status === 'new' && s.day === day).length
  const waiting = drafts.filter((d) => d.status === 'ready').length
  const writing = Object.keys(jobs).filter((k) => /^(spark|item|trend|note|idea):/.test(k)).length
  const main: { page: Route['page']; label: string; to: string; count?: number; busy?: boolean }[] = [
    { page: 'ideas', label: 'Ideas', to: href.ideas(), count: ideas },
    { page: 'drafts', label: 'Drafts', to: href.drafts(), count: waiting, busy: writing > 0 },
  ]
  const tabs2: { key: string; label: string; to: string; current: boolean; count?: number }[] = [
    ...sources
      .filter((x) => x.active !== false && (!x.owner_handle || !me || x.owner_handle === me.handle))
      .sort((a, b) => (a.sort_order ?? 10) - (b.sort_order ?? 10) || a.tab_name.localeCompare(b.tab_name))
      .map((x) => ({
        key: x.id,
        label: x.tab_name,
        to: href.source(x.id),
        current: route.page === 'source' && route.id === x.id,
        count: items.filter((p) => p.source_id === x.id && (p.status === 'new' || p.status === 'sparked')).length,
      })),
    { key: 'news', label: 'News', to: href.news(), current: route.page === 'news' },
  ]
  const errs = Object.entries(errors).filter(([, v]) => v)
  // First visit: nobody set up yet, so the studio is the five questions.
  if (loaded && (route.page === 'welcome' || !founders.length)) return <Onboarding adding={founders.length > 0} />
  if (loaded && me && showProgress) return <Progress me={me} onLeave={leaveProgress} />
  return (
    <div className="app">
      <header className="top">
        <div className="bar">
          <a className="brand" href={href.ideas()} aria-label="Content Studio home">
            <Mark />
          </a>
          <nav ref={tabs.ref} className={'tabs' + (tabs.clipped ? ' clipped' : '')} aria-label="Pages">
            {main.map((n) => (
              <a key={n.page} href={n.to} aria-current={route.page === n.page ? 'page' : undefined}>
                {n.label}
                {n.busy ? <span className="pulse" aria-label="The writer is working" /> : n.count ? <span className="count">{n.count}</span> : null}
              </a>
            ))}
            <span className="tabs-label">Sources</span>
            {tabs2.map((n) => (
              <a key={n.key} href={n.to} aria-current={n.current ? 'page' : undefined}>
                {n.label}
                {n.count ? <span className="count">{n.count}</span> : null}
              </a>
            ))}
          </nav>
          <ChatButton onPage={route.page === 'chat'} />
          <button type="button" className="btn primary newpost-btn" onClick={() => setNewPost(true)}>
            <Plus size={16} /> New post
          </button>
          {active.length > 1 ? (
            <select className="box founder-pick" aria-label="Whose posts" value={me?.handle || ''} onChange={(e) => pickFounder(e.target.value)}>
              {active.map((f) => (
                <option key={f.handle} value={f.handle}>
                  {f.display_name || f.handle}
                </option>
              ))}
            </select>
          ) : null}
          <a className="me" href={href.voice()} aria-current={route.page === 'voice' ? 'page' : undefined} title="What the writer knows about you">
            <Headshot handle={me?.handle} name={me?.display_name || me?.handle} />
            <span className="lbl">{me ? `${firstName(me)}’s voice` : 'Set up'}</span>
          </a>
        </div>
      </header>
      <main className="main">
        {errs.map(([k, v]) => (
          <div key={k} className="notice bad">
            Couldn’t load {k}: {v}{' '}
            <button type="button" className="btn" onClick={() => void reload(k as never)}>
              Retry
            </button>
          </div>
        ))}
        {!loaded ? (
          <div className="page narrow">
            <div className="skel" style={{ height: 28, width: 220, margin: '8px 0 18px' }} />
            <div className="skel" style={{ height: 140, marginBottom: 24 }} />
            <div className="skel" style={{ height: 420 }} />
          </div>
        ) : route.page === 'chat' ? (
          <ChatPage />
        ) : route.page === 'drafts' ? (
          <Drafts id={route.id} />
        ) : route.page === 'source' ? (
          <Source id={route.id} />
        ) : route.page === 'news' ? (
          <News />
        ) : route.page === 'voice' ? (
          <Voice />
        ) : (
          <Ideas />
        )}
      </main>
      {newPost ? <NewPost onClose={() => setNewPost(false)} /> : null}
    </div>
  )
}

function Headshot({ handle, name }: { handle?: string; name?: string | null }) {
  const { url } = useFileUrl(handle ? `/people/${handle}/headshot.jpg` : null)
  return url ? <img className="av" src={url} alt="" /> : <span className="av">{(name || '·').charAt(0)}</span>
}

function WithUser() {
  const { user } = useCurrentUser({ client: lemmaClient })
  return (
    <DataProvider userId={user?.id ?? null}>
      <Branded>
        <ToastProvider>
          <Pending />
        </ToastProvider>
      </Branded>
    </DataProvider>
  )
}

function Branded({ children }: { children: React.ReactNode }) {
  const { setup } = usePod()
  return <BrandProvider setup={setup}>{children}</BrandProvider>
}

function Pending() {
  const toast = useToast()
  const route = useRoute()
  return (
    <PendingProvider onToast={toast}>
      <AskProvider fullPage={route.page === 'chat'}>
        <Shell />
      </AskProvider>
    </PendingProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGuard client={lemmaClient}>
        <WithUser />
      </AuthGuard>
    </QueryClientProvider>
  </React.StrictMode>,
)
