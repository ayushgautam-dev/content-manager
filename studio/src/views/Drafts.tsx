import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Download as DownloadIcon } from 'lucide-react'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { useAskContext } from '../components/Ask'
import { LinkedInPost } from '../components/LinkedInPost'
import { useFileUrl } from '../lib/files'
import { go, href } from '../lib/route'
import { ago, liStamp } from '../lib/time'
import { asJson, firstName, slidesOf, type Draft } from '../lib/types'
import { NotSetUp, useToast } from '../components/Ui'
import { Caution, PageHead } from '../components/Bits'

/* Drafts: read the post as LinkedIn will show it, check it, ask for changes,
   approve. Three steps down the right-hand side, in the order you do them. */

const GROUPS: { label: string; statuses: string[] }[] = [
  { label: 'Needs your review', statuses: ['ready'] },
  { label: 'Being written', statuses: ['drafting'] },
  { label: 'Approved, ready to post', statuses: ['approved', 'posting'] },
  { label: 'Posted', statuses: ['posted'] },
  { label: 'Removed', statuses: ['killed', 'failed'] },
]
const QUICK: [string, string][] = [
  ['Shorter', 'Make it about a third shorter without losing the specifics.'],
  ['Stronger first line', 'Give it a stronger first line. Change only the opening.'],
  ['Less of a pitch', 'Cut or soften anything about our company so it reads less like a pitch.'],
  ['New image', 'Design a different image for this post.'],
  ['Turn into a carousel', 'Turn this into a carousel: design and render the slides, and shorten the post text to a few lines.'],
]

export function Drafts({ id }: { id?: string }) {
  const { drafts, me, loaded } = usePod()
  const { jobs } = usePending()
  const current = drafts.find((d) => d.id === id) || null
  const writing = Object.values(jobs).filter((j) => /^(spark|item|trend|note|idea):/.test(j.key))
  useEffect(() => {
    if (!id && loaded && drafts.length) go(href.drafts((drafts.find((d) => d.status === 'ready') || drafts[0]).id))
  }, [id, loaded, drafts])

  if (loaded && !me) return <NotSetUp />
  if (loaded && !drafts.length && !writing.length)
    return (
      <div className="page narrow">
        <PageHead title="Drafts">Posts the writer has drafted land here for you to read, change and approve.</PageHead>
        <div className="empty">
          <strong>No drafts yet</strong>
          Pick an idea on <a href={href.ideas()}>Ideas</a>, something from your sources or the news, or press New post.
        </div>
      </div>
    )
  return (
    <div className="drafts">
      <aside className="drafts-list" aria-label="Drafts">
        {writing.map((j) => (
          <div key={j.key} className="li-row writing-row">
            <span className="pulse" aria-hidden="true" />
            <span className="lt">Writing a new post…</span>
            <span className="lm">{ago(j.since)}</span>
          </div>
        ))}
        {GROUPS.map((g) => {
          const list = drafts.filter((d) => g.statuses.includes(d.status))
          if (!list.length) return null
          return (
            <section key={g.label}>
              <h3 className="group-h">
                {g.label} <span className="num">{list.length}</span>
              </h3>
              {list.map((d) => (
                <a key={d.id} className="li-row" href={href.drafts(d.id)} aria-current={d.id === id ? 'true' : undefined}>
                  <span className={'dot ' + d.status} aria-hidden="true" />
                  <span className="lt">{d.title || 'Untitled'}</span>
                  <span className="lm">{ago(d.updated_at)}</span>
                </a>
              ))}
            </section>
          )
        })}
      </aside>
      {current ? (
        <Review key={current.id} draft={current} />
      ) : (
        <div className="empty">
          <strong>{writing.length ? 'The writer is working on it' : 'Pick a draft'}</strong>
          {writing.length ? 'A post with its image takes about five to eight minutes. It appears here by itself.' : 'Choose one from the list.'}
        </div>
      )}
    </div>
  )
}

