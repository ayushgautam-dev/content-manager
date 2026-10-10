import type { ReactNode } from 'react'
import { href } from '../lib/route'
import { ago } from '../lib/time'
import type { Job } from '../lib/pending'

/* Small pieces every page shares. */

/** What the page is, in one headline and one sentence, with at most one action. */
export function PageHead({ kicker, title, children, action }: { kicker?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <header className="phead">
      <div className="min0">
        {kicker ? <p className="kicker">{kicker}</p> : null}
        <h1 className="view">{title}</h1>
        {children ? <p className="lede">{children}</p> : null}
      </div>
      {action ? <div className="phead-action">{action}</div> : null}
    </header>
  )
}

/** Shown in place of a "write" button while the writer is working on that thing. */
export function Writing({ job }: { job: Job }) {
  return (
    <p className="writing">
      <span className="pulse" aria-hidden="true" />
      <span>
        <strong>The writer is on it</strong> (started {ago(job.since)}). A post with its image takes about five to eight minutes and lands in{' '}
        <a href={href.drafts()}>Drafts</a>.
      </span>
    </p>
  )
}

export function Caution({ text, label = 'Before you post' }: { text?: string | null; label?: string }) {
  if (!text) return null
  return (
    <p className="caution">
      <span className="kicker">{label}</span>
      {text}
    </p>
  )
}

export const FORMAT_LABEL: Record<string, string> = { image: 'Post with an image', carousel: 'Carousel', text: 'Text post', video: 'Video' }
