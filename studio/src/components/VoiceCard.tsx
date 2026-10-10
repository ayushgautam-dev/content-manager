import { useState } from 'react'
import { ArrowUpRight, Loader2, X } from 'lucide-react'
import { lemmaClient } from '../lemma-client'
import { workspaceUrl } from '../lib/compose'
import type { Founder } from '../lib/types'

/* Optional, and quiet: until the person has voice notes, posts use the default
   human-writing style. One click starts a chat with Lemma's own assistant, sends
   it the prompt below, and opens that chat in a new tab. The assistant follows
   /guide/voice-setup.md (paste posts, or fetch them with a key the person adds in
   Lemma). Studio itself never asks for a key. */

export const VOICE_PROMPT = 'Read /guide/voice-setup.md in this pod and help me make my posts sound like me.'
const HIDE_KEY = 'cm-voice-card-hidden'
const CHAT_KEY = 'cm-voice-chat'

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: lasts for this visit */
  }
}

export function VoiceCard({ me }: { me: Founder }) {
  const [hidden, setHidden] = useState(() => remembered(HIDE_KEY + me.handle) === '1')
  const [chatId, setChatId] = useState(() => remembered(CHAT_KEY + me.handle))
  const [state, setState] = useState<'idle' | 'starting' | 'failed'>('idle')
  if (hidden || me.voice_status === 'ready') return null
  const podId = lemmaClient.podId
  const chatUrl = (id?: string | null) => workspaceUrl(podId, lemmaClient.authUrl, id ? `/conversation/${id}` : '')

  const start = async () => {
    // Open the tab inside the click, so the browser does not block it, then point it at the chat.
    const tab = window.open('about:blank', '_blank')
    setState('starting')
    try {
      const conv = (await lemmaClient.conversations.create({ title: 'Make my posts sound like me' })) as { id: string }
      // The reply streams into the chat; the new tab shows it as it arrives.
      void lemmaClient.conversations.messages.send(conv.id, { content: VOICE_PROMPT }).catch(() => undefined)
      remember(CHAT_KEY + me.handle, conv.id)
      setChatId(conv.id)
      setState('idle')
      if (tab) {
        tab.opener = null
        tab.location.href = chatUrl(conv.id)
      }
      else window.open(chatUrl(conv.id), '_blank', 'noopener')
    } catch {
      setState('failed')
      try {
        await navigator.clipboard.writeText(VOICE_PROMPT)
      } catch {
        /* the message is shown below instead */
      }
      if (tab) tab.location.href = chatUrl()
    }
  }
  const hide = () => {
    remember(HIDE_KEY + me.handle, '1')
    setHidden(true)
  }

  return (
    <aside className="voice-card" aria-label="Make it sound like you">
      <div className="voice-text">
        <h2>Make it sound like you</h2>
        <p>
          {chatId
            ? 'Your chat with Lemma’s assistant is open. It learns your voice from your past posts.'
            : 'Optional. Lemma’s assistant learns your voice from your past LinkedIn posts.'}
        </p>
        {state === 'failed' ? (
          <p className="voice-fail">
            Couldn’t start the chat. Lemma opened in a new tab and this message is copied, so paste it there: <i>{VOICE_PROMPT}</i>
          </p>
        ) : null}
      </div>
      <div className="voice-actions">
        {chatId ? (
          <a className="btn" href={chatUrl(chatId)} target="_blank" rel="noopener noreferrer">
            Open the chat <ArrowUpRight size={15} />
          </a>
        ) : (
          <button type="button" className="btn" disabled={state === 'starting'} onClick={() => void start()}>
            {state === 'starting' ? <Loader2 size={15} className="spin" /> : null} Set it up <ArrowUpRight size={15} />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={hide} aria-label="Hide this">
          <X size={15} />
        </button>
      </div>
    </aside>
  )
}
