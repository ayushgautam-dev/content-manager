import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { lemmaClient } from '../lemma-client'
import type { Draft, Founder, Idea, Item, QueueCount, SetupJob, Source, Spark, Topic, Trend } from './types'

/* One read of each table, kept fresh by the pod's change stream (never polled).
   Every table is shared with the team; drafts and sparks are shown for the
   person being worked on. */

export interface PodData {
  founders: Founder[]
  drafts: Draft[]
  ideas: Idea[]
  topics: Topic[]
  trends: Trend[]
  sparks: Spark[]
  sources: Source[]
  items: Item[]
  queue: QueueCount[]
  setup: SetupJob[]
}
export type Name = keyof PodData

const EMPTY: PodData = { founders: [], drafts: [], ideas: [], topics: [], trends: [], sparks: [], sources: [], items: [], queue: [], setup: [] }

function norm<T>(r: unknown): T {
  const row = r as Record<string, unknown>
  if (row && typeof row.data === 'object' && row.data) {
    const o = { ...(row.data as Record<string, unknown>) }
    for (const k of ['id', 'created_at', 'updated_at', 'user_id']) if (row[k] != null && o[k] == null) o[k] = row[k]
    return o as T
  }
  return row as T
}
function items<T>(resp: unknown): T[] {
  const r = resp as { items?: unknown[]; data?: unknown[]; rows?: unknown[] }
  const list = r?.items || r?.data || r?.rows || (Array.isArray(resp) ? (resp as unknown[]) : [])
  return list.map((x) => norm<T>(x))
}

const desc = (field: string) => [{ field, direction: 'desc' as const }]
const LOADERS: Record<Name, () => Promise<unknown[]>> = {
  founders: () => lemmaClient.records.list('founders', { limit: 50 }).then(items),
  drafts: () => lemmaClient.records.list('drafts', { limit: 300, sort: desc('updated_at') }).then(items),
  ideas: () => lemmaClient.records.list('ideas', { limit: 400, sort: desc('created_at') }).then(items),
  sources: () => lemmaClient.records.list('sources', { limit: 50 }).then(items),
  items: () =>
    lemmaClient.datastore
      .query("select id, source_id, title, url, publisher, published_at, headline, summary, why_it_matters, limits_note, item_type, quality_score, relevance_score, evaluated_at, status from source_items where status not in ('pending', 'rejected') order by published_at desc nulls last, coalesce(quality_score, 0) desc limit 800")
      .then(items),
  // How many fetched items are still waiting to be read, and how many were turned down, per source.
  queue: () => lemmaClient.datastore.query('select source_id, status, count(*) as n from source_items group by source_id, status').then(items),
  topics: () => lemmaClient.records.list('topics', { limit: 100 }).then(items),
  trends: () => lemmaClient.records.list('trends', { limit: 100, sort: desc('day') }).then(items),
  sparks: () => lemmaClient.records.list('sparks', { limit: 400, sort: desc('day') }).then(items),
  setup: () => lemmaClient.records.list('setup_jobs', { limit: 50, sort: desc('created_at') }).then(items),
}
const TABLE_TO_NAME: Record<string, Name> = {
  founders: 'founders', drafts: 'drafts', ideas: 'ideas', sources: 'sources', source_items: 'items',
  topics: 'topics', trends: 'trends', sparks: 'sparks', setup_jobs: 'setup',
}

interface Ctx extends PodData {
  loaded: boolean
  errors: Partial<Record<Name, string>>
  userId: string | null
  me: Founder | null
  active: Founder[]
  pickFounder: (handle: string) => void
  reload: (name: Name) => Promise<void>
  update: (table: string, id: string, data: Record<string, unknown>) => Promise<void>
  create: (table: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>
  patchLocal: (name: Name, id: string, data: Record<string, unknown>) => void
}
const DataContext = createContext<Ctx | null>(null)

export function DataProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [data, setData] = useState<PodData>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Name, string>>>({})
  const [picked, setPicked] = useState<string>(() => {
    try { return localStorage.getItem('cm-person') || '' } catch { return '' }
  })
  const timers = useRef<Partial<Record<Name, number>>>({})

  const meRef = useRef<Founder | null>(null)

  const reload = useCallback(async (name: Name) => {
    try {
      const rows = await LOADERS[name]()
      setData((d) => ({ ...d, [name]: rows }))
      setErrors((e) => ({ ...e, [name]: undefined }))
    } catch (err) {
      setErrors((e) => ({ ...e, [name]: err instanceof Error ? err.message : String(err) }))
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all((Object.keys(LOADERS) as Name[]).map(reload)).then(() => alive && setLoaded(true))
    const handle = lemmaClient.datastore.watchChanges({
      onChange: (frame) => {
        const name = TABLE_TO_NAME[frame.table_name]
        if (!name) return
        window.clearTimeout(timers.current[name])
        timers.current[name] = window.setTimeout(() => {
          void reload(name)
          if (name === 'items') void reload('queue')
        }, 600)
      },
      onError: () => undefined,
    })
    return () => {
      alive = false
      handle.close()
    }
  }, [reload])

  const update = useCallback(
    async (table: string, id: string, patch: Record<string, unknown>) => {
      const name = TABLE_TO_NAME[table]
      if (name) setData((d) => ({ ...d, [name]: (d[name] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
      await lemmaClient.records.update(table, id, patch)
      if (name) void reload(name)
    },
    [reload],
  )
  const create = useCallback(
    async (table: string, row: Record<string, unknown>) => {
      const withOwner = table === 'drafts' && meRef.current && row.owner_handle == null ? { ...row, owner_handle: meRef.current.handle } : row
      const created = norm<Record<string, unknown>>(await lemmaClient.records.create(table, withOwner))
      const name = TABLE_TO_NAME[table]
      if (name) await reload(name)
      return created
    },
    [reload],
  )
  const patchLocal = useCallback((name: Name, id: string, patch: Record<string, unknown>) => {
    setData((d) => ({ ...d, [name]: (d[name] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }, [])

  /* Studio may be used by a team on someone's behalf: the person being worked on
     is the one picked in the header, else the signed-in person, else the first
     active one. */
  const active = useMemo(() => data.founders.filter((f) => f.status !== 'paused'), [data.founders])
  const me = useMemo(
    () => active.find((f) => f.handle === picked) || active.find((f) => f.member === userId) || active[0] || null,
    [active, picked, userId],
  )
  meRef.current = me
  const pickFounder = useCallback((handle: string) => {
    setPicked(handle)
    try { localStorage.setItem('cm-person', handle) } catch { /* private mode */ }
  }, [])
  const mine = useMemo(() => data.drafts.filter((d) => !me || !d.owner_handle || d.owner_handle === me.handle), [data.drafts, me])
  const value = useMemo<Ctx>(
    () => ({ ...data, drafts: mine, loaded, errors, userId, me, active, pickFounder, reload, update, create, patchLocal }),
    [data, mine, loaded, errors, userId, me, active, pickFounder, reload, update, create, patchLocal],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function usePod(): Ctx {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('usePod outside DataProvider')
  return ctx
}
