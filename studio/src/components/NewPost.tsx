import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { go, href } from '../lib/route'
import { useToast } from './Ui'
import { firstName } from '../lib/types'

/* Start a post that isn't on the ideas list: tell the writer what it should say. */
export function NewPost({ onClose }: { onClose: () => void }) {
  const { me, create } = usePod()
  const { ask } = usePending()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const first = firstName(me)
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="New post" onClick={onClose}>
      <div className="modal-card newpost" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>What should the post be about?</h2>
            <p className="muted">A story, something that happened at work this week, a link and what you think of it. A few lines is enough.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <textarea className="box np-text" autoFocus rows={7} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Last week a customer asked us to remove a feature, and it turned out to be the right call…" aria-label="What the post should be about" />
        <div className="row between">
          <button
            type="button"
            className="btn ghost"
            disabled={!me || busy}
            onClick={async () => {
              setBusy(true)
              try {
                const row = await create('drafts', { title: 'New post', body: note.trim(), status: 'drafting', format: 'text', source: 'manual' })
                onClose()
                go(href.drafts(String(row.id)))
              } catch (e) {
                toast('Couldn’t start a draft: ' + (e instanceof Error ? e.message : String(e)))
              } finally {
                setBusy(false)
              }
            }}
          >
            I’ll write it myself
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!me || note.trim().length < 15}
            onClick={() => {
              void ask('note:' + Date.now(), 'Writing a post', `[app-draft] note for ${me?.handle}: ${note.trim()}`)
              onClose()
              go(href.drafts())
            }}
          >
            Write it
          </button>
        </div>
      </div>
    </div>
  )
}
