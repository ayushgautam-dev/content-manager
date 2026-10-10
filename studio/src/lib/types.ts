export type DraftStatus = 'drafting' | 'ready' | 'approved' | 'posted' | 'killed'
export type Format = 'text' | 'image' | 'carousel' | 'video'

export interface Founder {
  id: string
  member?: string | null
  handle: string
  display_name?: string | null
  email?: string | null
  linkedin_name?: string | null
  linkedin_headline?: string | null
  linkedin_url?: string | null
  followers?: number | null
  goal_note?: string | null
  pillars?: { name: string; share: number; notes?: string }[] | string | null
  timezone?: string | null
  onboarding?: 'started' | 'setting_up' | 'done' | null
  status?: string | null
  sparks_per_day?: number | null
  company_name?: string | null
  website?: string | null
  company_linkedin_url?: string | null
  writes_about?: string | null
  wants_daily?: string | null
  anything_else?: string | null
  region?: string | null
  voice_status?: 'none' | 'building' | 'ready' | null
}

export interface Draft {
  id: string
  created_at: string
  updated_at: string
  title: string
  body?: string | null
  first_draft?: string | null
  status: DraftStatus
  format: Format
  approved_at?: string | null
  deck_dir?: string | null
  slides?: string[] | string | null
  pdf_path?: string | null
  sheet_path?: string | null
  pillar?: string | null
  hook_type?: string | null
  visual_kind?: string | null
  source?: string | null
  idea_id?: string | null
  spark_id?: string | null
  kill_reason?: string | null
  error?: string | null
  owner_handle?: string | null
  item_id?: string | null
  sources?: { label?: string; url?: string }[] | string | null
  posted_url?: string | null
  request?: string | null
  trend_id?: string | null
}

/** A source the person follows: one tab in Studio. */
export interface Source {
  id: string
  name: string
  tab_name: string
  noun_singular: string
  noun_plural: string
  type: 'papers' | 'feeds' | 'web'
  look_for?: string | null
  where?: Record<string, unknown> | string | null
  standard?: string | null
  owner_handle?: string | null
  active?: boolean | null
  sort_order?: number | null
  last_fetched_at?: string | null
}

/** One thing a source brought in, after the screener read it. */
export interface Item {
  id: string
  source_id: string
  title: string
  url?: string | null
  publisher?: string | null
  published_at?: string | null
  headline?: string | null
  summary?: string | null
  why_it_matters?: string | null
  limits_note?: string | null
  item_type?: string | null
  quality_score?: number | null
  relevance_score?: number | null
  evaluated_at?: string | null
  status: 'pending' | 'new' | 'sparked' | 'drafted' | 'skipped' | 'rejected'
}

export interface QueueCount {
  source_id: string
  status: string
  n: number
}

export interface SetupJob {
  id: string
  job: 'brand' | 'sources' | 'rules' | 'notes' | 'ideas'
  owner_handle?: string | null
  status: 'waiting' | 'working' | 'done' | 'failed'
  note?: string | null
  started_at?: string | null
  finished_at?: string | null
  created_at?: string
}

export interface Idea {
  id: string
  created_at: string
  text: string
  source: string
  owner_handle?: string | null
  status: 'new' | 'planned' | 'drafted' | 'used' | 'parked' | 'dropped'
}

export interface Topic {
  id: string
  name: string
  angle?: string | null
  owner_handle?: string | null
  keywords?: string[] | string | null
  region?: string | null
  language?: string | null
  news?: boolean | null
  reddit?: string[] | string | null
  web?: string[] | string | null
  active?: boolean | null
  last_scanned_at?: string | null
  last_scan?: Record<string, { found?: number; error?: string }> | string | null
}

export interface Trend {
  id: string
  day: string
  title: string
  summary?: string | null
  why_it_matters?: string | null
  debate?: string | null
  heat?: number | null
  topic_ids?: string[] | string | null
  sources?: { source: string; url: string; title?: string; score?: number }[] | string | null
  status?: string | null
}

export interface Spark {
  id: string
  created_at?: string
  day: string
  owner_handle: string
  stream: 'sources' | 'world' | 'you'
  kind: string
  angle: string
  hook?: string | null
  outline?: string | null
  why_now?: string | null
  evidence?: { label?: string; url?: string; source?: string }[] | string | null
  format?: string | null
  pillar?: string | null
  fresh_until?: string | null
  score?: number | null
  trend_id?: string | null
  item_id?: string | null
  image_idea?: string | null
  status: 'new' | 'saved' | 'drafted' | 'dismissed'
  dismiss_reason?: string | null
  draft_id?: string | null
}

/** Studio's look, written by the setup agent from the person's website. */
export interface Theme {
  is_default?: boolean
  company_name?: string
  colors?: Partial<Record<'bg' | 'surface' | 'ink' | 'ink_2' | 'muted' | 'line' | 'accent' | 'accent_ink' | 'accent_soft', string>>
  fonts?: { display?: string; body?: string; google_fonts_url?: string }
  logo?: string | null
  logo_on_dark?: string | null
}

export function asJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

export function slidesOf(d: Pick<Draft, 'slides'>): string[] {
  return (asJson<string[]>(d.slides, []) || []).filter(Boolean)
}

/** "Sam" from "Sam Rivera", or a fallback. */
export function firstName(f: Pick<Founder, 'display_name' | 'handle'> | null | undefined, fallback = 'you'): string {
  return (f?.display_name || '').trim().split(/\s+/)[0] || f?.handle || fallback
}
