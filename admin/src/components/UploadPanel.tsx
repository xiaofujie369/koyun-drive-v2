import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Pause, Play, RotateCw, X } from 'lucide-react'
import { useUploads } from '@/lib/uploads'
import { formatEta, type UploadTask } from '@/lib/uploader'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const STATUS: Record<string, string> = { queued: '等待中', preparing: '准备中', uploading: '上传中', paused: '已暂停', completing: '正在保存', done: '已完成', error: '失败', canceled: '已取消' }

export function Bar({ value, tone = 'default', className }: { value: number; tone?: 'default' | 'warning' | 'danger'; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-primary')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function Task({ t }: { t: UploadTask }) {
  const u = useUploads()
  const pct = t.size ? (t.loaded / t.size) * 100 : t.status === 'done' ? 100 : 0
  return (
    <div className="border-t px-4 py-2.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate text-sm font-medium" title={t.name}>{t.name}</span>
        {t.status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" />}
        {t.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
        {['uploading', 'queued', 'preparing'].includes(t.status) && <Button size="icon" variant="ghost" className="h-7 w-7" title="暂停" onClick={() => u.pause(t.id)}><Pause /></Button>}
        {t.status === 'paused' && <Button size="icon" variant="ghost" className="h-7 w-7" title="继续" onClick={() => u.resume(t.id)}><Play /></Button>}
        {t.status === 'error' && <Button size="icon" variant="ghost" className="h-7 w-7" title="重试（断点续传）" onClick={() => u.retry(t.id)}><RotateCw /></Button>}
        {!['done', 'canceled', 'completing'].includes(t.status) && <Button size="icon" variant="ghost" className="h-7 w-7" title="取消" onClick={() => u.cancel(t.id)}><X /></Button>}
      </div>
      {!['done', 'canceled'].includes(t.status) && <Bar className="mt-1.5" value={pct} tone={t.status === 'error' ? 'danger' : t.status === 'paused' ? 'warning' : 'default'} />}
      <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
        <span className={cn('truncate', t.status === 'error' && 'text-destructive')}>{t.status === 'error' ? t.error : STATUS[t.status]}{t.resumed && t.status === 'uploading' ? '（续传）' : ''}{t.folderLabel ? ` → ${t.folderLabel}` : ''}</span>
        <span className="shrink-0 tabular-nums">
          {formatBytes(t.status === 'done' ? t.size : t.loaded)} / {formatBytes(t.size)}
          {t.status === 'uploading' && t.speed > 0 && ` · ${formatBytes(t.speed)}/s · ${formatEta(t.size - t.loaded, t.speed)}`}
        </span>
      </div>
    </div>
  )
}

export default function UploadPanel() {
  const u = useUploads()
  const [collapsed, setCollapsed] = useState(false)
  if (!u.tasks.length) return null
  const totals = u.totals
  const active = u.active
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-card shadow-2xl">
      <div className="flex cursor-pointer items-center gap-2 bg-muted/50 px-4 py-2.5" onClick={() => setCollapsed((c) => !c)}>
        <span className="flex-1 truncate text-sm font-semibold">
          {active ? `正在上传 ${active} 个文件 · ${formatBytes(totals.speed)}/s` : '上传完成'}
        </span>
        {!active && <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); u.clearFinished() }}>清空</Button>}
        {active > 0 && <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); u.pauseAll() }}>全部暂停</Button>}
        {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>
      {active > 0 && <Bar className="h-1 rounded-none" value={totals.size ? (totals.loaded / totals.size) * 100 : 0} />}
      {!collapsed && <div className="max-h-[45vh] overflow-y-auto">{u.tasks.map((t) => <Task key={t.id} t={t} />)}</div>}
    </div>
  )
}
