import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { lemmaClient } from '../lemma-client'
import { usePod } from './data'

/* Work handed to the writer in the background ("revise this", "draft that idea",
   "re-render my edited slides"). The writer's reply is not read: the app watches
   `drafts`, and a job is done when its draft changes after it was asked. */

export interface Job {
  key: string // "draft:<id>" or "idea:<id>"
  label: string
  since: string
  conversationId?: string
}

interface Ctx {
  jobs: Record<string, Job>
  ask: (key: string, label: string, message: string, agent?: string) => Promise<void>
  clear: (key: string) => void
}
const PendingContext = createContext<Ctx | null>(null)
const STORE = 'studio-jobs'

function load(): Record<string, Job> {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}') as Record<string, Job>
  } catch {
    return {}
  }
}

export function PendingProvider({ children, onToast }: { children: ReactNode; onToast: (m: string) => void }) {
  const [jobs, setJobs] = useState<Record<string, Job>>(load)
  const { drafts, sparks, topics, trends, items, queue, setup, me } = usePod()
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(jobs))
    } catch {
      /* private mode */
    }
  }, [jobs])

  // Settle jobs from the live drafts table.
  useEffect(() => {
    const done: string[] = []
    for (const job of Object.values(jobs)) {
      const since = Date.parse(job.since)
      if (Date.now() - since > (job.key.startsWith('setup:') ? 45 : 25) * 60_000) {
        done.push(job.key)
        continue
      }
      if (job.key.startsWith('draft:')) {
        const d = drafts.find((x) => x.id === job.key.slice(6))
        if (d && Date.parse(d.updated_at) > since + 1500 && d.status !== 'drafting') {
          done.push(job.key)
          onToast(`Done: “${d.title}”.`)
        }
      } else if (job.key.startsWith('spark:')) {
        const d = drafts.find((x) => x.spark_id === job.key.slice(6) && x.status === 'ready')
        if (d) {
          done.push(job.key)
          onToast(`New draft ready: “${d.title}”.`)
        }
      } else if (job.key.startsWith('items:')) {
        const sourceId = job.key.split(':')[1]
        const waiting = queue.filter((q) => q.source_id === sourceId && q.status === 'pending').reduce((n, q) => n + Number(q.n || 0), 0)
        if (!waiting && Date.now() - since > 90_000 && (items.some((p) => p.source_id === sourceId && Date.parse(p.evaluated_at || '') > since) || Date.now() - since > 8 * 60_000)) {
          done.push(job.key)
          onToast('Finished checking for new ones.')
        }
      } else if (job.key.startsWith('setup:')) {
        const mine = setup.filter((j) => j.owner_handle === job.key.slice(6))
        if (mine.length && mine.every((j) => j.status === 'done' || j.status === 'failed')) done.push(job.key)
      } else if (job.key.startsWith('trend:')) {
        const d = drafts.find((x) => x.trend_id === job.key.slice(6) && Date.parse(x.created_at) > since - 2000 && x.status === 'ready')
        if (d) {
          done.push(job.key)
          onToast(`New draft ready: “${d.title}”.`)
        }
      } else if (job.key.startsWith('note:')) {
        const d = drafts.find((x) => Date.parse(x.created_at) > since - 2000 && x.status === 'ready' && x.source === 'manual' && !x.spark_id)
        if (d) {
          done.push(job.key)
          onToast(`New draft ready: “${d.title}”.`)
        }
      } else if (job.key.startsWith('item:')) {
        const d = drafts.find((x) => x.item_id === job.key.slice(5) && Date.parse(x.created_at) > since - 2000 && x.status === 'ready')
        if (d) {
          done.push(job.key)
          onToast(`New draft ready: “${d.title}”.`)
        }
      } else if (job.key.startsWith('stream:')) {
        const n = sparks.filter((x) => x.stream === 'you' && x.owner_handle === me?.handle && Date.parse(x.created_at || '') > since).length
        if (n) {
          done.push(job.key)
          onToast(`Added ${n} idea${n > 1 ? 's' : ''} from your own stories.`)
        }
      } else if (job.key.startsWith('radar:')) {
        if (sparks.some((x) => Date.parse(x.created_at || '') > since)) {
          done.push(job.key)
          onToast('New post ideas are ready.')
        }
      } else if (job.key.startsWith('topic:')) {
        const t = topics.find((x) => x.id === job.key.slice(6))
        if (t?.last_scanned_at && Date.parse(t.last_scanned_at) > since) {
          done.push(job.key)
          onToast(`Scanned “${t.name}”.`)
        }
      } else if (job.key.startsWith('idea:')) {
        const d = drafts.find((x) => x.idea_id === job.key.slice(5) && Date.parse(x.created_at) > since - 2000 && x.status === 'ready')
        if (d) {
          done.push(job.key)
          onToast(`New draft ready: “${d.title}”.`)
        }
      }
    }
    if (done.length) setJobs((j) => Object.fromEntries(Object.entries(j).filter(([k]) => !done.includes(k))))
  }, [drafts, sparks, topics, trends, items, queue, setup, me, jobs, onToast])

  const ask = useCallback(
    async (key: string, label: string, message: string, agent = 'writer') => {
      setJobs((j) => ({ ...j, [key]: { key, label, since: new Date().toISOString() } }))
      try {
        const conv = (await lemmaClient.agents.run(agent, message, { title: 'Studio: ' + label })) as { id?: string }
        setJobs((j) => (j[key] ? { ...j, [key]: { ...j[key], conversationId: conv?.id } } : j))
      } catch (err) {
        setJobs((j) => Object.fromEntries(Object.entries(j).filter(([k]) => k !== key)))
        onToast(`Couldn't reach the ${agent}: ` + (err instanceof Error ? err.message : String(err)))
      }
    },
    [onToast],
  )
  const clear = useCallback((key: string) => setJobs((j) => Object.fromEntries(Object.entries(j).filter(([k]) => k !== key))), [])
  const value = useMemo(() => ({ jobs, ask, clear }), [jobs, ask, clear])
  return <PendingContext.Provider value={value}>{children}</PendingContext.Provider>
}

export function usePending(): Ctx {
  const ctx = useContext(PendingContext)
  if (!ctx) throw new Error('usePending outside PendingProvider')
  return ctx
}
