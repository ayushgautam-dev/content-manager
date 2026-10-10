import { useEffect, useState } from 'react'
import { readText } from '../lib/files'
import { renderMarkdown } from '../lib/markdown'

export function MdFile({ path, title, empty }: { path: string; title: string; empty?: string }) {
  const [text, setText] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    readText(path).then((t) => alive && setText(t))
    return () => {
      alive = false
    }
  }, [path])
  return (
    <div className="card pad">
      <h4 className="card-h">{title}</h4>
      {text === undefined ? <div className="skel" style={{ height: 80 }} /> : text ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} /> : <p className="muted small">{empty || 'Nothing here yet.'}</p>}
    </div>
  )
}
