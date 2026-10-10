import { useState } from 'react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import { lemmaClient } from '../lemma-client'
import { canCompose, composeInNewChat, workspaceUrl } from '../lib/compose'
import { firstName, type Founder } from '../lib/types'

/* Optional, and quiet: until the person has voice notes, posts use the default
   human-writing style. This card hands them to Lemma's own assistant, which
   follows /guide/voice-setup.md (paste posts, or fetch them with a key they add
   in Lemma). Studio itself never asks for a key. */

export const VOICE_PROMPT = 'Read /guide/voice-setup.md in this pod and help me make my posts sound like me.'
const HIDE_KEY = 'cm-voice-card-hidden'

export function VoiceCard({ me }: { me: Founder }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY + me.handle) === '1'
    } catch {
      return false
    }
  })
  const [copied, setCopied] = useState(false)
  const [state, setState] = useState<'idle' | 'opened' | 'standalone'>('idle')
  if (hidden || me.voice_status === 'ready') return null
  const chat = workspaceUrl(lemmaClient.podId, lemmaClient.authUrl)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(VOICE_PROMPT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }
  const start = async () => {
    if (await composeInNewChat(VOICE_PROMPT)) return setState('opened')
    setState('standalone')
    void copy()
    window.open(chat, '_blank', 'noopener')
  }
  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY + me.handle, '1')
    } catch {
      /* private mode */
    }
    setHidden(true)
  }
  return (
    <aside className="voice-card" aria-label="Make it sound like you">
      <div className="row between nowrap">
        <p className="kicker">Optional · about five minutes</p>
        <button type="button" className="icon-btn" onClick={hide} aria-label="Hide this">
          <X size={15} />
        </button>
      </div>
      <h2>Make it sound like you</h2>
      <p>
        Right now the writer uses a plain, human default style. Lemma’s assistant can learn how {firstName(me, 'you')} actually writes from past LinkedIn posts: paste a few in, or let it fetch them for you.
      </p>
      {state === 'opened' ? (
        <p className="voice-done">
          <Check size={15} /> A new chat is open with the message ready. Press send there.
        </p>
      ) : (
        <>
          <div className="voice-prompt">
            <code>{VOICE_PROMPT}</code>
            <button type="button" className="btn small" onClick={() => void copy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => void start()}>
              {canCompose() ? 'Start a chat with Lemma’s assistant' : 'Open Lemma’s assistant'} <ExternalLink size={14} />
            </button>
          </div>
          {state === 'standalone' ? (
            <p className="muted small">
              Lemma opened in a new tab and the message is copied. Start a new chat there and paste it. If the tab didn’t open, <a href={chat} target="_blank" rel="noopener noreferrer">open Lemma here</a>.
            </p>
          ) : null}
        </>
      )}
    </aside>
  )
}
