import { useEffect, useState } from 'react'
import { usePod } from '../lib/data'
import { useAsk, useAskContext } from '../components/Ask'
import { readText, useFileUrl } from '../lib/files'
import { renderMarkdown } from '../lib/markdown'
import { NotSetUp } from '../components/Ui'
import { VoiceCard } from '../components/VoiceCard'
import { href } from '../lib/route'
import { firstName } from '../lib/types'

/* Voice: what the writer believes about this person, to read, not to edit. It
   changes when people edit, approve or remove drafts, or tell the writer something. */

const TABS: { key: string; label: string; file: string; blurb: string }[] = [
  { key: 'voice', label: 'How you write', file: 'memory/voice.md', blurb: 'Learned from your past posts, and sharpened every time a draft is edited, approved or removed. Until then the writer uses a plain, human default style.' },
  { key: 'about', label: 'What the writer knows', file: 'memory/about.md', blurb: 'Stories, facts and numbers the writer may use. Nothing else gets into a post.' },
  { key: 'prefs', label: 'Likes and dislikes', file: 'memory/preferences.md', blurb: 'Formats and topics to lean into or avoid.' },
  { key: 'strategy', label: 'Who it’s for', file: 'strategy.md', blurb: 'Audience, topics and what never to post.' },
]

export function Voice() {
  const { me, loaded } = usePod()
  const { ask, open } = useAsk()
  const [tab, setTab] = useState('voice')
  const [text, setText] = useState<Record<string, string | null>>({})
  const headshot = useFileUrl(me ? `/people/${me.handle}/headshot.jpg` : null)
  const first = firstName(me)
  useAskContext('my voice notes', [
    { label: 'Summarise it for me', prompt: 'Summarise in plain words what you know about how I write and what I like.' },
    { label: 'Learn from recent edits', prompt: 'Look at recent drafts where the final text differs from the first draft, and update the voice notes.' },
  ])
  const t = TABS.find((x) => x.key === tab)!
  const path = me ? `/people/${me.handle}/${t.file}` : ''
  useEffect(() => {
    if (!path || text[path] !== undefined) return
    let alive = true
    void readText(path).then((v) => alive && setText((x) => ({ ...x, [path]: v ?? '' })))
    return () => {
      alive = false
    }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loaded && !me) return <NotSetUp />
  if (!me) return null
  const body = text[path]
  return (
    <div className="page narrow">
      <header className="who">
        {headshot.url ? <img className="who-photo" src={headshot.url} alt="" /> : <span className="who-photo">{first.charAt(0)}</span>}
        <div className="min0">
          <p className="kicker">The writer’s notes</p>
          <h1 className="view">{me.display_name || me.handle}</h1>
          {me.linkedin_headline ? <p className="muted">{me.linkedin_headline}</p> : null}
        </div>
      </header>
      <p className="lede">
        Everything the writer reads before drafting a post for {first}. You don’t edit this by hand: it learns from the drafts you change, approve or remove. To correct something, tell the writer.
      </p>
      <VoiceCard me={me} />
      <div className="filters" role="tablist" aria-label="Notes">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} aria-pressed={tab === x.key} onClick={() => setTab(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <section className="reading">
        <p className="muted">{t.blurb}</p>
        {body === undefined || body === null ? <div className="skel" style={{ height: 220 }} /> : body ? <div className="md prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} /> : <p className="muted">Nothing noted yet.</p>}
      </section>
      <div className="row">
        <button type="button" className="btn" onClick={() => open()}>
          Tell the writer to change something
        </button>
        <button type="button" className="btn ghost" onClick={() => ask(`Summarise in plain words what you know about how ${me.display_name || me.handle} writes.`)}>
          Summarise it for me
        </button>
        <span className="grow" />
        <a className="btn ghost" href={href.welcome()}>
          Add another person
        </a>
      </div>
    </div>
  )
}
