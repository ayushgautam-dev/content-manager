import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { useAskContext } from '../components/Ask'
import { href } from '../lib/route'
import { dayKeyIn, safeTz } from '../lib/time'
import { asJson, firstName, type Spark } from '../lib/types'
import { NotSetUp, useToast } from '../components/Ui'
import { Caution, FORMAT_LABEL, PageHead, Writing } from '../components/Bits'
import { Brief, withBrief } from '../components/Brief'
import { VoiceCard } from '../components/VoiceCard'

/* The front page answers one question: what should this person post next?
   Each idea is one post, already angled. One button writes it. */

const FROM: Record<string, string> = { sources: 'From your sources', world: 'From the news', you: 'From your own story' }
const FILTERS: { key: string; label: string; streams: string[] | null }[] = [
  { key: 'all', label: 'All', streams: null },
  { key: 'sources', label: 'From your sources', streams: ['sources'] },
  { key: 'world', label: 'From the news', streams: ['world'] },
  { key: 'you', label: 'Your own stories', streams: ['you'] },
]

export function Ideas() {
  const { me, sparks, items, sources, update, loaded } = usePod()
  const { jobs, ask: run } = usePending()
  const toast = useToast()
  const [filter, setFilter] = useState('all')
  const [briefFor, setBriefFor] = useState<Spark | null>(null)
  const first = firstName(me)
  useAskContext('the post ideas', [
    { label: 'Which one should we post?', prompt: 'Look at the current post ideas and say which one to post first, and why. Then write it.' },
    { label: 'Pair a source with the news', prompt: 'Find an unused item from my sources that connects to a story in the news and write the post that pairs them.' },
  ])
  const fromLabel = (s: Spark) => {
    if (s.stream !== 'sources') return FROM[s.stream] || s.stream
    const item = items.find((i) => i.id === s.item_id)
    const src = item && sources.find((x) => x.id === item.source_id)
    return src ? `From a ${src.noun_singular}` : FROM.sources
  }

  const mine = sparks.filter((s) => me && s.owner_handle === me.handle)
  const day = mine.reduce((d, s) => (s.day > d ? s.day : d), '')
  const ideas = mine.filter((s) => s.day === day && s.status !== 'dismissed').sort((a, b) => (b.score || 0) - (a.score || 0))
  const f = FILTERS.find((x) => x.key === filter)!
  const shown = ideas.filter((s) => !f.streams || f.streams.includes(s.stream))
  const today = dayKeyIn(new Date(), safeTz(me?.timezone))
  const finding = jobs['radar:' + today]
  const when = !day ? '' : day === today ? 'this morning' : 'on ' + new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const find = () => void run('radar:' + today, 'Finding new ideas', '[daily-radar] Someone asked for fresh ideas from Studio. Run the radar as your instruction describes. Nobody is watching: never ask anyone anything.', 'scout')

  if (loaded && !me) return <NotSetUp />
  return (
    <div className="page narrow">
      <PageHead
        kicker={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`What should ${first} post?`}
        action={
          <button type="button" className="btn" disabled={!!finding} onClick={find}>
            <RefreshCw size={15} className={finding ? 'spin' : ''} /> {finding ? 'Finding ideas…' : 'Find new ideas'}
          </button>
        }
      >
        {ideas.length ? `${ideas.length} ideas, found ${when}.` : null}
      </PageHead>
      {finding ? (
        <p className="writing">
          <span className="pulse" aria-hidden="true" />
          <span>
            <strong>Finding ideas.</strong> About ten minutes; you can leave this page.
          </span>
        </p>
      ) : null}

      {ideas.length ? (
        <>
          <div className="filters" role="group" aria-label="Where the idea comes from">
            {FILTERS.map((x) => {
              const n = ideas.filter((s) => !x.streams || x.streams.includes(s.stream)).length
              if (!n && x.key !== 'all') return null
              return (
                <button key={x.key} type="button" aria-pressed={filter === x.key} onClick={() => setFilter(x.key)}>
                  {x.label} <span className="num muted">{n}</span>
                </button>
              )
            })}
          </div>
          <div className="stack">
            {shown.map((s, i) => (
              <IdeaCard
                key={s.id}
                s={s}
                lead={i === 0 && filter === 'all'}
                caution={items.find((p) => p.id === s.item_id)?.limits_note}
                from={fromLabel(s)}
                job={jobs['spark:' + s.id]}
                onWrite={() => setBriefFor(s)}
                onDismiss={() => {
                  void update('sparks', s.id, { status: 'dismissed' })
                  toast('Removed.')
                }}
              />
            ))}
          </div>
        </>
      ) : !finding ? (
        <div className="empty quiet">
          <strong>No ideas yet</strong>
          Press <b>Find new ideas</b>: about five arrive in ten minutes, from your sources and the news.
        </div>
      ) : null}
      {me ? <VoiceCard me={me} /> : null}
      {briefFor ? (
        <Brief
          about={briefFor.hook || briefFor.angle}
          kind={fromLabel(briefFor).toLowerCase()}
          founder={first}
          onClose={() => setBriefFor(null)}
          onWrite={(format, brief) => {
            void run('spark:' + briefFor.id, 'Writing a post', withBrief(`[app-draft] spark ${briefFor.id}`, format, brief))
            setBriefFor(null)
          }}
        />
      ) : null}
    </div>
  )
}

function IdeaCard({ s, lead, caution, from, job, onWrite, onDismiss }: { s: Spark; lead: boolean; caution?: string | null; from: string; job?: { since: string; key: string; label: string }; onWrite: () => void; onDismiss: () => void }) {
  const evidence = (asJson<{ label?: string; url?: string; source?: string }[]>(s.evidence, []) || []).filter((e) => e.url).slice(0, 3)
  return (
    <article className={'item' + (lead ? ' lead' : '')}>
      <p className="item-top">
        <span className="kicker">{from}</span>
        {s.format ? <span className="muted">{FORMAT_LABEL[s.format] || s.format}</span> : null}
      </p>
      <h2 className="item-title">{s.hook || s.angle}</h2>
      {s.hook ? <p className="item-body">{s.angle}</p> : null}
      {s.why_now && s.why_now.toLowerCase() !== 'evergreen' ? (
        <p className="item-note">
          <b>Why now.</b> {s.why_now}
        </p>
      ) : null}
      <Caution text={caution} label="The limits" />
      {evidence.length ? (
        <p className="item-links">
          {evidence.map((e, i) => (
            <a key={i} href={e.url} target="_blank" rel="noopener noreferrer">
              {e.label || e.source || 'Source'} ↗
            </a>
          ))}
        </p>
      ) : null}
      {s.status === 'drafted' && s.draft_id ? (
        <div className="row item-actions">
          <a className="btn" href={href.drafts(s.draft_id)}>
            Open the draft →
          </a>
        </div>
      ) : job ? (
        <Writing job={job} />
      ) : (
        <div className="row item-actions">
          <button type="button" className="btn primary" onClick={onWrite}>
            Write this post
          </button>
          <button type="button" className="btn ghost" onClick={onDismiss}>
            Not for us
          </button>
        </div>
      )}
    </article>
  )
}