function Review({ draft }: { draft: Draft }) {
  const { me, items, update, patchLocal } = usePod()
  const { jobs, ask: askWriter } = usePending()
  const toast = useToast()
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [change, setChange] = useState('')
  const [postedUrl, setPostedUrl] = useState('')
  const [removing, setRemoving] = useState(false)
  const [why, setWhy] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  const job = jobs['draft:' + draft.id]
  const slides = slidesOf(draft)
  const first = firstName(me)
  const sources = (asJson<{ label?: string; url?: string }[]>(draft.sources, []) || []).filter((s) => s.label || s.url)
  const item = items.find((p) => p.id === draft.item_id)
  const open = draft.status === 'ready' || draft.status === 'drafting'
  const editable = open || draft.status === 'approved'

  useAskContext(`draft “${draft.title}” (id ${draft.id})`, [
    { label: 'Check the claims', prompt: 'Check every factual claim in this draft against its sources, the honesty rules and any sector rules. List anything a careful reader would push back on.' },
    { label: 'Three other first lines', prompt: 'Suggest three different first lines for this draft in my voice. Just list them.' },
  ])

  /* Text saves as you type. Editing an approved post sends it back to review. */
  const saveBody = useCallback(
    (body: string) => {
      patchLocal('drafts', draft.id, { body })
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        const patch: Record<string, unknown> = { body }
        if (draft.status === 'approved') {
          patch.status = 'ready'
          toast('Edited, so it’s back in review.')
        }
        void update('drafts', draft.id, patch).catch(() => toast('Couldn’t save your edit. Check your connection.'))
      }, 700)
    },
    [draft.id, draft.status, patchLocal, update, toast],
  )
  const request = (text: string, label = 'Making your change') => {
    void update('drafts', draft.id, { request: text })
    void askWriter('draft:' + draft.id, label, `[app-edit] draft ${draft.id}: ${text}`)
    setChange('')
  }
  const author = { name: me?.linkedin_name || me?.display_name || me?.handle || 'You', headline: me?.linkedin_headline || null, avatar: me ? `/people/${me.handle}/headshot.jpg` : null }
  const STATUS: Record<string, [string, string]> = {
    drafting: ['', 'Being written'], ready: ['wait', 'Needs your review'], approved: ['live', 'Approved'], posting: ['live', 'Approved'],
    posted: ['live', 'Posted'], killed: ['', 'Removed'], failed: ['bad', 'Failed'],
  }
  const [cls, label] = STATUS[draft.status] || ['', draft.status]

  return (
    <section className="editor" aria-label="Draft">
      <div className="editor-main">
        <div className="editor-top">
          <h1 className="draft-title">{draft.title}</h1>
          <span className={'badge ' + cls}>{label}</span>
        </div>
        <div className="toolbar">
          <span className="muted small grow">
            {editable ? 'This is how it will look on LinkedIn. Click the text to edit it.' : 'This is how it looks on LinkedIn.'}
            {slides.length > 1 ? ` ${slides.length} slides: swipe through them.` : ''}
          </span>
          <div className="seg" role="group" aria-label="Preview as">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
              Desktop
            </button>
            <button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>
              Phone
            </button>
          </div>
        </div>
        {job ? (
          <p className="writing">
            <span className="pulse" aria-hidden="true" />
            <span>
              <strong>The writer is making your change</strong> (asked {ago(job.since)}). This page updates by itself, usually within a few minutes.
            </span>
          </p>
        ) : null}
        {draft.error ? <div className="notice wait">{draft.error}</div> : null}
        <div className={'li-stage li-stage-' + device}>
          <LinkedInPost
            author={author}
            stamp={draft.status === 'posted' ? liStamp(draft.updated_at) : 'now'}
            body={draft.body || ''}
            editable={editable}
            onBody={saveBody}
            device={device}
            counts={null}
            media={{ kind: slides.length > 1 ? 'document' : slides.length ? 'images' : 'none', paths: slides, title: draft.title }}
            placeholder="Write the post here, or ask the writer."
          />
        </div>
      </div>

      <aside className="editor-side rsteps">
        <section className="rstep">
          <h3>
            <b>1</b> Check it
          </h3>
          {sources.length ? (
            <>
              <p className="muted small">Every claim should trace to one of these.</p>
              <ul className="src-list">
                {sources.map((x, i) => (
                  <li key={i}>
                    {x.url ? (
                      <a href={x.url} target="_blank" rel="noopener noreferrer">
                        {x.label || x.url} ↗
                      </a>
                    ) : (
                      x.label
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="notice wait">The writer listed no sources. Check each claim by hand.</p>
          )}
          <Caution text={item?.limits_note} label="The limits" />
        </section>

        {editable ? (
          <section className="rstep">
            <h3>
              <b>2</b> Change anything
            </h3>
            <p className="muted small">Edit the text directly, or tell the writer.</p>
            <textarea className="box" rows={3} value={change} onChange={(e) => setChange(e.target.value)} placeholder="e.g. Open with the number. Drop the last question." aria-label="What to change" />
            <button type="button" className="btn block" disabled={!!job || change.trim().length < 4} onClick={() => request(change.trim())}>
              Ask the writer
            </button>
            <div className="chips">
              {QUICK.filter(([l]) => !(l === 'Turn into a carousel' && draft.format === 'carousel')).map(([l, p]) => (
                <button key={l} type="button" disabled={!!job} onClick={() => request(p, l)}>
                  {l}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rstep">
          <h3>
            <b>{editable ? 3 : 2}</b> {draft.status === 'approved' ? 'Post it' : draft.status === 'posted' ? 'Posted' : open ? 'Approve' : 'Removed'}
          </h3>
          {open ? (
            <>
              <button
                type="button"
                className="btn primary block"
                disabled={!!job || !(draft.body || '').trim()}
                onClick={() => void update('drafts', draft.id, { status: 'approved', approved_at: new Date().toISOString(), error: null }).then(() => toast('Approved. Nothing is posted until ' + first + ' posts it.'))}
              >
                <Check size={16} /> Approve
              </button>
              <p className="muted small">Approving posts nothing; it marks the draft as checked. When a post makes a claim in a regulated field, have someone qualified read it first.</p>
            </>
          ) : draft.status === 'approved' ? (
            <>
              <p className="small">Copy the text, download the {slides.length > 1 ? 'carousel' : 'image'}, and post it from {first}’s LinkedIn.</p>
              <button type="button" className="btn block" onClick={() => void navigator.clipboard.writeText(draft.body || '').then(() => toast('Post text copied.'))}>
                <Copy size={15} /> Copy the text
              </button>
              {slides.length > 1 && draft.pdf_path ? <FileButton path={draft.pdf_path} label="Download the carousel (PDF)" /> : null}
              {slides.length === 1 ? <FileButton path={slides[0]} label="Download the image" /> : null}
              <input className="box" value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} placeholder="Paste the LinkedIn link once it’s live" aria-label="LinkedIn post link" />
              <button
                type="button"
                className="btn primary block"
                disabled={!/^https:\/\/(www\.)?linkedin\.com\//.test(postedUrl.trim())}
                onClick={() => void update('drafts', draft.id, { status: 'posted', posted_url: postedUrl.trim() }).then(() => toast('Marked as posted.'))}
              >
                Mark as posted
              </button>
              <button type="button" className="btn ghost block" onClick={() => void update('drafts', draft.id, { status: 'ready' }).then(() => toast('Back in review.'))}>
                Not ready after all
              </button>
            </>
          ) : draft.status === 'posted' ? (
            draft.posted_url ? (
              <a className="btn block" href={draft.posted_url} target="_blank" rel="noopener noreferrer">
                Open on LinkedIn ↗
              </a>
            ) : (
              <p className="muted small">Marked as posted.</p>
            )
          ) : (
            <>
              <p className="muted small">{draft.kill_reason ? `Reason: ${draft.kill_reason}` : 'No reason given.'}</p>
              <button type="button" className="btn" onClick={() => void update('drafts', draft.id, { status: 'ready', kill_reason: null }).then(() => toast('Back in review.'))}>
                Bring it back
              </button>
            </>
          )}
        </section>

        {editable ? (
          <section className="rstep quiet">
            {removing ? (
              <>
                <input className="box" autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? The writer learns from it (optional)" aria-label="Why remove this draft" />
                <div className="row">
                  <button type="button" className="btn danger" onClick={() => void update('drafts', draft.id, { status: 'killed', kill_reason: why.trim() || null }).then(() => toast('Removed.' + (why.trim() ? ' The writer will learn from that.' : '')))}>
                    Remove it
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setRemoving(false)}>
                    Keep it
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => setRemoving(true)}>
                Remove this draft
              </button>
            )}
          </section>
        ) : null}
      </aside>
    </section>
  )
}

function FileButton({ path, label }: { path: string; label: string }) {
  const { url } = useFileUrl(path)
  return url ? (
    <a className="btn block" href={url} download target="_blank" rel="noopener noreferrer">
      <DownloadIcon size={15} /> {label}
    </a>
  ) : (
    <span className="btn block" aria-disabled="true">
      {label}
    </span>
  )
}
