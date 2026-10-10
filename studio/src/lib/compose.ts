/* Asking the Lemma workspace to put text in a new chat's box.

   When Studio is open as an app inside Lemma, the workspace listens for a
   `lemma-compose` message from the app's frame, fills the composer of a new
   conversation with Lemma's assistant, and answers `lemma-compose-result`. It
   never sends: the person reads the text and presses enter. Opened on its own
   domain there is no workspace to ask, and this resolves false after a moment.
   (Same protocol as `composeInConversation` in lemma-sdk's browser bundle.) */

const TIMEOUT_MS = 1500

export function canCompose(): boolean {
  return typeof window !== 'undefined' && window.parent !== window
}

export function composeInNewChat(text: string): Promise<boolean> {
  const body = text.trim()
  if (!body || !canCompose()) return Promise.resolve(false)
  const id = `compose-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return new Promise((resolve) => {
    let settled = false
    const finish = (took: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener('message', hear)
      resolve(took)
    }
    const hear = (event: MessageEvent) => {
      const d = event.data as { type?: string; id?: string } | null
      if (event.source === window.parent && d && d.type === 'lemma-compose-result' && d.id === id) finish(true)
    }
    const timer = window.setTimeout(() => finish(false), TIMEOUT_MS)
    window.addEventListener('message', hear)
    try {
      window.parent.postMessage({ type: 'lemma-compose', id, text: body, newConversation: true }, '*')
    } catch {
      finish(false)
    }
  })
}

/** The pod in Lemma's own web app, where a new chat with the assistant starts. */
export function workspaceUrl(podId: string | undefined, authUrl: string | undefined, tail = ''): string {
  let origin = 'https://lemma.work'
  try {
    if (authUrl) origin = new URL(authUrl).origin
  } catch {
    /* keep the default */
  }
  return podId ? `${origin}/t/${podId}${tail}` : origin
}
