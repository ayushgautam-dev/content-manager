import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConversationMessages, useConversations } from 'lemma-sdk/react'
import type { ConversationMessage } from 'lemma-sdk'
import { ArrowUp, Check, ChevronDown, ChevronRight, Copy, History, Loader2, LogIn, Maximize2, Minimize2, Plus, Sparkles, Square, X } from 'lucide-react'
import { lemmaClient } from '../lemma-client'
import { ago } from '../lib/time'
import { renderMarkdown } from '../lib/markdown'
import { go, href } from '../lib/route'

/* The pod assistant, beside the work — as a panel on any page (⌘K) or as a full
   page (#/chat) with your conversations down the side. It is the one you talk to:
   it knows the pod (its shared memory) and you (your personal memory), and hands
   writing to the writer and scanning to the scout. Every message carries
   "[Studio] [Viewing: …]" so "this draft" means the one on screen; pages show its
   changes live. Pattern from the Customers app in Lemma Shri 33. */

// The panel talks to the writer, who has the pod's tables, files and renderer.
const AGENT: string | undefined = 'writer'
const HISTORY_AGENT = 'writer'
const PREFIX = /^\[Studio\]\s*(?:\[Viewing: ([^\]]*)\]\s*)?/

export interface Suggestion {
  label: string
  prompt: string
}

type Thread = ReturnType<typeof useConversationMessages>
type Convo = { id: string; title?: string | null; updated_at?: string | null; created_at?: string | null }

interface AskApi {
  ask: (prompt: string) => void
  open: () => void
  toggle: () => void
  isOpen: boolean
  setContext: (context: string, suggestions: Suggestion[]) => void
}
const AskContext = createContext<AskApi>({ ask: () => undefined, open: () => undefined, toggle: () => undefined, isOpen: false, setContext: () => undefined })
export const useAsk = () => useContext(AskContext)

interface ChatState {
  thread: Thread
  conversationId: string | null
  history: Convo[]
  context: string
  suggestions: Suggestion[]
  error: string
  send: (t: string) => void
  newChat: () => void
  pick: (id: string) => void
}
const ChatContext = createContext<ChatState | null>(null)

/** Tell the writer what this page is about while it's mounted. */
export function useAskContext(context: string, suggestions: Suggestion[]) {
  const { setContext } = useAsk()
  const key = context + '|' + suggestions.map((s) => s.label).join('|')
  useEffect(() => setContext(context, suggestions), [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function AskProvider({ fullPage, children }: { fullPage: boolean; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sendError, setSendError] = useState('')
  const [ctx, setCtx] = useState<{ context: string; suggestions: Suggestion[] }>({ context: '', suggestions: [] })
  const thread = useConversationMessages({ client: lemmaClient, agentName: AGENT, conversationId, syncOnTurnEnd: true })
  const history = useConversations({ client: lemmaClient, agentName: HISTORY_AGENT, limit: 40 })
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Paused runs (`wait_for`, or a LinkedIn sign-in being completed in another tab)
  // have no stream to follow, so check back until they move again.
  const paused = useMemo(() => {
    const last = [...thread.messages].reverse().find((m) => m.kind === 'TOOL_CALL' || (m.role === 'assistant' && m.kind === 'TEXT' && (m.text || '').trim()))
    return last?.kind === 'TOOL_CALL' && (last.tool_name === 'wait_for' || last.tool_name === 'browser_sign_in')
  }, [thread.messages])
  const resumeRef = useRef(thread.resumeIfRunning)
  resumeRef.current = thread.resumeIfRunning
  const refreshRef = useRef(thread.refresh)
  refreshRef.current = thread.refresh
  useEffect(() => {
    if (!conversationId || !paused || thread.isRunning) return
    const t = window.setInterval(() => {
      resumeRef.current(conversationId).then((running) => (running ? undefined : refreshRef.current())).catch(() => undefined)
    }, 5000)
    return () => window.clearInterval(t)
  }, [conversationId, paused, thread.isRunning])

  /** Sent from the click that asked — never from an effect, never awaited. */
  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim()
      if (!prompt) return
      setSendError('')
      const where = ctxRef.current.context
      const content = '[Studio] ' + (where ? `[Viewing: ${where}]\n` : '') + prompt
      try {
        let id = conversationId
        let known = null
        if (!id) {
          const created = await thread.createConversation({ title: prompt.slice(0, 80) })
          id = created.id
          known = created
          setConversationId(created.id)
        }
        thread.sendMessage(content, { conversationId: id, knownConversation: known, syncOnTurnEnd: true }).then(
          () => history.refresh(),
          (err: unknown) => setSendError(err instanceof Error ? err.message : String(err)),
        )
      } catch (err) {
        setSendError(err instanceof Error ? err.message : String(err))
      }
    },
    [conversationId, thread, history],
  )

  const newChat = useCallback(() => {
    setConversationId(null)
    setSendError('')
  }, [])
  const pick = useCallback(
    (id: string) => {
      setConversationId(id)
      setSendError('')
      window.setTimeout(() => void thread.resumeIfRunning(id).catch(() => undefined), 300)
    },
    [thread],
  )

  const api = useMemo<AskApi>(
    () => ({
      ask: (p) => {
        if (!fullPage) setOpen(true)
        void send(p)
      },
      open: () => setOpen(true),
      toggle: () => setOpen((v) => !v),
      isOpen,
      setContext: (context, suggestions) => setCtx({ context, suggestions }),
    }),
    [send, isOpen, fullPage],
  )

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!fullPage) setOpen(true)
      } else if (e.key === 'Escape' && isOpen) setOpen(false)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [isOpen, fullPage])

  const chat: ChatState = {
    thread,
    conversationId,
    history: history.conversations as Convo[],
    context: ctx.context,
    suggestions: ctx.suggestions,
    error: sendError || thread.error?.message || '',
    send: (t) => void send(t),
    newChat,
    pick,
  }

  return (
    <AskContext.Provider value={api}>
      <ChatContext.Provider value={chat}>
        <div className={isOpen && !fullPage ? 'with-drawer' : ''}>{children}</div>
        {fullPage ? null : isOpen ? (
          <aside className="ask-drawer" aria-label="Writer">
            <ChatHeader onClose={() => setOpen(false)} />
            <ChatThread />
            <Composer />
          </aside>
        ) : (
          <AskBar suggestions={ctx.suggestions} onSend={api.ask} onOpen={api.open} running={thread.isRunning} />
        )}
      </ChatContext.Provider>
    </AskContext.Provider>
  )
}

