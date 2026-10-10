import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useFileUrl } from '../lib/files'

/* A LinkedIn feed post, drawn the way LinkedIn draws it: header, the text with
   "…more" after three lines, the media (LinkedIn's multi-image grid, or the PDF
   document viewer), the reaction counts, and the Like / Comment / Repost / Send bar.
   In `editable` mode the text is edited in place, inside the card, and the line
   where LinkedIn would cut it stays visible. */

export interface PostAuthor {
  name: string
  headline?: string | null
  avatar?: string | null
}

export interface PostMedia {
  kind: 'none' | 'images' | 'document'
  paths: string[]
  title?: string
}

interface Props {
  author: PostAuthor
  stamp: string
  body: string
  media: PostMedia
  device: 'desktop' | 'mobile'
  editable?: boolean
  onBody?: (text: string) => void
  counts?: { reactions?: number | null; comments?: number | null; reposts?: number | null } | null
  mediaOverlay?: ReactNode
  placeholder?: string
  /** An image served by LinkedIn itself (someone else's post). */
  externalImage?: string | null
  /** Show Like as already pressed (a like we propose). */
  liked?: boolean
  /** Rendered under the action bar, inside the card: a comment box. */
  footer?: ReactNode
  /** Someone else's post: no "• You". */
  others?: boolean
  /** Media drawn by the caller (someone else's post, loaded live from LinkedIn). */
  customMedia?: ReactNode
}

const LINE = 20 // LinkedIn's body line height, px
const FOLD_LINES = 3

export function LinkedInPost({ author, stamp, body, media, device, editable, onBody, counts, mediaOverlay, placeholder, externalImage, liked, footer, others, customMedia }: Props) {
  return (
    <article className={'li-card li-' + device} aria-label="LinkedIn post preview">
      <header className="li-head">
        <Avatar author={author} />
        <div className="li-who">
          <div className="li-name">
            {author.name} {others ? null : <span className="li-you">• You</span>}
          </div>
          {author.headline ? <div className="li-headline">{author.headline}</div> : null}
          <div className="li-meta">
            {stamp} • <Globe />
          </div>
        </div>
        <span className="li-more-dots" aria-hidden="true">
          <Dots />
        </span>
      </header>
      {editable ? (
        <EditableText value={body} onChange={onBody} placeholder={placeholder} />
      ) : (
        <ClampedText text={body} />
      )}
      {customMedia ? <div className="li-media">{customMedia}</div> : null}
      {externalImage ? (
        <div className="li-media">
          <img className="li-img li-ext" src={externalImage} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
        </div>
      ) : null}
      {media.kind !== 'none' && media.paths.length ? (
        <div className="li-media">
          {media.kind === 'document' ? <DocumentViewer paths={media.paths} title={media.title} /> : <ImageGrid paths={media.paths} />}
          {mediaOverlay}
        </div>
      ) : mediaOverlay ? (
        <div className="li-media li-media-empty">{mediaOverlay}</div>
      ) : null}
      {counts && (counts.reactions || counts.comments || counts.reposts) ? (
        <div className="li-counts">
          <span className="li-react-icons">
            <ReactIcon kind="like" />
            <ReactIcon kind="celebrate" />
            <ReactIcon kind="love" />
            <span className="li-count">{counts.reactions || 0}</span>
          </span>
          <span className="li-count">
            {[counts.comments ? `${counts.comments} comments` : '', counts.reposts ? `${counts.reposts} reposts` : ''].filter(Boolean).join(' • ')}
          </span>
        </div>
      ) : null}
      <footer className="li-actions">
        {(['Like', 'Comment', 'Repost', 'Send'] as const).map((a) => (
          <span key={a} className={'li-action' + (a === 'Like' && liked ? ' li-liked' : '')}>
            <ActionIcon kind={a} />
            <span>{a}</span>
          </span>
        ))}
      </footer>
      {footer}
    </article>
  )
}

/* ---------- text ---------- */

