import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { href } from '../lib/route'
import { dayKeyIn, safeTz } from '../lib/time'
import { firstName, type Item } from '../lib/types'
import { NotSetUp } from '../components/Ui'
import { Caution, PageHead, Writing } from '../components/Bits'
import { Brief, withBrief } from '../components/Brief'

/* One page per source the person follows (studies, launches, rulings…): what the
   screener kept, a page at a time. The nouns come from the source row. */

const PER_PAGE = 8

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Source({ id }: { id: string }) {
  const { sources, items, queue, drafts, me, update, loaded } = usePod()
  const src = sources.find((s) => s.id === id)
  const one = src?.noun_singular || 'item'
  const many = src?.noun_plural || 'items'
  const rows = items.filter((p) => p.source_id === id)
  const counts = queue.filter((q) => q.source_id === id)
  const { jobs, ask: run } = usePending()
  const [showUsed, setShowUsed] = useState(false)
  const [sort, setSort] = useState<'newest' | 'strongest'>('newest')
  const [page, setPage] = useState(0)
  const [briefFor, setBriefFor] = useState<Item | null>(null)
  const first = firstName(me)
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const open = rows.filter((p) => p.status === 'new' || p.status === 'sparked')
  const used = rows.filter((p) => p.status === 'drafted' || p.status === 'skipped')
  const list = useMemo(() => {
    const rows = [...(showUsed ? used : open)]
    if (sort === 'strongest') rows.sort((a, b) => (b.quality_score || 0) + (b.relevance_score || 0) - ((a.quality_score || 0) + (a.relevance_score || 0)))
    return rows
  }, [showUsed, sort, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const current = Math.min(page, pages - 1)
  const shown = list.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)
  useEffect(() => setPage(0), [showUsed, sort, id])
  const turn = (to: number) => {
    setPage(to)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const count = (status: string) => counts.filter((q) => q.status === status).reduce((n, q) => n + Number(q.n || 0), 0)
  const waiting = count('pending')
  const rejected = count('rejected')
  const today = dayKeyIn(new Date(), safeTz(me?.timezone))
  const checking = jobs['items:' + id + ':' + today]
  const check = () =>
    void run('items:' + id + ':' + today, `Checking for new ${many}`, `[fetch-items] source ${id} days 3. Someone asked for new ${many} from Studio. Fetch and screen everything pending for this source, as your instruction describes. Nobody is watching: never ask anyone anything.`, 'screener')

  if (loaded && !me) return <NotSetUp />
  if (loaded && !src) return <div className="empty"><strong>This source is gone</strong>It was removed or switched off. Ask the writer to bring it back.</div>
  return (
    <div className="page narrow">
      <PageHead
        kicker={`Source · new ${many}`}
        title={src?.tab_name || 'Source'}
        action={
          <button type="button" className="btn" disabled={!!checking} onClick={check}>
            <RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Checking…' : `Check for new ${many}`}
          </button>
        }
      >
        {src?.look_for ? src.look_for.replace(/\.?$/, '. ') : ''}Each one is read and scored first; only those worth a post are shown here
        {rejected ? ` (${rejected} others were set aside)` : ''}. To change what’s watched, tell the writer.
      </PageHead>
      {checking || waiting ? (
        <p className="writing">
          <span className="pulse" aria-hidden="true" />
          <span>
            <strong>{waiting ? `${waiting} new ${waiting === 1 ? one + ' is' : many + ' are'} being read.` : `Looking for new ${many}.`}</strong> They appear here as each one is scored; this takes a few minutes.
          </span>
        </p>
      ) : null}

      <div className="row between section-bar">
        <div className="filters" role="group" aria-label={`Which ${many}`}>
          <button type="button" aria-pressed={!showUsed} onClick={() => setShowUsed(false)}>
            Not used yet <span className="num muted">{open.length}</span>
          </button>
          <button type="button" aria-pressed={showUsed} onClick={() => setShowUsed(true)}>
            Used or hidden <span className="num muted">{used.length}</span>
          </button>
        </div>
        <div className="seg" role="group" aria-label="Order">
          <button type="button" aria-pressed={sort === 'newest'} onClick={() => setSort('newest')}>
            Newest
          </button>
          <button type="button" aria-pressed={sort === 'strongest'} onClick={() => setSort('strongest')}>
            Strongest
          </button>
        </div>
      </div>

      {shown.length ? (
        <>
          <div className="stack">
            {shown.map((p) => {
              const job = jobs['item:' + p.id]
              const draft = drafts.find((d) => d.item_id === p.id && d.status !== 'killed')
              return (
                <article key={p.id} className="item">
                  <p className="item-top">
                    <span className="kicker">{p.item_type || cap(one)}</span>
                    <span className="muted">{[p.publisher, p.published_at ? fmt(p.published_at) : ''].filter(Boolean).join(' · ')}</span>
                    <span className="grow" />
                    {p.quality_score != null ? (
                      <span className="score" title="How much it can be trusted and how much it says, out of 10">
                        Strength <b className="num">{p.quality_score}</b>/10
                      </span>
                    ) : null}
                  </p>
                  <h2 className="item-title">{p.headline || p.title}</h2>
                  {p.summary ? <p className="item-body">{p.summary}</p> : null}
                  <Caution text={p.limits_note} label="The limits" />
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
                      <button type="button" className="btn primary" onClick={() => setBriefFor(p)}>
                        Write a post
                      </button>
                      {p.url ? (
                        <a className="btn ghost" href={p.url} target="_blank" rel="noopener noreferrer">
                          Read the {one} ↗
                        </a>
                      ) : null}
                      <span className="grow" />
                      {p.status === 'skipped' ? (
                        <button type="button" className="btn ghost" onClick={() => void update('source_items', p.id, { status: 'new' })}>
                          Bring back
                        </button>
                      ) : (
                        <button type="button" className="btn ghost" onClick={() => void update('source_items', p.id, { status: 'skipped' })}>
                          Hide
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          {pages > 1 ? (
            <nav className="pager" aria-label="Pages">
              <button type="button" className="btn" disabled={current === 0} onClick={() => turn(current - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="muted">
                Page <b className="num">{current + 1}</b> of <span className="num">{pages}</span> · {list.length} {many}
              </span>
              <button type="button" className="btn" disabled={current >= pages - 1} onClick={() => turn(current + 1)}>
                Next <ChevronRight size={16} />
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <div className="empty">
          <strong>{showUsed ? 'Nothing used yet' : waiting || checking ? `Reading the new ${many}` : `No ${many} yet`}</strong>
          {showUsed ? `${cap(many)} you write about or hide move here.` : waiting || checking ? 'They will appear here in a few minutes.' : `Press “Check for new ${many}” to fetch the latest ones.`}
        </div>
      )}
      {briefFor ? (
        <Brief
          about={briefFor.headline || briefFor.title}
          kind={'from a ' + one}
          founder={first}
          onClose={() => setBriefFor(null)}
          onWrite={(format, brief) => {
            void run('item:' + briefFor.id, 'Writing a post', withBrief(`[app-draft] item ${briefFor.id} for ${me?.handle}`, format, brief))
            setBriefFor(null)
          }}
        />
      ) : null}
    </div>
  )
}
