import { useEffect, useState } from 'react'
import { lemmaClient } from '../lemma-client'

/* Pod files in the page: short-lived download URLs, cached until they expire. */
const cache = new Map<string, { url: string; app: string; exp: number }>()
const inflight = new Map<string, Promise<{ url: string; app: string; exp: number }>>()

export function fileUrl(path: string) {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now() + 60_000) return Promise.resolve(hit)
  const pending = inflight.get(path)
  if (pending) return pending
  const p = lemmaClient.files
    .getUrl(path)
    .then((r) => {
      const v = { url: r.url, app: r.app_url, exp: Date.parse(r.expires_at) || Date.now() + 300_000 }
      cache.set(path, v)
      inflight.delete(path)
      return v
    })
    .catch((e) => {
      inflight.delete(path)
      throw e
    })
  inflight.set(path, p)
  return p
}

/** Drop cached links under a folder, after its files were replaced (a rebrand). */
export function forgetFileUrls(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
}

export function useFileUrl(path?: string | null, version?: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false })
  useEffect(() => {
    if (!path) return setState({ url: null, failed: false })
    let alive = true
    fileUrl(path)
      .then((v) => alive && setState({ url: v.url, failed: false }))
      .catch(() => alive && setState({ url: null, failed: true }))
    return () => {
      alive = false
    }
  }, [path, version])
  return state
}

export async function readText(path: string): Promise<string | null> {
  try {
    const blob = await lemmaClient.files.download(path)
    return await blob.text()
  } catch {
    return null
  }
}

/** Upload into a folder; returns the stored path. */
export async function uploadTo(directoryPath: string, name: string, blob: Blob, searchEnabled = false): Promise<string> {
  await lemmaClient.files.upload(blob, { name, directoryPath, searchEnabled })
  return `${directoryPath.replace(/\/$/, '')}/${name}`
}

/** Replace a file's bytes in place (upload onto an existing path keeps the old ones). */
export async function writeText(path: string, text: string, mime = 'text/markdown'): Promise<void> {
  const blob = new Blob([text], { type: mime })
  try {
    await lemmaClient.files.update(path, { file: blob })
  } catch {
    const dir = path.slice(0, path.lastIndexOf('/')) || '/'
    await lemmaClient.files.upload(blob, { name: path.slice(path.lastIndexOf('/') + 1), directoryPath: dir })
  }
}

export async function listDir(path: string): Promise<{ name: string; path: string; kind: string }[]> {
  try {
    const r = (await lemmaClient.files.list({ directoryPath: path, limit: 200 })) as { items?: Record<string, unknown>[] }
    return (r.items || []).map((f) => ({
      name: String(f.name || ''),
      path: String(f.path || `${path.replace(/\/$/, '')}/${f.name}`),
      kind: String(f.kind || f.type || f.file_type || ''),
    }))
  } catch {
    return []
  }
}

/** An image to show in <img>. Storage serves files as application/octet-stream,
    which browsers sniff for JPEG and PNG but refuse for SVG: an SVG is fetched as
    bytes and given its real type. */
export function useImageUrl(path?: string | null, version?: string): string | null {
  const isSvg = !!path && /\.svg$/i.test(path)
  const signed = useFileUrl(isSvg ? null : path, version).url
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!isSvg || !path) return setBlobUrl(null)
    let alive = true
    let made: string | null = null
    lemmaClient.files
      .download(path)
      .then(async (b) => {
        const svg = new Blob([await b.arrayBuffer()], { type: 'image/svg+xml' })
        made = URL.createObjectURL(svg)
        if (alive) setBlobUrl(made)
      })
      .catch(() => alive && setBlobUrl(null))
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [path, isSvg, version])
  return isSvg ? blobUrl : signed
}