function useChat(): ChatState {
  const c = useContext(ChatContext)
  if (!c) throw new Error('useChat outside AskProvider')
  return c
}

/* ---------- the full page ---------- */

export function ChatPage() {
  const { history, conversationId, newChat, pick, thread } = useChat()
  useAskContext('the chat page', [
    { label: 'Plan this week’s posts', prompt: 'Look at today’s ideas, the unused items from my sources and recent drafts, and propose three posts for this week with formats. Then draft the first one.' },
    { label: 'Draft from today’s stream', prompt: 'Pick the strongest angle in today’s stream and draft it.' },
    { label: 'What do you know about me?', prompt: 'Summarise my notes: how I write, my material, my preferences. Plain words.' },
    { label: 'Follow something new', prompt: 'I want you to watch something new for me. Ask me what it is in one short question, then add it as a source or a news topic.' },
  ])
  return (
    <div className="chat-page">
      <aside className="chat-side" aria-label="Conversations">
        <button type="button" className="btn primary block" onClick={newChat}>
          <Plus size={16} /> New chat
        </button>
        <nav className="chat-list">
          {history.length ? (
            history.map((c) => (
              <button key={c.id} type="button" className="chat-item" aria-current={c.id === conversationId ? 'true' : undefined} onClick={() => pick(c.id)}>
                <span className="chat-item-title">{cleanTitle(c.title)}</span>
                <span className="muted small">{ago(c.updated_at || c.created_at)}</span>
              </button>
            ))
          ) : (
            <p className="muted small">No conversations yet.</p>
          )}
        </nav>
      </aside>
      <section className="chat-main">
        <header className="chat-main-head">
          <span className="ask-title">
            <Sparkles size={16} aria-hidden="true" /> Writer
          </span>
          {thread.isRunning ? (
            <span className="badge sched">
              <Loader2 size={12} className="spin" /> working
            </span>
          ) : null}
        </header>
        <ChatThread wide />
        <Composer wide />
      </section>
    </div>
  )
}

/* ---------- pieces shared by the panel and the page ---------- */

function ChatHeader({ onClose }: { onClose: () => void }) {
  const { history, conversationId, newChat, pick } = useChat()
  const [showHistory, setShowHistory] = useState(false)
  return (
    <header className="ask-head">
      <span className="ask-title">
        <Sparkles size={15} aria-hidden="true" /> Writer
      </span>
      <div className="ask-head-tools">
        <button type="button" className="icon-btn" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} title="Earlier conversations">
          <History size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={newChat} title="New chat">
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            onClose()
            go(href.chat())
          }}
          title="Open as a full page"
        >
          <Maximize2 size={15} />
        </button>
        <button type="button" className="icon-btn" onClick={onClose} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      {showHistory ? (
        <ul className="ask-history">
          {history.length ? (
            history.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={c.id === conversationId ? 'true' : undefined}
                  onClick={() => {
                    pick(c.id)
                    setShowHistory(false)
                  }}
                >
                  <span className="ask-history-title">{cleanTitle(c.title)}</span>
                  <span className="muted small">{ago(c.updated_at || c.created_at)}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="muted small ask-history-empty">No earlier conversations yet.</li>
          )}
        </ul>
      ) : null}
    </header>
  )
}

