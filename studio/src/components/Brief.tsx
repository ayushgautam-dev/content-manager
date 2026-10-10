import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/* Before the writer starts: a chance to say how you want it written. Optional,
   one box, so pressing Write straight away still works. */

export type BriefFormat = 'auto' | 'image' | 'carousel' | 'text'
const FORMATS: [BriefFormat, string, string][] = [
  ['auto', 'Auto', 'The writer picks the format'],
  ['image', 'Image', 'A post with one image'],
  ['carousel', 'Carousel', 'A post with 5–8 slides'],
  ['text', 'Text', 'Text only'],
]
const STARTERS = ['My view is…', 'Keep it short', 'Also look into…']

/** The text appended to a request so the writer sees the format and the brief. */
export function withBrief(request: string, format: BriefFormat, brief: string): string {
  const lines = [request]
  if (format !== 'auto') lines.push(`Format: ${format}${format === 'carousel' ? ' (design and render the slides; keep the post text to a few lines)' : ''}.`)
  if (brief.trim()) lines.push('Brief from the person:\n' + brief.trim())
  return lines.join('\n')
}

export function Brief({ about, kind, onClose, onWrite }: { about: string; kind: string; founder?: string; onClose: () => void; onWrite: (format: BriefFormat, brief: string) => void }) {
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
        <textarea
          id="brief-text"
          className="box brief-text"
          autoFocus
          rows={3}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Anything to add? Your view, an angle, what to leave out. Optional."
          aria-label="Anything the writer should know (optional)"
        />
        <div className="chips brief-chips">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => setBrief((b) => (b.trim() ? b.trimEnd() + '\n' : '') + s.replace(/…$/, ' '))}>
              {s}
            </button>
          ))}
        </div>
        <div className="brief-foot">
          <div className="seg brief-format" role="group" aria-label="Format">
            {FORMATS.map(([k, l, title]) => (
              <button key={k} type="button" title={title} aria-pressed={format === k} onClick={() => setFormat(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="brief-go">
            <button type="button" className="btn primary" onClick={() => onWrite(format, brief)}>
              Write it
            </button>
            <span className="muted small">About 5–10 min · lands in Drafts</span>
          </div>
        </div>
      </div>
    </div>
  )
}
