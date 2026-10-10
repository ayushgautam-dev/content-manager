import { RefreshCw } from 'lucide-react'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { href } from '../lib/route'
import { ago, dayKeyIn, safeTz } from '../lib/time'
import { asJson, firstName } from '../lib/types'
import { NotSetUp } from '../components/Ui'
import { useState } from 'react'
import { PageHead, Writing } from '../components/Bits'
import { Brief, withBrief } from '../components/Brief'
import type { Trend } from '../lib/types'

/* News: the handful of stories in the person's field worth having a view on right
   now. The raw articles and the scanning stay behind the scenes; a story is what
   people act on. */

/** The first few sentences, so a long write-up still reads as a short brief. */
function short(text: string, sentences: number, max: number): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text]
  const out = parts.slice(0, sentences).join('').trim()
  return out.length > max ? out.slice(0, max).replace(/\s+\S*$/, '') + '…' : out
}

export function News() {
  const { trends, topics, drafts, me, loaded } = usePod()
  const { jobs, ask: run } = usePending()
  const first = firstName(me)
  const [briefFor, setBriefFor] = useState<Trend | null>(null)
  const day = trends.reduce((d, t) => (t.day > d ? t.day : d), '')
  const stories = trends.filter((t) => t.day === day && t.status !== 'archived').sort((a, b) => (b.heat || 0) - (a.heat || 0))
  const today = dayKeyIn(new Date(), safeTz(me?.timezone))
  const scanning = jobs['radar:' + today]
  const watching = topics.filter((t) => t.active !== false)
  const lastScan = watching.reduce((d, t) => (t.last_scanned_at && t.last_scanned_at > d ? t.last_scanned_at : d), '')

  if (loaded && !me) return <NotSetUp />
  return (
    <div className="page narrow">
      <PageHead
        kicker="Source · news"
        title="In the news"
        action={
          <button
            type="button"
            className="btn"
            disabled={!!scanning}
            onClick={() => void run('radar:' + today, 'Reading the news', '[daily-radar] Someone asked for a fresh scan from Studio. Run the radar as your instruction describes. Nobody is watching: never ask anyone anything.', 'scout')}
          >
            <RefreshCw size={15} className={scanning ? 'spin' : ''} /> {scanning ? 'Reading the news…' : 'Check the news again'}
          </button>
        }
      >
        The stories in your field worth a point of view right now. Pick one and it’s written as a post for you.
        {lastScan ? ` Last checked ${ago(lastScan)}.` : ''}
      </PageHead>
      {scanning ? (
        <p className="writing">
          <span className="pulse" aria-hidden="true" />
          <span>
            <strong>Reading the news.</strong> Stories appear here in about ten minutes; you can leave this page.
          </span>
        </p>
      ) : null}
      {stories.length ? (
        <div className="stack">
          {stories.map((t) => {
            const job = jobs['trend:' + t.id]
            const srcs = (asJson<{ source?: string; url?: string; title?: string }[]>(t.sources, []) || []).filter((s) => s.url).slice(0, 4)
            const draft = drafts.find((d) => d.trend_id === t.id && d.status !== 'killed')
            return (
              <article key={t.id} className="item">
                <p className="item-top">
                  <span className="kicker">{(t.heat || 0) >= 4 ? 'Big story' : (t.heat || 0) >= 3 ? 'Getting attention' : 'Worth knowing'}</span>
                  {t.status === 'fading' ? <span className="muted">fading</span> : null}
                </p>
                <h2 className="item-title">{t.title}</h2>
                {t.summary ? <p className="item-body">{short(t.summary, 2, 320)}</p> : null}
                {t.why_it_matters ? (
                  <p className="why">
                    <span className="kicker">Why it matters to you</span>
                    {short(t.why_it_matters, 1, 200)}
                  </p>
                ) : null}
                {srcs.length ? (
                  <p className="item-links">
                    {srcs.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title || s.source || 'Source'} ↗
                      </a>
                    ))}
                  </p>
                ) : null}
                {draft ? (
                  <div className="row item-actions">
                    <a className="btn" href={href.drafts(draft.id)}>
                      Open the draft →
                    </a>
                  </div>
                ) : job ? (
                  <Writing job={job} />
                ) : (
                  <div className="row item-actions">
                    <button type="button" className="btn primary" onClick={() => setBriefFor(t)}>
                      Write a post about this
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : !scanning ? (
        <div className="empty">
          <strong>No stories yet</strong>
          Press “Check the news again” and the scout reads today’s news in your field and picks the stories that matter to you.
        </div>
      ) : null}
      {briefFor ? (
        <Brief
          about={briefFor.title}
          kind="from the news"
          founder={first}
          onClose={() => setBriefFor(null)}
          onWrite={(format, brief) => {
            void run('trend:' + briefFor.id, 'Writing a post', withBrief(`[app-draft] trend ${briefFor.id} for ${me?.handle}`, format, brief))
            setBriefFor(null)
          }}
        />
      ) : null}
      {watching.length ? (
        <footer className="watching">
          <p className="kicker muted">What the scout watches</p>
          <p>{watching.map((t) => t.name).join(' · ')}</p>
          <p className="muted small">To follow something new or drop a topic, tell the writer.</p>
        </footer>
      ) : null}
    </div>
  )
}
