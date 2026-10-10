import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/* Before the writer starts: a chance to say how you want it written. Optional,
   one box, so pressing Write straight away still works. */

export type BriefFormat = 'auto' | 'image' | 'carousel' | 'text'
const FORMATS: [BriefFormat, string][] = [
  ['auto', 'Writer decides'],
  ['image', 'Post with an image'],
  ['carousel', 'Carousel'],
  ['text', 'Text only'],
]
const STARTERS = ['My view on this is…', 'Lead with what it means for our customers', 'Also look into…', 'Keep it short', 'Make it practical: what should a reader do?']

/** The text appended to a request so the writer sees the format and the brief. */
export function withBrief(request: string, format: BriefFormat, brief: string): string {
  const lines = [request]
  if (format !== 'auto') lines.push(`Format: ${format}${format === 'carousel' ? ' (design and render the slides; keep the post text to a few lines)' : ''}.`)
  if (brief.trim()) lines.push('Brief from the person:\n' + brief.trim())
  return lines.join('\n')
}

export function Brief({ about, kind, founder, onClose, onWrite }: { about: string; kind: string; founder: string; onClose: () => void; onWrite: (format: BriefFormat, brief: string) => void }) {
  const [format, setFormat] = useState<BriefFormat>('auto')
  const [brief, setBrief] = useState('')
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Write this post" onClick={onClose}>
      <div className="modal-card brief" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="min0">
            <p className="kicker">Write a post · {kind}</p>
            <h2>{about}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <label className="brief-label" htmlFor="brief-text">
          Anything the writer should know? <span className="muted">Optional</span>
        </label>
        <textarea
          id="brief-text"
          className="box brief-text"
          autoFocus
          rows={5}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={`${founder}’s own view, the angle to take, extra things to research and bring in, what to leave out…`}
        />
        <div className="chips">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => setBrief((b) => (b.trim() ? b.trimEnd() + '\n' : '') + s.replace(/…$/, ' '))}>
              {s}
            </button>
          ))}
        </div>
        <p className="brief-label">Format</p>
        <div className="seg brief-format" role="group" aria-label="Format">
          {FORMATS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={format === k} onClick={() => setFormat(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="row between brief-foot">
          <span className="muted small">Takes about five to ten minutes, longer if you asked for extra research. It lands in Drafts.</span>
          <button type="button" className="btn primary" onClick={() => onWrite(format, brief)}>
            Write it
          </button>
        </div>
      </div>
    </div>
  )
}
