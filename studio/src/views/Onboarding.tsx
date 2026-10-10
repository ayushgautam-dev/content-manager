import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useCurrentUser } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { usePod } from '../lib/data'
import { usePending } from '../lib/pending'
import { go, href } from '../lib/route'
import { ago, dayKeyIn, safeTz } from '../lib/time'
import { firstName, type Founder, type SetupJob } from '../lib/types'
import { useToast } from '../components/Ui'

/* Five questions, one to a page, then the pod sets itself up while the person
   watches. No forms full of fields: the setup agent works the rest out from the
   website and the answers. */

type Answers = { website: string; linkedin: string; company: string; about: string; daily: string; extra: string }
const BLANK: Answers = { website: '', linkedin: '', company: '', about: '', daily: '', extra: '' }
const DRAFT_KEY = 'cm-onboarding-draft'

const ABOUT_STARTERS = ['What I learn running the company', 'Trends in my industry', 'Lessons from building a team', 'Our customers’ problems and how we solve them']
const DAILY_STARTERS = ['New research in my field', 'News about my industry', 'Competitors’ launches and announcements', 'Funding rounds in my space', 'New rules and regulation that affect us']

function url(v: string): string {
  const t = v.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : 'https://' + t.replace(/^\/+/, '')
}
function looksLikeSite(v: string) {
  try {
    const u = new URL(url(v))
    return /\.[a-z]{2,}$/i.test(u.hostname)
  } catch {
    return false
  }
}
function looksLikeProfile(v: string) {
  return /linkedin\.com\/(in|pub)\/[^/?#\s]+/i.test(v)
}
function looksLikeCompany(v: string) {
  return !v.trim() || /linkedin\.com\/(company|school|showcase)\/[^/?#\s]+/i.test(v)
}

function handleFor(seed: string, taken: string[]): string {
  const base = (seed || 'me')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20) || 'me'
  let h = base
  for (let i = 2; taken.includes(h); i++) h = base + i
  return h
}

export function Onboarding({ adding }: { adding?: boolean }) {
  const { founders, create } = usePod()
  const { ask } = usePending()
  const toast = useToast()
  const { user } = useCurrentUser({ client: lemmaClient })
  const [step, setStep] = useState(0)
  const [a, setA] = useState<Answers>(() => {
    try {
      return { ...BLANK, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Partial<Answers>) }
    } catch {
      return BLANK
    }
  })
  const [showCompany, setShowCompany] = useState(!!a.company)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(a))
    } catch {
      /* private mode: answers last for this visit */
    }
  }, [a])
  const set = (k: keyof Answers) => (v: string) => setA((x) => ({ ...x, [k]: v }))
  const u = user as { id?: string; email?: string; first_name?: string; last_name?: string; name?: string } | null | undefined
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.name || ''

  const steps = [
    {
      q: 'What’s your company’s website?',
      help: 'We read it to pick up your colours, logo and fonts, and to learn what your company does.',
      ok: looksLikeSite(a.website),
      body: <input className="box ob-input" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={a.website} onChange={(e) => set('website')(e.target.value)} placeholder="yourcompany.com" aria-label="Company website" />,
    },
    {
      q: 'Your LinkedIn profile',
      help: 'The posts are written for this profile. Nothing is fetched from LinkedIn now, and nothing is ever posted for you.',
      ok: looksLikeProfile(a.linkedin) && looksLikeCompany(a.company),
      body: (
        <>
          <input className="box ob-input" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={a.linkedin} onChange={(e) => set('linkedin')(e.target.value)} placeholder="linkedin.com/in/your-name" aria-label="LinkedIn profile URL" />
          {a.linkedin && !looksLikeProfile(a.linkedin) ? <p className="ob-warn">That doesn’t look like a profile link. It should contain linkedin.com/in/…</p> : null}
          {showCompany ? (
            <>
              <label className="ob-sub" htmlFor="ob-company">
                Company page <span className="muted">Optional</span>
              </label>
              <input id="ob-company" className="box ob-input" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={a.company} onChange={(e) => set('company')(e.target.value)} placeholder="linkedin.com/company/your-company" />
            </>
          ) : (
            <button type="button" className="btn ghost ob-more" onClick={() => setShowCompany(true)}>
              Add your company page too (optional)
            </button>
          )}
        </>
      ),
    },
    {
      q: 'What do you write about?',
      help: 'In your own words. The topics you want to be known for, and who you’re writing for.',
      ok: a.about.trim().length >= 12,
      body: <Area value={a.about} onChange={set('about')} placeholder="e.g. How small software teams ship faster, for engineering managers at startups." starters={ABOUT_STARTERS} />,
    },
    {
      q: 'What should we bring you each day?',
      help: 'Where post ideas should come from. News in your field is always included; add anything else you want watched.',
      ok: a.daily.trim().length >= 6,
      body: <Area value={a.daily} onChange={set('daily')} placeholder="e.g. New research on developer productivity, and launches from the tools we compete with." starters={DAILY_STARTERS} />,
    },
    {
      q: 'Anything else we should know?',
      help: 'Topics to stay away from, rules in your field, how you like to sound. You can skip this and tell the writer later.',
      ok: true,
      body: <Area value={a.extra} onChange={set('extra')} placeholder="e.g. Never mention clients by name. Keep it practical, no hype." />,
    },
  ]
  const s = steps[step]
  const last = step === steps.length - 1

  const start = async () => {
    setBusy(true)
    try {
      const seed = name.split(' ')[0] || (u?.email || '').split('@')[0] || a.linkedin.match(/\/in\/([^/?#]+)/i)?.[1] || 'me'
      const handle = handleFor(seed, founders.map((f) => f.handle))
      const lang = (navigator.language || 'en-US').split('-')
      await create('founders', {
        handle,
        member: adding ? undefined : u?.id,
        display_name: name || seed,
        email: adding ? undefined : u?.email,
        website: url(a.website),
        linkedin_url: url(a.linkedin),
        company_linkedin_url: url(a.company) || undefined,
        writes_about: a.about.trim(),
        wants_daily: a.daily.trim(),
        anything_else: a.extra.trim() || undefined,
        region: (lang[1] || 'US').toUpperCase().slice(0, 2),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        onboarding: 'setting_up',
        status: 'active',
        voice_status: 'none',
        sparks_per_day: 5,
      })
      for (const job of ['brand', 'sources', 'rules', 'notes']) await create('setup_jobs', { job, owner_handle: handle, status: 'waiting' })
      await ask('setup:' + handle, 'Setting up', `[setup] ${handle}`, 'setup')
      try {
        localStorage.removeItem(DRAFT_KEY)
        localStorage.setItem('cm-person', handle)
      } catch {
        /* private mode */
      }
      go(href.ideas())
    } catch (e) {
      toast('Couldn’t start setup: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }
  const next = () => (last ? void start() : setStep(step + 1))

  return (
    <div className="ob">
      <div className="ob-card">
        <p className="kicker ob-step">
          {step === 0 && !adding ? 'Welcome · ' : ''}Question {step + 1} of {steps.length}
        </p>
        <div className="ob-dots" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (s.ok && !busy) next()
          }}
        >
          <h1 className="ob-q">{s.q}</h1>
          <p className="ob-help">{s.help}</p>
          {s.body}
          <div className="row between ob-nav">
            {step > 0 ? (
              <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} /> Back
              </button>
            ) : adding ? (
              <a className="btn ghost" href={href.ideas()}>
                Cancel
              </a>
            ) : (
              <span />
            )}
            <button type="submit" className="btn primary ob-go" disabled={!s.ok || busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {last ? (busy ? 'Starting…' : a.extra.trim() ? 'Set it up' : 'Skip and set it up') : 'Next'} {!last ? <ArrowRight size={16} /> : null}
            </button>
          </div>
        </form>
      </div>
      {step === 0 && !adding ? (
        <p className="ob-foot muted small">
          Content Studio finds things worth posting about, drafts LinkedIn posts with their images in your brand, and waits for you to approve. It never posts anything itself.
        </p>
      ) : null}
    </div>
  )
}

function Area({ value, onChange, placeholder, starters }: { value: string; onChange: (v: string) => void; placeholder: string; starters?: string[] }) {
  return (
    <>
      <textarea className="box ob-area" autoFocus rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {starters ? (
        <div className="chips">
          {starters.map((s) => (
            <button key={s} type="button" onClick={() => onChange((value.trim() ? value.trimEnd() + (/[.!?]$/.test(value.trim()) ? ' ' : '. ') : '') + s + '.')}>
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

/* ---------- While setup runs ---------- */

const JOBS: { job: SetupJob['job']; doing: string; done: string }[] = [
  { job: 'brand', doing: 'Picking up your colours and logo', done: 'Your colours and logo' },
  { job: 'sources', doing: 'Setting up what to watch for you', done: 'What to watch for you' },
  { job: 'rules', doing: 'Checking the rules for your field', done: 'Rules for your field' },
  { job: 'notes', doing: 'Writing first notes about you', done: 'First notes about you' },
]
const SEEN_KEY = 'cm-setup-seen-'

/** Show the progress page until the person moves on (remembered per browser). */
export function useShowProgress(me: Founder | null, setup: SetupJob[]): [boolean, () => void] {
  const key = me ? SEEN_KEY + me.handle : ''
  const [seen, setSeen] = useState<Record<string, boolean>>({})
  const stored = (() => {
    try {
      return key ? localStorage.getItem(key) === '1' : false
    } catch {
      return false
    }
  })()
  const dismiss = () => {
    if (!key) return
    try {
      localStorage.setItem(key, '1')
    } catch {
      /* private mode: dismissed for this visit */
    }
    setSeen((x) => ({ ...x, [key]: true }))
  }
  if (!me || seen[key] || stored) return [false, dismiss]
  return [setup.some((j) => j.owner_handle === me.handle), dismiss]
}

export function Progress({ me, onLeave }: { me: Founder; onLeave: () => void }) {
  const { setup, sparks } = usePod()
  const { jobs, ask } = usePending()
  const mine = useMemo(() => {
    const rows = setup.filter((j) => j.owner_handle === me.handle)
    return JOBS.map((d) => ({ ...d, row: rows.find((r) => r.job === d.job) }))
  }, [setup, me.handle])
  const started = mine.map((j) => j.row?.created_at || j.row?.started_at).filter(Boolean).sort()[0]
  const finished = mine.every((j) => j.row && (j.row.status === 'done' || j.row.status === 'failed'))
  const doneCount = mine.filter((j) => j.row?.status === 'done').length
  const minutes = started ? (Date.now() - Date.parse(started)) / 60_000 : 0
  const slow = !finished && minutes > 25
  const today = dayKeyIn(new Date(), safeTz(me.timezone))
  const finding = jobs['radar:' + today]
  const haveIdeas = sparks.some((s) => s.owner_handle === me.handle && s.status === 'new')
  const leave = () => {
    go(href.ideas())
    onLeave()
  }
  const findIdeas = () => void ask('radar:' + today, 'Finding your first ideas', '[daily-radar] The person just finished setup and asked for their first ideas from Studio. Run the radar as your instruction describes. Nobody is watching: never ask anyone anything.', 'scout')
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="ob">
      <div className="ob-card">
        <p className="kicker ob-step">{finished ? 'All set' : 'Setting up'}</p>
        <h1 className="ob-q">{finished ? `Ready when you are, ${firstName(me)}.` : `Getting your studio ready, ${firstName(me)}.`}</h1>
        <p className="ob-help">
          {finished
            ? 'Your look, your sources and your first notes are in place. Next, the scout reads today’s news and your sources and suggests about five posts.'
            : `This takes about ten minutes${started ? ` (started ${ago(started)})` : ''}. You can leave this page; it carries on without you.`}
        </p>
        <ol className="ob-jobs">
          {mine.map((j) => {
            const st = j.row?.status || 'waiting'
            return (
              <li key={j.job} className={'ob-job ' + st}>
                <span className="ob-mark" aria-hidden="true">
                  {st === 'done' ? <Check size={15} /> : st === 'working' ? <span className="pulse" /> : st === 'failed' ? '!' : null}
                </span>
                <span className="min0">
                  <b>{st === 'done' ? j.done : j.doing}</b>
                  {j.row?.note ? <span className="ob-note">{j.row.note}</span> : st === 'waiting' ? <span className="ob-note muted">Waiting to start</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
        {slow ? (
          <p className="ob-warn">
            This is taking longer than usual.{' '}
            <button type="button" className="linkish" onClick={() => void ask('setup:' + me.handle, 'Setting up', `[setup] ${me.handle}`, 'setup')}>
              Start it again
            </button>{' '}
            or carry on: whatever finished is already in place.
          </p>
        ) : null}
        <div className="row between ob-nav">
          <button type="button" className="btn ghost" onClick={leave}>
            {finished ? 'Go to the studio' : 'Look around meanwhile'}
          </button>
          {finished ? (
            haveIdeas ? (
              <button type="button" className="btn primary ob-go" onClick={leave}>
                See your first ideas <ArrowRight size={16} />
              </button>
            ) : finding ? (
              <span className="writing ob-finding">
                <span className="pulse" aria-hidden="true" />
                <span>
                  <strong>The scout is on it.</strong> Your first ideas arrive in about ten minutes.
                </span>
              </span>
            ) : (
              <button type="button" className="btn primary ob-go" onClick={findIdeas}>
                Find my first ideas <ArrowRight size={16} />
              </button>
            )
          ) : (
            <span className="muted small">{doneCount} of {JOBS.length} done</span>
          )}
        </div>
      </div>
    </div>
  )
}