/** Hashtags and links in LinkedIn blue; everything else verbatim. */
function richText(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(#[A-Za-z][A-Za-z0-9_]*|https?:\/\/\S+)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <span key={k++} className="li-link">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function ClampedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setClamped(!open && el.scrollHeight > el.clientHeight + 2)
  }, [text, open])
  if (!text.trim()) return <div className="li-text li-empty">No text yet.</div>
  return (
    <div className="li-text-wrap">
      <div ref={ref} className={'li-text' + (open ? '' : ' li-clamp')}>
        {richText(text)}
      </div>
      {clamped ? (
        <button type="button" className="li-see-more" onClick={() => setOpen(true)}>
          …more
        </button>
      ) : null}
    </div>
  )
}

function EditableText({ value, onChange, placeholder }: { value: string; onChange?: (t: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(value)
  const focused = useRef(false)
  // Take outside changes (the writer revised it) unless the person is typing.
  useEffect(() => {
    if (!focused.current) setText(value)
  }, [value])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.max(el.scrollHeight, LINE * 4) + 'px'
  }, [text])
  const over = text.length > 3000
  return (
    <div className="li-text-wrap li-editing">
      <textarea
        ref={ref}
        className="li-text li-textarea"
        value={text}
        placeholder={placeholder || 'What do you want to talk about?'}
        aria-label="Post text"
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onChange={(e) => {
          setText(e.target.value)
          onChange?.(e.target.value)
        }}
      />
      {text.split('\n').length > FOLD_LINES || text.length > 150 ? (
        <div className="li-fold" style={{ top: 8 + LINE * FOLD_LINES }} aria-hidden="true" title="LinkedIn shows “…more” here" />
      ) : null}
      <div className={'li-charcount' + (over ? ' over' : '')}>{text.length.toLocaleString()} / 3,000</div>
    </div>
  )
}

/* ---------- media ---------- */

function Img({ path, className, alt }: { path: string; className?: string; alt?: string }) {
  const { url, failed } = useFileUrl(path)
  if (failed) return <div className={'li-img li-img-missing ' + (className || '')}>Image unavailable</div>
  return url ? <img className={'li-img ' + (className || '')} src={url} alt={alt || ''} draggable={false} /> : <div className={'li-img li-img-loading ' + (className || '')} />
}

/** LinkedIn's multi-image layout: one image alone; two side by side; three or more,
    the first large on top and up to three below, the last carrying "+N". */
