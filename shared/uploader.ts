// Resumable chunked uploader shared by the user frontend and the admin panel.
// Session calls (start / complete / cancel) go to the page's own origin with the
// login cookie; chunk bodies go to `chunk_url`, which may be the dedicated upload
// domain (no Cloudflare body limit), authorised by a per-upload token.

export type UploadStatus = 'queued' | 'preparing' | 'uploading' | 'paused' | 'completing' | 'done' | 'error' | 'canceled'

export interface UploadTask {
  id: number
  file: File
  name: string
  size: number
  folderId: number | null
  folderLabel: string
  status: UploadStatus
  loaded: number
  speed: number
  error: string
  resumed: boolean
  startedAt: number
  result?: { id: number; name: string }
}

interface Session {
  id: string
  token: string
  chunk_size: number
  total_chunks: number
  uploaded: number[]
  chunk_url: string
}

interface Runtime {
  session?: Session
  pending: number[]
  done: Set<number>
  inflight: Map<number, { xhr: XMLHttpRequest; loaded: number }>
  doneBytes: number
  lastSample: { t: number; bytes: number }
  sameOrigin: boolean
  crossFailures: number
}

export interface UploaderOptions {
  chunkConcurrency?: number
  fileConcurrency?: number
  onChange: () => void
  onFileDone?: (task: UploadTask) => void
}

const MAX_ATTEMPTS = 8

function xsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `请求失败 (${res.status})`) as Error & { status: number; data: unknown }
    err.status = res.status
    err.data = data
    throw err
  }
  return data as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class Uploader {
  tasks: UploadTask[] = []
  private rt = new Map<number, Runtime>()
  private seq = 0
  private opts: Required<Omit<UploaderOptions, 'onFileDone'>> & Pick<UploaderOptions, 'onFileDone'>
  private ticker: number | undefined

  constructor(opts: UploaderOptions) {
    this.opts = { chunkConcurrency: 3, fileConcurrency: 2, ...opts }
  }

  add(files: File[] | FileList, folderId: number | null, folderLabel = '') {
    for (const file of Array.from(files)) {
      this.tasks.push({
        id: ++this.seq, file, name: file.name, size: file.size, folderId, folderLabel,
        status: 'queued', loaded: 0, speed: 0, error: '', resumed: false, startedAt: 0,
      })
    }
    this.changed()
    this.pump()
  }

  get active() {
    return this.tasks.filter((t) => ['queued', 'preparing', 'uploading', 'completing'].includes(t.status)).length
  }

  get totals() {
    const live = this.tasks.filter((t) => t.status !== 'canceled')
    return {
      size: live.reduce((s, t) => s + t.size, 0),
      loaded: live.reduce((s, t) => s + (t.status === 'done' ? t.size : t.loaded), 0),
      speed: live.reduce((s, t) => s + (t.status === 'uploading' ? t.speed : 0), 0),
    }
  }

  pause(id: number) {
    const t = this.find(id)
    if (!t || !['queued', 'preparing', 'uploading'].includes(t.status)) return
    t.status = 'paused'
    t.speed = 0
    this.abortInflight(id)
    this.changed()
    this.pump()
  }

  resume(id: number) {
    const t = this.find(id)
    if (!t || !['paused', 'error'].includes(t.status)) return
    t.status = 'queued'
    t.error = ''
    this.changed()
    this.pump()
  }

  retry(id: number) {
    this.resume(id)
  }

  async cancel(id: number) {
    const t = this.find(id)
    if (!t || t.status === 'done') return
    const prev = t.status
    t.status = 'canceled'
    t.speed = 0
    this.abortInflight(id)
    const sid = this.rt.get(id)?.session?.id
    this.rt.delete(id)
    this.changed()
    this.pump()
    if (sid && prev !== 'completing') await api('DELETE', `/kd/uploads/${sid}`).catch(() => {})
  }

  pauseAll() { this.tasks.forEach((t) => this.pause(t.id)) }
  resumeAll() { this.tasks.forEach((t) => this.resume(t.id)) }

  clearFinished() {
    this.tasks = this.tasks.filter((t) => !['done', 'canceled'].includes(t.status))
    this.changed()
  }

  // ------------------------------------------------------------ internals

  private find(id: number) { return this.tasks.find((t) => t.id === id) }

  private changed() {
    this.opts.onChange()
    const busy = this.tasks.some((t) => t.status === 'uploading')
    if (busy && this.ticker === undefined) {
      this.ticker = window.setInterval(() => this.sampleSpeed(), 1000)
    } else if (!busy && this.ticker !== undefined) {
      clearInterval(this.ticker)
      this.ticker = undefined
    }
  }

  private sampleSpeed() {
    const now = performance.now()
    for (const t of this.tasks) {
      const r = this.rt.get(t.id)
      if (!r || t.status !== 'uploading') continue
      const dt = (now - r.lastSample.t) / 1000
      if (dt <= 0) continue
      const inst = Math.max(0, (t.loaded - r.lastSample.bytes) / dt)
      t.speed = t.speed ? t.speed * 0.6 + inst * 0.4 : inst
      r.lastSample = { t: now, bytes: t.loaded }
    }
    this.opts.onChange()
  }

  private abortInflight(id: number) {
    const r = this.rt.get(id)
    if (!r) return
    r.inflight.forEach(({ xhr }) => xhr.abort())
    r.inflight.clear()
  }

  private pump() {
    const running = this.tasks.filter((t) => ['preparing', 'uploading', 'completing'].includes(t.status)).length
    let slots = this.opts.fileConcurrency - running
    for (const t of this.tasks) {
      if (slots <= 0) break
      if (t.status === 'queued') {
        slots--
        void this.start(t)
      }
    }
  }

  private async start(t: UploadTask) {
    t.status = 'preparing'
    t.error = ''
    this.changed()
    try {
      const session = await api<Session>('POST', '/kd/uploads', {
        name: t.name, size: t.size, mime_type: t.file.type || null, folder_id: t.folderId,
        fingerprint: `${t.name}:${t.size}:${t.file.lastModified}`,
      })
      if ((t.status as UploadStatus) !== 'preparing') return // paused or canceled meanwhile
      const done = new Set(session.uploaded)
      const prev = this.rt.get(t.id)
      const r: Runtime = {
        session, done, inflight: new Map(),
        pending: Array.from({ length: session.total_chunks }, (_, i) => i).filter((i) => !done.has(i)),
        doneBytes: 0, lastSample: { t: performance.now(), bytes: 0 },
        sameOrigin: prev?.sameOrigin ?? !session.chunk_url.startsWith('http'),
        crossFailures: 0,
      }
      r.doneBytes = [...done].reduce((s, i) => s + this.chunkLen(session, t.size, i), 0)
      this.rt.set(t.id, r)
      t.resumed = done.size > 0
      t.loaded = r.doneBytes
      r.lastSample.bytes = t.loaded
      t.startedAt = t.startedAt || Date.now()
      t.status = 'uploading'
      this.changed()

      await Promise.all(Array.from({ length: this.opts.chunkConcurrency }, () => this.worker(t, r)))
      if ((t.status as UploadStatus) !== 'uploading') return
      if (r.done.size !== session.total_chunks) throw new Error('部分分片上传失败')

      t.status = 'completing'
      t.speed = 0
      this.changed()
      const res = await api<{ file: { id: number; name: string } }>('POST', `/kd/uploads/${session.id}/complete`)
      t.status = 'done'
      t.loaded = t.size
      t.result = res.file
      this.rt.delete(t.id)
      this.changed()
      this.opts.onFileDone?.(t)
    } catch (e) {
      // status may have been changed by pause()/cancel() while awaiting
      const status = t.status as UploadStatus
      if (status === 'paused' || status === 'canceled') return
      const err = e as Error & { status?: number }
      if (err.status === 404 && this.rt.get(t.id)?.session) {
        this.rt.delete(t.id) // session expired on the server: start over
        t.status = 'queued'
      } else {
        t.status = 'error'
        t.error = err.message || '上传失败'
      }
      t.speed = 0
      this.changed()
    } finally {
      this.pump()
    }
  }

  private chunkLen(s: Session, size: number, i: number) {
    return i === s.total_chunks - 1 ? size - s.chunk_size * (s.total_chunks - 1) : s.chunk_size
  }

  private async worker(t: UploadTask, r: Runtime) {
    const s = r.session!
    while (t.status === 'uploading') {
      const index = r.pending.shift()
      if (index === undefined) return
      let attempt = 0
      for (;;) {
        if (t.status !== 'uploading') { r.pending.unshift(index); return }
        try {
          await this.sendChunk(t, r, s, index)
          r.done.add(index)
          r.doneBytes += this.chunkLen(s, t.size, index)
          break
        } catch (e) {
          const err = e as Error & { status?: number; fatal?: boolean }
          if (t.status !== 'uploading') { r.pending.unshift(index); return }
          if (err.fatal || ++attempt >= MAX_ATTEMPTS) throw err
          await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)))
        }
      }
    }
  }

  private sendChunk(t: UploadTask, r: Runtime, s: Session, index: number): Promise<void> {
    const start = index * s.chunk_size
    const blob = t.file.slice(start, start + this.chunkLen(s, t.size, index))
    const url = (r.sameOrigin ? `/kd/uploads/${s.id}/chunks/` : s.chunk_url) + index
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      r.inflight.set(index, { xhr, loaded: 0 })
      const progress = () => {
        let inflight = 0
        r.inflight.forEach((v) => { inflight += v.loaded })
        t.loaded = Math.min(t.size, r.doneBytes + inflight)
        this.opts.onChange()
      }
      xhr.upload.onprogress = (ev) => {
        const entry = r.inflight.get(index)
        if (entry) entry.loaded = ev.loaded
        progress()
      }
      xhr.onload = () => {
        r.inflight.delete(index)
        if (xhr.status >= 200 && xhr.status < 300) {
          r.crossFailures = 0
          progress()
          resolve()
          return
        }
        let msg = `分片上传失败 (${xhr.status})`
        try { msg = JSON.parse(xhr.responseText).error || msg } catch { /* not json */ }
        const err = new Error(msg) as Error & { status: number; fatal: boolean }
        err.status = xhr.status
        err.fatal = [404, 409, 410, 413, 507].includes(xhr.status)
        progress()
        reject(err)
      }
      xhr.onerror = () => {
        r.inflight.delete(index)
        // The upload domain may be unreachable/misconfigured: fall back to this origin.
        if (!r.sameOrigin && ++r.crossFailures >= 2) r.sameOrigin = true
        progress()
        reject(new Error('网络错误，正在重试'))
      }
      xhr.onabort = () => {
        r.inflight.delete(index)
        reject(new Error('已暂停'))
      }
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.setRequestHeader('X-Upload-Token', s.token)
      xhr.timeout = 10 * 60 * 1000
      xhr.ontimeout = () => { r.inflight.delete(index); reject(new Error('分片上传超时，正在重试')) }
      xhr.send(blob)
    })
  }
}

export function formatBytes(n: number) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatEta(remaining: number, speed: number) {
  if (!speed || remaining <= 0) return ''
  const s = Math.round(remaining / speed)
  if (s < 60) return `${s} 秒`
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
}
