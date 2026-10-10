import { useEffect, useState } from 'react'

export type Route =
  | { page: 'ideas' }
  | { page: 'drafts'; id?: string }
  | { page: 'source'; id: string }
  | { page: 'news' }
  | { page: 'voice' }
  | { page: 'chat' }
  | { page: 'welcome' }

export function parse(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, '').split('/')
  switch (page) {
    case 'drafts':
      return { page: 'drafts', id: id || undefined }
    case 'source':
      return id ? { page: 'source', id } : { page: 'ideas' }
    case 'news':
    case 'voice':
    case 'chat':
    case 'welcome':
      return { page }
    default:
      return { page: 'ideas' }
  }
}

export const href = {
  ideas: () => '#/ideas',
  drafts: (id?: string) => (id ? `#/drafts/${id}` : '#/drafts'),
  source: (id: string) => `#/source/${id}`,
  news: () => '#/news',
  voice: () => '#/voice',
  chat: () => '#/chat',
  welcome: () => '#/welcome',
}

export function go(to: string) {
  if (location.hash !== to) location.hash = to
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