function ImageGrid({ paths }: { paths: string[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const n = paths.length
  const shown = n <= 2 ? paths : paths.slice(0, 4)
  return (
    <>
      <div className={'li-grid li-grid-' + Math.min(n, 4)}>
        {shown.map((p, i) => (
          <button key={p + i} type="button" className="li-grid-cell" onClick={() => setLightbox(i)} aria-label={`Open image ${i + 1} of ${n}`}>
            <Img path={p} alt={`Image ${i + 1}`} />
            {i === 3 && n > 4 ? <span className="li-plus">+{n - 4}</span> : null}
          </button>
        ))}
      </div>
      {lightbox != null ? <Lightbox paths={paths} start={lightbox} onClose={() => setLightbox(null)} /> : null}
    </>
  )
}

function Lightbox({ paths, start, onClose }: { paths: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((x) => Math.min(paths.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [paths.length, onClose])
  return (
    <div className="li-lightbox" role="dialog" aria-modal="true" aria-label="Images" onClick={onClose}>
      <div className="li-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <Img path={paths[i]} alt={`Image ${i + 1}`} />
        <div className="li-lightbox-bar">
          <button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} aria-label="Previous">‹</button>
          <span>
            {i + 1} / {paths.length}
          </span>
          <button type="button" onClick={() => setI(Math.min(paths.length - 1, i + 1))} disabled={i === paths.length - 1} aria-label="Next">›</button>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
    </div>
  )
}

/** LinkedIn's document (PDF carousel) viewer: title bar, one page at a time, arrows,
    and the page counter. */
function DocumentViewer({ paths, title }: { paths: string[]; title?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [paths.join('|')])
  return (
    <div className="li-doc">
      <div className="li-doc-title">
        {title || 'Document'} <span>• {paths.length} pages</span>
      </div>
      <div className="li-doc-page">
        <Img path={paths[i]} alt={`Page ${i + 1}`} />
        {i > 0 ? (
          <button type="button" className="li-doc-arrow left" onClick={() => setI(i - 1)} aria-label="Previous page">
            ‹
          </button>
        ) : null}
        {i < paths.length - 1 ? (
          <button type="button" className="li-doc-arrow right" onClick={() => setI(i + 1)} aria-label="Next page">
            ›
          </button>
        ) : null}
      </div>
      <div className="li-doc-foot">
        <span>
          {i + 1} / {paths.length}
        </span>
        <span className="li-doc-progress">
          <span style={{ width: `${((i + 1) / paths.length) * 100}%` }} />
        </span>
      </div>
    </div>
  )
}

/* ---------- small pieces ---------- */

function Avatar({ author }: { author: PostAuthor }) {
  const [broken, setBroken] = useState(false)
  const live = author.avatar && /^https?:/.test(author.avatar) ? author.avatar : null
  const { url: podUrl } = useFileUrl(author.avatar && author.avatar.startsWith('/') ? author.avatar : null)
  const url = broken ? null : live || podUrl
  return url ? (
    <img className="li-avatar" src={url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    <span className="li-avatar li-avatar-initial" aria-hidden="true">
      {(author.name || '?').trim().charAt(0)}
    </span>
  )
}

function Globe() {
  return (
    <svg className="li-globe" viewBox="0 0 16 16" width="14" height="14" aria-label="Visible to anyone on or off LinkedIn">
      <path
        fill="currentColor"
        d="M8 1a7 7 0 107 7 7 7 0 00-7-7zM3 8a5 5 0 011-3l.55.55A1.5 1.5 0 015 6.62v1.07a.75.75 0 00.22.53l.56.56a.75.75 0 00.53.22H7v.69a.75.75 0 00.22.53l.56.56a.75.75 0 01.22.53V13a5 5 0 01-5-5zm6.24 4.83l2-2.46a.75.75 0 00.09-.8l-.58-1.16A.76.76 0 0010 8H7v-.19a.51.51 0 01.28-.45l.38-.19a.74.74 0 01.68 0L9 7.5l.38-.7a1 1 0 00.12-.48v-.85a.78.78 0 01.21-.53l1.07-1.09a5 5 0 01-1.54 9z"
      />
    </svg>
  )
}

function Dots() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M14 12a2 2 0 11-2-2 2 2 0 012 2zM4 10a2 2 0 102 2 2 2 0 00-2-2zm16 0a2 2 0 102 2 2 2 0 00-2-2z" />
    </svg>
  )
}

function ReactIcon({ kind }: { kind: 'like' | 'celebrate' | 'love' }) {
  const bg = { like: '#378fe9', celebrate: '#5f9b41', love: '#df704d' }[kind]
  const glyph = { like: '👍', celebrate: '👏', love: '❤' }[kind]
  return (
    <span className="li-react" style={{ background: bg }} aria-hidden="true">
      {glyph}
    </span>
  )
}

function ActionIcon({ kind }: { kind: 'Like' | 'Comment' | 'Repost' | 'Send' }) {
  const d = {
    Like: 'M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11zM19 19h-1l-.73.37a6.14 6.14 0 01-2.69.63H7.72a1 1 0 01-1-.72l-.25-.87-.85-.41A1 1 0 015 17l.17-1-.76-.74A1 1 0 014.27 14l.66-1.09-.73-1.1a.49.49 0 01.08-.7.48.48 0 01.34-.11h7.05l-1.31-3.92A7 7 0 0110 4.86V3.75a.77.77 0 01.75-.75.75.75 0 01.71.51L12 5a9 9 0 002.13 3.5l4.5 4.5H19z',
    Comment: 'M7 9h10v1H7zm0 4h7v-1H7zm16-2a6.78 6.78 0 01-2.84 5.61L12 22v-4H8A7 7 0 018 4h8a7 7 0 017 7zm-2 0a5 5 0 00-5-5H8a5 5 0 000 10h6v2.28L19 15a4.79 4.79 0 002-4z',
    Repost: 'M13.96 5H6c-.55 0-1 .45-1 1v10H3V6c0-1.66 1.34-3 3-3h7.96L12 0h2.37L17 4l-2.63 4H12l1.96-3zm5.04 3v10c0 .55-.45 1-1 1h-7.96L12 16H9.63L7 20l2.63 4H12l-1.96-3H18c1.66 0 3-1.34 3-3V8h-2z',
    Send: 'M21 3L0 10l7.66 4.26L16 8l-6.26 8.34L14 24l7-21z',
  }[kind]
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d={d} />
    </svg>
  )
}