function ChatThread({ wide }: { wide?: boolean }) {
  const { thread, conversationId, suggestions, context, error, send } = useChat()
  const scroller = useRef<HTMLDivElement>(null)
  const blocks = useMemo(() => toBlocks(thread.messages), [thread.messages])
  const busy = thread.isRunning || thread.isStreaming
  const lastStep = useMemo(() => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.kind === 'steps') return b.steps[b.steps.length - 1]?.text
    }
    return ''
  }, [blocks])
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [blocks.length, thread.streamingText, lastStep])
  return (
    <div className={'ask-body' + (wide ? ' wide' : '')} ref={scroller}>
      <div className="ask-col">
        {!conversationId && !blocks.length ? (
          <div className="ask-start">
            <div className="ask-start-mark">
              <Sparkles size={22} />
            </div>
            <h2>The writer</h2>
            <p className="ask-start-lead">It knows your sources, the news it follows for you and how you write. Ask it to draft from an idea or a note, rewrite what’s on screen, turn a post into a carousel, change the slide design, or follow something new. Changes show up on the page as it makes them.</p>
            {context ? <p className="muted small">Looking at: {context.replace(/\s*\(id [^)]*\)\s*$/, '')}</p> : null}
            <div className="ask-start-group">
              {suggestions.map((s) => (
                <button key={s.label} type="button" onClick={() => send(s.prompt)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {thread.isLoading && !blocks.length ? <p className="muted small">Loading the conversation…</p> : null}
        {blocks.map((b, i) =>
          b.kind === 'user' ? (
            <div key={b.id} className="ask-user">
              {b.context ? <span className="ask-context">on {b.context}</span> : null}
              <p>{b.text}</p>
            </div>
          ) : b.kind === 'text' ? (
            <Answer key={b.id} text={b.text} />
          ) : b.kind === 'signin' ? (
            <SignInCard key={b.id} conversationId={conversationId} toolCallId={b.toolCallId} origin={b.origin} done={b.done} />
          ) : (
            <Steps key={b.id} steps={b.steps} live={busy && i === blocks.length - 1} />
          ),
        )}
        {thread.streamingText ? <div className="ask-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.streamingText) }} /> : null}
        {busy && !thread.streamingText ? (
          <p className="ask-working">
            <Loader2 size={14} className="spin" /> {lastStep || 'Thinking'}…
          </p>
        ) : null}
        {error ? <p className="notice bad small">{error}</p> : null}
      </div>
    </div>
  )
}

function Composer({ wide }: { wide?: boolean }) {
  const { thread, send } = useChat()
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const busy = thread.isRunning || thread.isStreaming
  useEffect(() => box.current?.focus(), [])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(220, Math.max(34, el.scrollHeight)) + 'px'
  }, [text])
  const submit = () => {
    if (!text.trim() || busy) return
    send(text)
    setText('')
  }
  return (
    <form
      className={'ask-compose' + (wide ? ' wide' : '')}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="ask-compose-box">
        <textarea
          ref={box}
          value={text}
          rows={1}
          placeholder={busy ? 'Working… you can type your next message' : 'Ask, or tell it what to change'}
          aria-label="Message the writer"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy ? (
          <button type="button" className="ask-send stop" onClick={() => void thread.stop()} aria-label="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" className="ask-send" disabled={!text.trim()} aria-label="Send">
            <ArrowUp size={16} />
          </button>
        )}
      </div>
      <p className="ask-hint">Enter to send · Shift+Enter for a new line</p>
    </form>
  )
}

function Answer({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="ask-answer">
      <div className="ask-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
      <button
        type="button"
        className="icon-btn ask-copy"
        title="Copy"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

/** One turn's tool calls as a single block: the live step while it works, a
    one-line summary once it's done, every step on demand. */
function Steps({ steps, live }: { steps: Step[]; live: boolean }) {
  const [open, setOpen] = useState(false)
  const failed = steps.filter((s) => s.failed).length
  if (live) {
    const tail = steps.slice(-3)
    return (
      <div className="ask-steps live">
        {steps.length > 3 ? (
          <button type="button" className="ask-steps-toggle" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {steps.length - 3} earlier steps
          </button>
        ) : null}
        {(open ? steps : tail).map((s) => (
          <p key={s.id} className={'ask-trace' + (s.failed ? ' failed' : '')}>
            {s.text}
          </p>
        ))}
      </div>
    )
  }
  return (
    <div className="ask-steps">
      <button type="button" className="ask-steps-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {steps.length} step{steps.length === 1 ? '' : 's'}
        {failed ? <span className="muted"> · {failed} retried</span> : null}
        {!open ? <span className="ask-steps-peek"> · {steps[steps.length - 1]?.text}</span> : null}
      </button>
      {open
        ? steps.map((s) => (
            <p key={s.id} className={'ask-trace' + (s.failed ? ' failed' : '')}>
              {s.text}
            </p>
          ))
        : null}
    </div>
  )
}

/** The writer paused for a LinkedIn sign-in: the person signs in themselves, in a
    live view of their own Lemma browser. The run resumes when they're done. */
function SignInCard({ conversationId, toolCallId, origin, done }: { conversationId: string | null; toolCallId: string; origin: string; done: boolean }) {
  const base = new URL(lemmaClient.authUrl || location.origin).origin
  const link = conversationId ? `${base}/sign-in-to-site/${conversationId}/${toolCallId}` : null
  if (done) return <p className="ask-trace">Signed in to {origin}</p>
  return (
    <div className="ask-signin">
      <p>
        Your assistant needs you to sign in to <strong>{origin}</strong> in your own Lemma browser. You type your password there; it never sees it.
      </p>
      {link ? (
        <a className="btn primary" href={link} target="_blank" rel="noopener noreferrer">
          <LogIn size={15} /> Sign in to LinkedIn
        </a>
      ) : null}
    </div>
  )
}

function AskBar({ suggestions, onSend, onOpen, running }: { suggestions: Suggestion[]; onSend: (p: string) => void; onOpen: () => void; running: boolean }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <div className="ask-dock" onFocus={() => setFocused(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setFocused(false)}>
      {focused && !text && suggestions.length ? (
        <div className="ask-suggest" role="list" aria-label="Suggestions">
          {suggestions.slice(0, 6).map((s) => (
            <button key={s.label} type="button" role="listitem" onMouseDown={(e) => e.preventDefault()} onClick={() => onSend(s.prompt)}>
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return onOpen()
          onSend(text)
          setText('')
        }}
      >
        <Sparkles size={16} className="ask-bar-icon" aria-hidden="true" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={running ? 'Working… open to watch' : 'Ask the writer: draft, rewrite, make slides'} aria-label="Ask the writer" />
        {running ? (
          <button type="button" className="ask-bar-open" onClick={onOpen}>
            <Loader2 size={13} className="spin" /> Open
          </button>
        ) : (
          <kbd className="ask-kbd" aria-hidden="true">
            ⌘K
          </kbd>
        )}
        <button type="submit" className="ask-send" aria-label="Ask" disabled={!text.trim() && !running}>
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  )
}

/** The header's Chat button: opens the panel (or the page on small screens). */
export function ChatButton({ onPage }: { onPage: boolean }) {
  const { toggle, isOpen } = useAsk()
  const { thread } = useChat()
  return (
    <button
      type="button"
      className={'btn chat-btn' + (isOpen || onPage ? ' on' : '')}
      onClick={() => (window.innerWidth < 760 ? go(href.chat()) : onPage ? go(href.ideas()) : toggle())}
      aria-pressed={isOpen || onPage}
      aria-label="Writer"
    >
      {thread.isRunning ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} <span className="lbl">Ask the writer</span>
    </button>
  )
}

export function ExitFullChat() {
  return (
    <button type="button" className="icon-btn" onClick={() => history.back()} title="Back">
      <Minimize2 size={15} />
    </button>
  )
}

function cleanTitle(t?: string | null): string {
  return (t || 'Untitled').replace(PREFIX, '').replace(/^Studio: /, '')
}

/* ---------- messages → what we draw ---------- */

interface Step {
  id: string
  text: string
  failed: boolean
}
type Block =
  | { kind: 'user'; id: string; text: string; context: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'signin'; id: string; toolCallId: string; origin: string; done: boolean }
  | { kind: 'steps'; id: string; steps: Step[] }

const QUIET = new Set(['search_tools', 'load_skill', 'final_result', 'write_todos', 'todo_write', 'update_plan', 'function_my_profile'])
const READS = new Set(['pod_read_file', 'pod_search_files', 'pod_list_files'])

function args(m: ConversationMessage): Record<string, unknown> {
  const a = m.tool_args as unknown
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const r = a as Record<string, unknown>
    return r.request && typeof r.request === 'object' ? (r.request as Record<string, unknown>) : r
  }
  if (typeof a === 'string') {
    try {
      return JSON.parse(a) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

/** Say what the step was for, in the writer's own words when it gave any. */
function stepLabel(name: string, a: Record<string, unknown>): string {
  const said = typeof a.comment === 'string' ? a.comment.trim() : typeof a.description === 'string' ? a.description.trim() : ''
  if (said) return said.charAt(0).toUpperCase() + said.slice(1)
  const path = String(a.path || '')
  switch (name) {
    case 'pod_query':
    case 'pod_get_records':
    case 'pod_tables':
      return 'Read your drafts and ideas'
    case 'pod_write_record':
      return 'Saved to the pod'
    case 'pod_read_file':
      return path.includes('/agents/') ? 'Read what it remembers about you' : `Read ${path.split('/').pop() || 'a file'}`
    case 'pod_search_files':
    case 'pod_list_files':
      return 'Looked through your files'
    case 'pod_write_file':
    case 'pod_edit_file':
      return path.includes('/agents/') ? 'Remembered something about you' : `Saved ${path.split('/').pop() || 'a file'}`
    case 'exec_command':
    case 'execute_python':
    case 'manage_process':
      return 'Worked in its sandbox'
    case 'view_image':
      return 'Looked at the slides'
    case 'web_search':
      return a.query ? `Searched the web for “${String(a.query).slice(0, 60)}”` : 'Searched the web'
    case 'web_fetch':
      return 'Read a web page'
    case 'agent_analyst':
      return 'Asked the analyst'
    case 'spawn_subagent':
    case 'spawn_agent':
      return a.agent_name ? `Handed it to the ${String(a.agent_name)}` : 'Started a helper'
    case 'interact_subagent':
    case 'query_subagents':
      return 'Checked on the helper'
    case 'function_scan_sources':
      return 'Scanned the radar sources'
    case 'message_user':
      return 'Sent a message'
    case 'display_resource':
      return 'Showed a file'
    case 'wait_for':
      return 'Waited ' + (Number(a.seconds) || 30) + 's'
    default:
      return name.replace(/^function_/, 'Ran ').replace(/_/g, ' ')
  }
}

function failedResult(m: ConversationMessage): boolean {
  const r = m.tool_result as unknown
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return o.success === false || (typeof o.error === 'string' && o.error.length > 0)
}

function toBlocks(messages: ConversationMessage[]): Block[] {
  const out: Block[] = []
  const returned = new Set(messages.filter((m) => m.kind === 'TOOL_RETURN').map((m) => m.tool_call_id))
  const failed = new Set(messages.filter((m) => m.kind === 'TOOL_RETURN' && failedResult(m) && !READS.has(m.tool_name || '')).map((m) => m.tool_call_id))
  for (const m of messages) {
    const id = m.id || String(m.sequence)
    if (m.role === 'user' && m.kind === 'TEXT') {
      const raw = m.text || ''
      const match = raw.match(PREFIX)
      out.push({ kind: 'user', id, text: match ? raw.slice(match[0].length) : raw, context: (match?.[1] || '').replace(/\s*\(id [^)]*\)\s*$/, '') })
    } else if (m.role === 'assistant' && m.kind === 'TEXT' && (m.text || '').trim()) {
      out.push({ kind: 'text', id, text: m.text || '' })
    } else if (m.kind === 'TOOL_CALL' && m.tool_name) {
      const a = args(m)
      if (m.tool_name === 'browser_sign_in' && m.tool_call_id) {
        let origin = String(a.origin || 'linkedin.com')
        try {
          origin = new URL(origin).hostname
        } catch {
          /* already a host */
        }
        out.push({ kind: 'signin', id, toolCallId: m.tool_call_id, origin, done: returned.has(m.tool_call_id) })
        continue
      }
      if (QUIET.has(m.tool_name)) continue
      const step = { id, text: stepLabel(m.tool_name, a), failed: failed.has(m.tool_call_id) }
      const prev = out[out.length - 1]
      if (prev && prev.kind === 'steps') {
        const last = prev.steps[prev.steps.length - 1]
        if (last && last.text.replace(/ ×\d+$/, '') === step.text) {
          const n = Number(last.text.match(/×(\d+)$/)?.[1] || 1) + 1
          last.text = step.text + ' ×' + n
          last.failed = last.failed || step.failed
        } else prev.steps.push(step)
      } else out.push({ kind: 'steps', id, steps: [step] })
    }
  }
  return out
}
