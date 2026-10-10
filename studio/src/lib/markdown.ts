import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'span']

/** Agent prose as safe HTML: GFM through marked, then an allow-list through DOMPurify. */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text.replace(/<!--[\s\S]*?-->/g, ''), { async: false }) as string
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'title'] })
  // Links leave the app: a widget-free answer may point at an account page or a source.
  return clean.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=')
}
